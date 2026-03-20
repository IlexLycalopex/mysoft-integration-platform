/**
 * Reconcile Step — Persist final outcomes, update job counters, collect record IDs
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult } from '@/lib/jobs/types';

export const reconcileStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, admin, events } = ctx;

    const posted   = items.filter(i => i.status === 'posted');
    const failed   = items.filter(i => i.status === 'failed');
    const skipped  = items.filter(i => i.status === 'skipped');

    const recordNos = posted
      .map(i => i.endpoint_record_id)
      .filter((r): r is string => !!r);

    // Update job counters
    const updateData: Record<string, unknown> = {
      processed_count: posted.length,
      error_count:     failed.length,
    };
    if (recordNos.length > 0) {
      updateData.intacct_record_nos = recordNos;
    }

    await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('upload_jobs')
      .update(updateData)
      .eq('id', job.id);

    await events.info('step_completed',
      `Reconciled: ${posted.length} posted, ${failed.length} failed, ${skipped.length} skipped`,
      { posted: posted.length, failed: failed.length, skipped: skipped.length, recordNos }
    );

    return {
      success:  true,
      items,
      metrics:  { posted: posted.length, failed: failed.length, skipped: skipped.length },
      metadata: { record_nos: recordNos },
    };
  },
};
