/**
 * Job Worker — Polls for eligible jobs and orchestrates them
 *
 * Vercel Hobby design:
 *   • No long-running process or dedicated cron worker
 *   • Worker cycle is triggered inline from the process API via waitUntil()
 *   • Also called from the daily maintenance cron for retry pickup
 *   • Stale claim recovery runs via Supabase pg_cron (DB-level, 5-min interval)
 *
 * For tenants on plans that add a dedicated /api/cron/job-worker route,
 * this same function handles that path too.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { orchestrateJob } from '@/lib/jobs/job-orchestrator';
import { getRetryDueJobs } from '@/lib/jobs/job-service';
import { writeJobEvent } from '@/lib/jobs/event-writer';
import type { OrchestrateResult } from '@/lib/jobs/types';

// Worker ID: unique per invocation to support concurrent workers
function generateWorkerId(): string {
  return `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run one worker cycle:
 *   1. Find retry-due jobs
 *   2. Orchestrate them (up to maxJobs)
 *   3. Return summary
 *
 * Designed to complete within Vercel's serverless function timeout (10-30s default).
 * For large retry backlogs, subsequent calls will pick up remaining jobs.
 */
export async function runWorkerCycle(maxJobs = 5): Promise<{
  processed: number;
  results: OrchestrateResult[];
}> {
  const workerId = generateWorkerId();
  const results: OrchestrateResult[] = [];

  try {
    const retryJobs = await getRetryDueJobs(maxJobs);

    for (const job of retryJobs) {
      try {
        const result = await orchestrateJob(job.id);
        results.push(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Worker ${workerId}] Job ${job.id} threw: ${message}`);
        results.push({
          success:  false,
          jobId:    job.id,
          status:   'failed',
          processed: 0,
          errors:   1,
          recordNos: [],
          message,
        });
      }
    }
  } catch (err: unknown) {
    console.error(`[Worker ${workerId}] Cycle error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    processed: results.filter(r => r.success).length,
    results,
  };
}

/**
 * Trigger orchestration for a specific job via waitUntil.
 * Used by the process API to start jobs without blocking the HTTP response.
 *
 * Pattern:
 *   const result = await triggerJobOrchestration(jobId);
 *   // or in an edge function:
 *   waitUntil(triggerJobOrchestration(jobId));
 */
export async function triggerJobOrchestration(jobId: string): Promise<OrchestrateResult> {
  const admin    = createAdminClient();
  const workerId = generateWorkerId();

  // Claim the job atomically via the DB function
  const { data: claimedJob } = await (admin as ReturnType<typeof createAdminClient>)
    .rpc('claim_next_job', { p_worker_id: workerId })
    .single<import('@/lib/jobs/types').Job | null>();

  // If the specific job wasn't claimed (another worker got it), orchestrate by ID directly
  // This handles the case where the caller already owns the job from an API claim
  if (!claimedJob || claimedJob.id !== jobId) {
    // Verify the job is in a processable state before proceeding
    const { data: job } = await (admin as ReturnType<typeof createAdminClient>)
      .from('upload_jobs')
      .select('id, status, attempt_count, max_attempts')
      .eq('id', jobId)
      .single<{ id: string; status: string; attempt_count: number; max_attempts: number }>();

    if (!job) {
      return { success: false, jobId, status: 'failed', processed: 0, errors: 0, recordNos: [], message: 'Job not found' };
    }

    const processableStatuses = ['pending', 'queued', 'claimed', 'awaiting_retry', 'processing'];
    if (!processableStatuses.includes(job.status)) {
      return { success: false, jobId, status: job.status as import('@/lib/jobs/types').JobStatus, processed: 0, errors: 0, recordNos: [], message: `Job is in non-processable status: ${job.status}` };
    }
  }

  await writeJobEvent(admin, jobId, 'job_claimed', 'info',
    `Job processing started by ${workerId}`,
    { worker_id: workerId }
  );

  return orchestrateJob(jobId);
}
