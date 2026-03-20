/**
 * POST /api/jobs/[id]/retry
 *
 * Re-queues a failed or dead_letter job for another attempt.
 * Resets attempt_count so the full retry budget is available again.
 * Auth: browser session (tenant_admin or platform admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { orchestrateJob } from '@/lib/jobs/job-orchestrator';
import { writeJobEvent } from '@/lib/jobs/event-writer';
import type { UserRole } from '@/types/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({})) as { immediate?: boolean };

  const supabase = await createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const retryRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !retryRoles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  const { data: job } = await admin
    .from('upload_jobs')
    .select('id, tenant_id, status, attempt_count, max_attempts')
    .eq('id', jobId)
    .single<{ id: string; tenant_id: string; status: string; attempt_count: number; max_attempts: number }>();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!isPlatformAdmin && job.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const retryableStatuses = ['failed', 'dead_letter', 'awaiting_retry', 'partially_completed', 'completed_with_errors'];
  if (!retryableStatuses.includes(job.status)) {
    return NextResponse.json({
      error: `Job cannot be retried from status '${job.status}'. Only failed, dead_letter, or partially_completed jobs can be retried.`
    }, { status: 400 });
  }

  // Reset job for retry
  await (admin as any)
    .from('upload_jobs')
    .update({
      status:              'queued',
      attempt_count:       0,          // reset so full retry budget available
      next_attempt_at:     null,
      claimed_by:          null,
      claimed_at:          null,
      error_category:      null,
      last_error_code:     null,
      last_error_message:  null,
      started_at:          null,
      completed_at:        null,
    })
    .eq('id', jobId);

  // Reset all items to pending for reprocessing
  await (admin as any).from('job_items')
    .update({ status: 'pending', reprocessable: false })
    .eq('job_id', jobId)
    .in('status', ['failed', 'reprocessable']);

  await writeJobEvent(admin, jobId, 'job_queued', 'info',
    `Job re-queued for retry by ${user.email ?? user.id}`,
    { initiated_by: user.id, previous_status: job.status, reset_attempt_count: true }
  );

  // If immediate=true, trigger orchestration now rather than waiting for cron pickup
  if (body.immediate) {
    try {
      const result = await orchestrateJob(jobId);
      return NextResponse.json({ queued: true, executed: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, queued: true, executed: false, error: message });
    }
  }

  return NextResponse.json({ success: true, queued: true, jobId });
}
