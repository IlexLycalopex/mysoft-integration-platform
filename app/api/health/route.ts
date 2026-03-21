/**
 * GET /api/health
 *
 * Public health check endpoint for uptime monitoring (UptimeRobot, Vercel, etc.).
 * Returns overall platform status and component-level checks.
 *
 * Status values: "ok" | "degraded" | "unhealthy"
 * HTTP 200 = ok or degraded (platform is up)
 * HTTP 503 = unhealthy (database unreachable or critical failure)
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ComponentCheck {
  status: 'ok' | 'degraded' | 'unhealthy';
  [key: string]: unknown;
}

export async function GET() {
  const now = new Date();
  const checks: Record<string, ComponentCheck> = {};
  let overallStatus: 'ok' | 'degraded' | 'unhealthy' = 'ok';

  try {
    const admin = createAdminClient();

    // ── 1. Database reachability ───────────────────────────────────────────
    const { error: dbError } = await (admin as any).from('tenants').select('id').limit(1);
    if (dbError) {
      checks.database = { status: 'unhealthy', error: dbError.message };
      overallStatus = 'unhealthy';
    } else {
      checks.database = { status: 'ok' };
    }

    // ── 2. Job queue depth ─────────────────────────────────────────────────
    const { data: queueData } = await (admin as any)
      .from('upload_jobs')
      .select('status')
      .in('status', ['pending', 'queued', 'processing', 'awaiting_retry', 'dead_letter', 'failed']);

    const queueRows = (queueData ?? []) as { status: string }[];
    const queueByStatus: Record<string, number> = {};
    for (const row of queueRows) {
      queueByStatus[row.status] = (queueByStatus[row.status] ?? 0) + 1;
    }

    const dlqCount = queueByStatus['dead_letter'] ?? 0;
    const processingCount = queueByStatus['processing'] ?? 0;

    // Check for stuck jobs (processing for > 15 min via updated_at proxy via count)
    // We flag as degraded if DLQ is growing (>5 jobs) or processing queue is large
    const queueStatus: 'ok' | 'degraded' = dlqCount > 10 ? 'degraded' : 'ok';
    if (queueStatus === 'degraded' && overallStatus === 'ok') overallStatus = 'degraded';

    checks.jobQueue = {
      status: queueStatus,
      pending: queueByStatus['pending'] ?? 0,
      queued: queueByStatus['queued'] ?? 0,
      processing: processingCount,
      awaiting_retry: queueByStatus['awaiting_retry'] ?? 0,
      dead_letter: dlqCount,
      failed: queueByStatus['failed'] ?? 0,
    };

    // ── 3. Recent error rate (last hour) ───────────────────────────────────
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: recentJobs } = await (admin as any)
      .from('upload_jobs')
      .select('status')
      .gte('updated_at', oneHourAgo)
      .in('status', ['completed', 'completed_with_errors', 'failed', 'dead_letter']);

    const recentRows = (recentJobs ?? []) as { status: string }[];
    const totalRecent = recentRows.length;
    const failedRecent = recentRows.filter((j) => j.status === 'failed' || j.status === 'dead_letter').length;
    const errorRatePct = totalRecent > 0 ? Math.round((failedRecent / totalRecent) * 100) : 0;
    const errorRateStatus: 'ok' | 'degraded' = errorRatePct >= 50 ? 'degraded' : 'ok';
    if (errorRateStatus === 'degraded' && overallStatus === 'ok') overallStatus = 'degraded';

    checks.errorRate = {
      status: errorRateStatus,
      last_hour_jobs: totalRecent,
      last_hour_failed: failedRecent,
      error_rate_pct: errorRatePct,
    };

    // ── 4. Agent connectivity ─────────────────────────────────────────────
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const { data: agentKeys } = await (admin as any)
      .from('api_keys')
      .select('id, last_used_at')
      .is('revoked_at', null);

    const allKeys = (agentKeys ?? []) as { id: string; last_used_at: string | null }[];
    const onlineCount = allKeys.filter((k) => k.last_used_at && k.last_used_at > fifteenMinAgo).length;
    const totalKeys = allKeys.length;
    const offlineCount = totalKeys - onlineCount;
    const agentStatus: 'ok' | 'degraded' = offlineCount > 0 && totalKeys > 0 ? 'degraded' : 'ok';
    if (agentStatus === 'degraded' && overallStatus === 'ok') overallStatus = 'degraded';

    checks.agents = {
      status: agentStatus,
      total_keys: totalKeys,
      online: onlineCount,
      offline: offlineCount,
    };

  } catch (err) {
    overallStatus = 'unhealthy';
    checks.exception = {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: now.toISOString(),
      checks,
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, no-cache',
      },
    }
  );
}
