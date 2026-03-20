import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processJob } from '@/lib/intacct/processor';
import { validateApiKey } from '@/lib/api-auth';
import { checkUsageLimits } from '@/lib/actions/usage';
import type { UserRole } from '@/types/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const admin = createAdminClient();
  const authHeader = req.headers.get('authorization');

  // Allow internal auth — SFTP cron and HTTP push receiver use CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const { data: job } = await admin
      .from('upload_jobs')
      .select('tenant_id')
      .eq('id', jobId)
      .single<{ tenant_id: string }>();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    try {
      const result = await processJob(jobId);
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Allow API key auth (for agent-triggered processing)
  if (authHeader?.startsWith('Bearer mip_')) {
    const ctx = await validateApiKey(authHeader);
    if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // Verify the job belongs to this tenant
    const { data: job } = await admin
      .from('upload_jobs')
      .select('tenant_id')
      .eq('id', jobId)
      .single<{ tenant_id: string }>();
    if (!job || job.tenant_id !== ctx.tenantId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Usage overage check
    const usageCheck = await checkUsageLimits(job.tenant_id);
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: usageCheck.reason }, { status: 402 });
    }

    try {
      const result = await processJob(jobId);
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Browser session auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canProcess: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !canProcess.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify job belongs to this tenant (unless platform admin)
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  if (!isPlatformAdmin) {
    const { data: job } = await admin
      .from('upload_jobs')
      .select('tenant_id')
      .eq('id', jobId)
      .single<{ tenant_id: string }>();
    if (!job || job.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
  }

  // Usage overage check (only for tenant users, not platform admins)
  if (!isPlatformAdmin) {
    const { data: jobForCheck } = await admin
      .from('upload_jobs')
      .select('tenant_id')
      .eq('id', jobId)
      .single<{ tenant_id: string }>();

    if (jobForCheck) {
      const usageCheck = await checkUsageLimits(jobForCheck.tenant_id);
      if (!usageCheck.allowed) {
        return NextResponse.json({ error: usageCheck.reason }, { status: 402 });
      }
    }
  }

  try {
    const result = await processJob(jobId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
