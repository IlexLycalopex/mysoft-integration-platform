/**
 * Complete Step — Finalise job state, emit completion event, send notifications
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult, JobStatus } from '@/lib/jobs/types';
import { sendJobCompletedEmail, sendJobFailedEmail } from '@/lib/email';
import { dispatchWebhooks } from '@/lib/webhooks';
import { getTenantBranding } from '@/lib/branding';

export const completeStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, admin, events } = ctx;

    const posted  = items.filter(i => i.status === 'posted').length;
    const failed  = items.filter(i => i.status === 'failed').length;
    const isDry   = job.dry_run;

    const status: JobStatus = isDry
      ? 'completed'
      : failed > 0 && posted === 0
        ? 'failed'
        : failed > 0
          ? 'partially_completed'
          : 'completed';

    await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('upload_jobs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        claimed_by:   null,
        claimed_at:   null,
      })
      .eq('id', job.id);

    await events.success('job_completed',
      isDry
        ? `[DRY RUN] Completed: ${posted} items validated`
        : `Completed: ${posted} posted, ${failed} failed`,
      { status, posted, failed, dry_run: isDry }
    );

    // Send notifications (non-blocking — never crash the job)
    void notifyUser(admin, job, posted, failed, isDry).catch(() => {});

    return {
      success:  true,
      items,
      metrics:  { posted, failed, status },
    };
  },
};

// ── Notification helper ───────────────────────────────────────────────────────

async function notifyUser(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  job: import('@/lib/jobs/types').Job,
  processed: number,
  errors: number,
  isDry: boolean
): Promise<void> {
  if (!job.created_by) return;

  try {
    const { data: { user } } = await admin.auth.admin.getUserById(job.created_by);
    const email = user?.email;
    if (!email) return;

    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const jobUrl   = `${baseUrl}/jobs`;
    const branding = await getTenantBranding(job.tenant_id);
    const filename = job.filename;

    if (errors > 0 && processed === 0) {
      await sendJobFailedEmail({
        to:           email,
        filename,
        errorMessage: `${errors} row(s) failed processing`,
        jobUrl,
        branding,
      });
    } else {
      await sendJobCompletedEmail({
        to:        email,
        filename:  isDry ? `[DRY RUN] ${filename}` : filename,
        processed,
        errors,
        jobUrl,
        branding,
      });
    }

    // Fire webhooks (non-blocking)
    const webhookEvent = errors > 0 && processed === 0 ? 'job.failed' : 'job.completed';
    dispatchWebhooks(job.tenant_id, webhookEvent, {
      jobId:          job.id,
      tenantId:       job.tenant_id,
      status:         errors > 0 ? 'partially_completed' : 'completed',
      filename,
      processedCount: processed,
      errorCount:     errors,
    }).catch(() => {});
  } catch {
    // Email failures must never crash the orchestrator
  }
}
