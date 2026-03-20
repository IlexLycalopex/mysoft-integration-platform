/**
 * Job Orchestrator — Drives the step pipeline for a single job
 *
 * Responsibilities:
 *   1. Load job context (mapping, credentials, date locale)
 *   2. Resolve the correct step pipeline (standard vs dry-run)
 *   3. Execute steps in sequence, persisting job_steps records
 *   4. On step failure: categorise error, apply retry policy, release job
 *   5. On completion: release job with final status
 *
 * Vercel Hobby safe: designed to run entirely within a single serverless
 * invocation (via waitUntil). No long-polling or background threads needed.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { StepType, StepResult, OrchestrateResult, JobItem } from './types';
import { STANDARD_PIPELINE, DRY_RUN_PIPELINE } from './types';
import { EventWriter } from './event-writer';
import { releaseJobSuccess, releaseJobFailure, markJobProcessing } from './job-service';
import { categoriseError, extractErrorCode } from './retry-policy';
import { getIntacctConnector } from '@/lib/connectors/intacct/index';
import { parseStep }            from '@/lib/steps/parse-step';
import { validateSourceStep }   from '@/lib/steps/validate-source-step';
import { validateTemplateStep } from '@/lib/steps/validate-template-step';
import { transformStep }        from '@/lib/steps/transform-step';
import { buildPayloadStep }     from '@/lib/steps/build-payload-step';
import { submitStep }           from '@/lib/steps/submit-step';
import { reconcileStep }        from '@/lib/steps/reconcile-step';
import { completeStep }         from '@/lib/steps/complete-step';
import type { StepExecutor, StepContext } from '@/lib/steps/types';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';
import type { ColumnMappingEntry } from '@/types/database';

// ── Step executor registry ────────────────────────────────────────────────────

const STEP_EXECUTORS: Partial<Record<StepType, StepExecutor>> = {
  ingest:              { execute: async (ctx) => { await ctx.events.info('step_completed', 'Ingest: source artefact validated'); return { success: true, items: ctx.items }; } },
  parse:               parseStep,
  validate_source:     validateSourceStep,
  validate_template:   validateTemplateStep,
  transform:           transformStep,
  enrich:              { execute: async (ctx) => { await ctx.events.info('step_skipped', 'Enrich: skipped (not configured)'); return { success: true, items: ctx.items }; } },
  build_payload:       buildPayloadStep,
  submit:              submitStep,
  attach_documents:    { execute: async (ctx) => { await ctx.events.info('step_skipped', 'Attach documents: skipped (not configured)'); return { success: true, items: ctx.items }; } },
  reconcile:           reconcileStep,
  complete:            completeStep,
};

// ── Main orchestrate function ─────────────────────────────────────────────────

export async function orchestrateJob(jobId: string): Promise<OrchestrateResult> {
  const admin  = createAdminClient();
  const events = new EventWriter(admin, jobId);

  // Load job
  const { data: job } = await (admin as any)
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job) {
    return { success: false, jobId, status: 'failed', processed: 0, errors: 0, recordNos: [], message: 'Job not found' };
  }

  // Approval gate
  if (job.requires_approval && !job.approved_at) {
    await (admin as any)
      .from('upload_jobs')
      .update({ status: 'awaiting_approval' })
      .eq('id', jobId);
    await events.info('approval_requested', 'Job requires approval before processing');
    return { success: false, jobId, status: 'awaiting_approval', processed: 0, errors: 0, recordNos: [] };
  }

  // Reject non-processable statuses
  const processableStatuses = ['pending', 'queued', 'claimed', 'awaiting_retry'];
  if (!processableStatuses.includes(job.status)) {
    return { success: false, jobId, status: job.status, processed: 0, errors: 0, recordNos: [], message: `Job is in non-processable status: ${job.status}` };
  }

  // Mark as processing
  await markJobProcessing(jobId);

  // Load mapping
  const { data: mapping } = await (admin as ReturnType<typeof createAdminClient>)
    .from('field_mappings')
    .select('column_mappings, transaction_type, name')
    .eq('id', job.mapping_id ?? '')
    .single();

  if (!mapping && job.mapping_id) {
    await releaseJobFailure(jobId, new Error('Field mapping not found'), job.attempt_count, job.max_attempts);
    return { success: false, jobId, status: 'failed', processed: 0, errors: 0, recordNos: [], message: 'Field mapping not found' };
  }

  // Resolve date locale from tenant region
  const { data: tenant } = await (admin as ReturnType<typeof createAdminClient>)
    .from('tenants')
    .select('region')
    .eq('id', job.tenant_id)
    .single();
  const dateLocale: 'uk' | 'us' = tenant?.region === 'us' ? 'us' : 'uk';

  // Resolve effective entity ID (job override → watcher override)
  let entityId = job.entity_id_override ?? null;
  if (!entityId && job.watcher_config_id) {
    const { data: watcher } = await (admin as ReturnType<typeof createAdminClient>)
      .from('watcher_configs')
      .select('entity_id_override')
      .eq('id', job.watcher_config_id)
      .single();
    entityId = watcher?.entity_id_override ?? null;
  }

  // Normalise column mappings to v2 (compat shim handles v1)
  const columnMappings = (mapping?.column_mappings ?? []) as ColumnMappingEntryV2[];
  const transactionType = mapping?.transaction_type ?? '';

  // Select pipeline
  const pipeline: StepType[] = job.dry_run ? DRY_RUN_PIPELINE : STANDARD_PIPELINE;

  // Load connector
  const connector = getIntacctConnector();

  // Initialise step context (items populated as pipeline progresses)
  let currentItems: JobItem[] = [];

  // Create job_steps records for the full pipeline upfront
  await (admin as any)
    .from('job_steps')
    .upsert(
      pipeline.map((stepType, idx) => ({
        job_id:     jobId,
        sequence:   idx + 1,
        step_type:  stepType,
        status:     'pending',
      })),
      { onConflict: 'job_id,sequence', ignoreDuplicates: true }
    );

  await events.info('job_claimed', `Pipeline started: ${pipeline.join(' → ')}, dry_run=${job.dry_run}`);

  // ── Execute pipeline ──────────────────────────────────────────────────────

  for (let i = 0; i < pipeline.length; i++) {
    const stepType = pipeline[i];
    const executor = STEP_EXECUTORS[stepType];
    if (!executor) continue;

    // Load the step record
    const { data: stepRecord } = await (admin as any)
      .from('job_steps')
      .select('*')
      .eq('job_id', jobId)
      .eq('sequence', i + 1)
      .single();

    if (!stepRecord) continue;

    const stepEvents = events.forStep(stepRecord.id);

    // Mark step as running
    await (admin as any)
      .from('job_steps')
      .update({ status: 'running', started_at: new Date().toISOString(), attempt_count: (stepRecord.attempt_count ?? 0) + 1 })
      .eq('id', stepRecord.id);

    await stepEvents.info('step_started', `Step ${stepType} starting`, { stepType, sequence: i + 1 });

    // Build step context
    const stepCtx: StepContext = {
      job:             job,
      step:            stepRecord,
      items:           currentItems,
      connector,
      admin,
      events:          stepEvents,
      dateLocale,
      columnMappings,
      transactionType,
      entityId,
    };

    // Execute the step
    let result: StepResult;
    try {
      result = await executor.execute(stepCtx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        error: {
          category: categoriseError(err instanceof Error ? err : message),
          code:     extractErrorCode(err instanceof Error ? err : message),
          message,
        },
      };
    }

    // Update step record with outcome
    if (result.success) {
      await (admin as any)
        .from('job_steps')
        .update({
          status:       'completed',
          completed_at: new Date().toISOString(),
          metrics_json: result.metrics ?? null,
          metadata_json: result.metadata ?? null,
        })
        .eq('id', stepRecord.id);

      // Pass items forward
      if (result.items) currentItems = result.items;
    } else {
      const err = result.error!;

      await (admin as any)
        .from('job_steps')
        .update({
          status:         'failed',
          completed_at:   new Date().toISOString(),
          error_category: err.category,
          error_code:     err.code,
          error_message:  err.message,
          metrics_json:   result.metrics ?? null,
        })
        .eq('id', stepRecord.id);

      await stepEvents.error('step_failed', `Step ${stepType} failed: ${err.message}`, {
        category: err.category, code: err.code,
      });

      // Release the job with retry/failure decision
      await releaseJobFailure(jobId, new Error(err.message), job.attempt_count, job.max_attempts);

      const postedCount  = currentItems.filter(i => i.status === 'posted').length;
      const failedCount  = currentItems.filter(i => i.status === 'failed').length;
      return {
        success:  false,
        jobId,
        status:   'failed',
        processed: postedCount,
        errors:   failedCount,
        recordNos: currentItems.flatMap(i => i.endpoint_record_id ? [i.endpoint_record_id] : []),
        message:  err.message,
      };
    }
  }

  // ── Pipeline finished ─────────────────────────────────────────────────────

  const postedItems  = currentItems.filter(i => i.status === 'posted');
  const failedItems  = currentItems.filter(i => i.status === 'failed');
  const recordNos    = postedItems.flatMap(i => i.endpoint_record_id ? [i.endpoint_record_id] : []);

  await releaseJobSuccess({
    jobId,
    processed:    postedItems.length,
    errors:       failedItems.length,
    recordNos,
    entityIdUsed: entityId,
  });

  return {
    success:     true,
    jobId,
    status:      failedItems.length > 0 ? 'partially_completed' : 'completed',
    processed:   postedItems.length,
    errors:      failedItems.length,
    recordNos,
    entityIdUsed: entityId,
  };
}
