/**
 * Job Service — core job lifecycle operations
 *
 * Handles: claim, release, retry scheduling, dead-letter transitions,
 * source artefact creation, and job querying. All DB mutations here.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getRetryDecision, extractErrorCode } from './retry-policy';
import { writeJobEvent } from './event-writer';
import type { Job, JobStatus, ErrorCategory, OrchestrateResult, SourceArtefact } from './types';

// ── Source artefact ───────────────────────────────────────────────────────────

export interface CreateArtefactParams {
  tenantId: string;
  sourceMethod: SourceArtefact['source_method'];
  storagePath: string;
  originalFilename: string;
  fileHash?: string | null;
  fileSize?: number | null;
  contentType?: string;
  remotePath?: string;
  sourceEndpoint?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an immutable source artefact record.
 * Called once per inbound payload, before job creation.
 */
export async function createSourceArtefact(params: CreateArtefactParams): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await (admin as ReturnType<typeof createAdminClient>)
    .from('source_artefacts')
    .insert({
      tenant_id:         params.tenantId,
      source_method:     params.sourceMethod,
      storage_location:  params.storagePath,
      original_filename: params.originalFilename,
      file_hash:         params.fileHash ?? null,
      file_size:         params.fileSize ?? null,
      content_type:      params.contentType ?? null,
      remote_path:       params.remotePath ?? null,
      source_endpoint:   params.sourceEndpoint ?? null,
      received_at:       new Date().toISOString(),
      raw_metadata_json: params.metadata ?? null,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) throw new Error(`Failed to create source artefact: ${error?.message}`);
  return data.id;
}

// ── Job fetch ─────────────────────────────────────────────────────────────────

export async function getJob(jobId: string): Promise<Job | null> {
  const admin = createAdminClient();
  const { data } = await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .single<Job>();
  return data ?? null;
}

// ── Job transition: mark as processing ───────────────────────────────────────

export async function markJobProcessing(jobId: string): Promise<void> {
  const admin = createAdminClient();
  await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', jobId);
}

// ── Job transition: release with outcome ─────────────────────────────────────

export interface ReleaseJobParams {
  jobId: string;
  processed: number;
  errors: number;
  recordNos?: string[];
  entityIdUsed?: string | null;
  errorMessage?: string;
  errorCategory?: ErrorCategory;
  errorCode?: string;
}

export async function releaseJobSuccess(params: ReleaseJobParams): Promise<void> {
  const admin = createAdminClient();
  const status: JobStatus = params.errors > 0 ? 'partially_completed' : 'completed';

  await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .update({
      status,
      processed_count:    params.processed,
      error_count:        params.errors,
      completed_at:       new Date().toISOString(),
      claimed_by:         null,
      claimed_at:         null,
      ...(params.recordNos?.length ? { intacct_record_nos: params.recordNos } : {}),
      ...(params.entityIdUsed !== undefined ? { entity_id_used: params.entityIdUsed } : {}),
    })
    .eq('id', params.jobId);

  await writeJobEvent(
    admin,
    params.jobId,
    'job_completed',
    params.errors > 0 ? 'warn' : 'success',
    params.errors > 0
      ? `Job completed with ${params.errors} errors. ${params.processed} items processed.`
      : `Job completed successfully. ${params.processed} items processed.`,
    { processed: params.processed, errors: params.errors, recordNos: params.recordNos ?? [] }
  );
}

export async function releaseJobFailure(
  jobId: string,
  err: Error | string,
  attemptCount: number,
  maxAttempts: number
): Promise<void> {
  const admin = createAdminClient();
  const decision     = getRetryDecision(err, attemptCount, maxAttempts);
  const errorMessage = typeof err === 'string' ? err : err.message;
  const errorCode    = extractErrorCode(err);

  if (decision.shouldRetry && decision.nextAttemptAt) {
    await (admin as ReturnType<typeof createAdminClient>)
      .from('upload_jobs')
      .update({
        status:              'awaiting_retry',
        claimed_by:          null,
        claimed_at:          null,
        next_attempt_at:     decision.nextAttemptAt.toISOString(),
        error_category:      decision.category,
        last_error_code:     errorCode,
        last_error_message:  errorMessage,
      })
      .eq('id', jobId);

    await writeJobEvent(admin, jobId, 'retry_scheduled', 'warn',
      decision.reason,
      {
        error_category: decision.category,
        error_code:     errorCode,
        attempt_count:  attemptCount,
        max_attempts:   maxAttempts,
        next_attempt_at: decision.nextAttemptAt.toISOString(),
      }
    );
  } else {
    const isDead = attemptCount >= maxAttempts;
    const status: JobStatus = isDead ? 'dead_letter' : 'failed';

    await (admin as ReturnType<typeof createAdminClient>)
      .from('upload_jobs')
      .update({
        status,
        completed_at:        new Date().toISOString(),
        claimed_by:          null,
        claimed_at:          null,
        error_category:      decision.category,
        last_error_code:     errorCode,
        last_error_message:  errorMessage,
      })
      .eq('id', jobId);

    await writeJobEvent(admin, jobId,
      isDead ? 'job_dead_lettered' : 'job_failed',
      'error',
      isDead
        ? `Job moved to dead letter after ${attemptCount} attempts: ${errorMessage}`
        : `Job failed (${decision.category}): ${errorMessage}`,
      { error_category: decision.category, error_code: errorCode, attempt_count: attemptCount }
    );
  }
}

// ── Job transition: dead-letter (manual/admin) ────────────────────────────────

export async function deadLetterJob(jobId: string, reason: string): Promise<void> {
  const admin = createAdminClient();
  await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .update({
      status:              'dead_letter',
      completed_at:        new Date().toISOString(),
      claimed_by:          null,
      claimed_at:          null,
      error_category:      'system',
      last_error_message:  reason,
    })
    .eq('id', jobId);

  await writeJobEvent(admin, jobId, 'job_dead_lettered', 'error',
    `Job manually moved to dead letter: ${reason}`,
    { reason, manual: true }
  );
}

// ── Job transition: recover from dead-letter ──────────────────────────────────

export async function recoverDeadLetter(jobId: string, initiatedBy?: string): Promise<void> {
  const admin = createAdminClient();
  await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .update({
      status:              'queued',
      attempt_count:       0,
      next_attempt_at:     null,
      error_category:      null,
      last_error_code:     null,
      last_error_message:  null,
    })
    .eq('id', jobId);

  await writeJobEvent(admin, jobId, 'job_queued', 'info',
    `Job recovered from dead letter and re-queued`,
    { initiated_by: initiatedBy ?? 'system' }
  );
}

// ── Job query: retry-eligible jobs ───────────────────────────────────────────

/**
 * Returns jobs in awaiting_retry where next_attempt_at has passed.
 * Used by the maintenance cron to kick off pending retries.
 */
export async function getRetryDueJobs(limit = 10): Promise<Job[]> {
  const admin = createAdminClient();
  const { data } = await (admin as ReturnType<typeof createAdminClient>)
    .from('upload_jobs')
    .select('*')
    .in('status', ['awaiting_retry', 'queued'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
    .returns<Job[]>();

  return data ?? [];
}

// ── Summary builder ───────────────────────────────────────────────────────────

export function buildOrchestrateResult(
  jobId: string,
  status: JobStatus,
  processed: number,
  errors: number,
  recordNos: string[],
  entityIdUsed?: string | null,
  message?: string
): OrchestrateResult {
  return {
    success: ['completed', 'partially_completed', 'completed_with_errors'].includes(status),
    jobId,
    status,
    processed,
    errors,
    recordNos,
    entityIdUsed,
    message,
  };
}
