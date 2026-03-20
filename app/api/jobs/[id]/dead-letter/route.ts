/**
 * POST /api/jobs/[id]/dead-letter
 * Manually moves a job to dead_letter state (platform admin only).
 * Used when a job should be parked without further retry attempts.
 *
 * GET /api/jobs/[id]/dead-letter
 * Returns dead-letter diagnosis: why it was dead-lettered, which step failed,
 * which items failed, and whether reprocessing is possible.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deadLetterJob } from '@/lib/jobs/job-service';
import type { UserRole } from '@/types/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };

  const supabase = await createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  // Only platform admins can manually dead-letter jobs
  const adminRoles: UserRole[] = ['platform_super_admin', 'mysoft_support_admin'];
  if (!profile || !adminRoles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — platform admin required' }, { status: 403 });
  }

  const reason = body.reason ?? `Manually dead-lettered by ${user.email ?? user.id}`;
  await deadLetterJob(jobId, reason);

  return NextResponse.json({ success: true, jobId, reason });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = await createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  const { data: job } = await admin
    .from('upload_jobs')
    .select('id, tenant_id, status, attempt_count, max_attempts, error_category, last_error_code, last_error_message, filename, created_at, updated_at')
    .eq('id', jobId)
    .single<{
      id: string; tenant_id: string; status: string; attempt_count: number; max_attempts: number;
      error_category: string | null; last_error_code: string | null; last_error_message: string | null;
      filename: string; created_at: string; updated_at: string;
    }>();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!isPlatformAdmin && job.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Gather diagnosis
  const [failedStepsRes, failedItemsRes, dlEventRes] = await Promise.all([
    admin.from('job_steps').select('step_type, status, error_category, error_code, error_message').eq('job_id', jobId).eq('status', 'failed'),
    admin.from('job_items').select('id, source_row_number, item_key, error_category, error_code, error_message, reprocessable').eq('job_id', jobId).eq('status', 'failed').limit(50),
    admin.from('job_events').select('message, metadata_json, created_at').eq('job_id', jobId).eq('event_type', 'job_dead_lettered').order('created_at', { ascending: false }).limit(1).single(),
  ]);

  const reprocessableCount = (failedItemsRes.data ?? []).filter(i => i.reprocessable).length;

  return NextResponse.json({
    jobId,
    status:          job.status,
    attemptCount:    job.attempt_count,
    maxAttempts:     job.max_attempts,
    errorCategory:   job.error_category,
    lastErrorCode:   job.last_error_code,
    lastErrorMessage: job.last_error_message,
    deadLetteredAt:  dlEventRes.data?.created_at,
    deadLetterReason: (dlEventRes.data?.metadata_json as Record<string, unknown>)?.reason as string | undefined,
    failedSteps:     failedStepsRes.data ?? [],
    failedItems:     failedItemsRes.data ?? [],
    reprocessableItemCount: reprocessableCount,
    canReprocess:    reprocessableCount > 0,
    recommendedAction: getRecommendedAction(job.error_category),
  });
}

function getRecommendedAction(category: string | null): string {
  switch (category) {
    case 'configuration': return 'Review and update Intacct credentials or field mapping configuration, then retry.';
    case 'data':          return 'Inspect failed items, correct the source data, then use retry-failed-items.';
    case 'transient':     return 'Endpoint was temporarily unavailable. Retry the job — it should succeed now.';
    case 'system':        return 'Internal error. Check platform logs and contact support if the issue persists.';
    default:              return 'Review job events and failed step details, then retry or contact support.';
  }
}
