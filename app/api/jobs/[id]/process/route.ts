/**
 * POST /api/jobs/[id]/process
 *
 * Triggers orchestrated job processing.
 * Auth: CRON_SECRET bearer | API key (mip_*) | browser session
 *
 * Vercel Hobby: processing runs synchronously within the request lifecycle.
 * For longer jobs, the caller should use waitUntil() at the edge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { orchestrateJob } from '@/lib/jobs/job-orchestrator';
import { runWorkerCycle } from '@/lib/workers/job-worker';
import { validateApiKey } from '@/lib/api-auth';
import { checkUsageLimits } from '@/lib/actions/usage';
import type { UserRole } from '@/types/database';

export const maxDuration = 300; // 5-minute Vercel function timeout

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const admin = createAdminClient();
  const authHeader = req.headers.get('authorization');

  // ── CRON_SECRET auth (internal cron / sftp-poll) ────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const { data: job } = await admin
      .from('upload_jobs')
      .select('id, tenant_id, status')
      .eq('id', jobId)
      .single<{ id: string; tenant_id: string; status: string }>();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    try {
      const result = await orchestrateJob(jobId);
      // After processing this job, run a quick worker cycle for any pending retries
      void runWorkerCycle(3).catch(() => {});
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── API key auth (agent-triggered processing) ───────────────────────────────
  if (authHeader?.startsWith('Bearer mip_')) {
    const ctx = await validateApiKey(authHeader);
    if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { data: job } = await admin
      .from('upload_jobs')
      .select('id, tenant_id, status')
      .eq('id', jobId)
      .single<{ id: string; tenant_id: string; status: string }>();

    if (!job || job.tenant_id !== ctx.tenantId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const usageCheck = await checkUsageLimits(job.tenant_id);
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: usageCheck.reason }, { status: 402 });
    }

    try {
      const result = await orchestrateJob(jobId);
      return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Browser session auth ────────────────────────────────────────────────────
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

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  if (!isPlatformAdmin) {
    const { data: job } = await admin
      .from('upload_jobs')
      .select('id, tenant_id')
      .eq('id', jobId)
      .single<{ id: string; tenant_id: string }>();

    if (!job || job.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const usageCheck = await checkUsageLimits(job.tenant_id);
    if (!usageCheck.allowed) {
      return NextResponse.json({ error: usageCheck.reason }, { status: 402 });
    }
  }

  try {
    const result = await orchestrateJob(jobId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
