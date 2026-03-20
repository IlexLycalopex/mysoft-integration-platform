import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { sendJobFailedEmail } from '@/lib/email';
import type { UserRole } from '@/types/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowedRoles: UserRole[] = ['tenant_admin', 'platform_super_admin', 'mysoft_support_admin'];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  // Fetch job — must belong to effective tenant, status must be awaiting_approval
  let jobQuery = admin
    .from('upload_jobs')
    .select('id, tenant_id, status, filename, created_by')
    .eq('id', jobId)
    .eq('status', 'awaiting_approval');

  if (!isPlatformAdmin) {
    if (!effectiveTenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
    jobQuery = jobQuery.eq('tenant_id', effectiveTenantId);
  }

  const { data: job } = await jobQuery.single<{ id: string; tenant_id: string; status: string; filename: string; created_by: string | null }>();
  if (!job) return NextResponse.json({ error: 'Job not found or not awaiting approval' }, { status: 404 });

  // Read note from body (required)
  let note = '';
  try {
    const body = await req.json();
    note = (body?.note as string) ?? '';
  } catch { /* ignore parse error */ }

  if (!note?.trim()) {
    return NextResponse.json({ error: 'A rejection note is required' }, { status: 400 });
  }

  // Update job to failed with rejection metadata
  await admin.from('upload_jobs').update({
    status: 'failed',
    rejected_by: user.id,
    rejected_at: new Date().toISOString(),
    rejection_note: note,
    error_message: `Rejected by admin: ${note}`,
  }).eq('id', jobId);

  // Notify submitter
  if (job.created_by) {
    try {
      const { data: { user: submitter } } = await admin.auth.admin.getUserById(job.created_by);
      if (submitter?.email) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
        await sendJobFailedEmail({
          to: submitter.email,
          filename: job.filename,
          errorMessage: `Job was rejected: ${note}`,
          jobUrl: `${baseUrl}/jobs/${jobId}`,
        });
      }
    } catch { /* never let email failure crash the response */ }
  }

  return NextResponse.json({ ok: true });
}
