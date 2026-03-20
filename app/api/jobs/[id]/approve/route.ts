import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
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
    .select('id, tenant_id, status')
    .eq('id', jobId)
    .eq('status', 'awaiting_approval');

  if (!isPlatformAdmin) {
    if (!effectiveTenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
    jobQuery = jobQuery.eq('tenant_id', effectiveTenantId);
  }

  const { data: job } = await jobQuery.single<{ id: string; tenant_id: string; status: string }>();
  if (!job) return NextResponse.json({ error: 'Job not found or not awaiting approval' }, { status: 404 });

  // Update job to pending with approval metadata
  await admin.from('upload_jobs').update({
    status: 'pending',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  }).eq('id', jobId);

  // Trigger processing
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  fetch(`${baseUrl}/api/jobs/${jobId}/process`, {
    method: 'POST',
    headers: { cookie: req.headers.get('cookie') ?? '' },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
