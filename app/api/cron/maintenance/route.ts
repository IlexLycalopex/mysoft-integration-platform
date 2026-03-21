/**
 * GET /api/cron/maintenance
 *
 * Daily maintenance cron — handles retry pickup for Vercel Hobby plan.
 *
 * Vercel Hobby cron limitations:
 *   - Maximum 2 cron jobs total
 *   - Minimum frequency: once per day
 *
 * This route runs once daily and:
 *   1. Picks up any awaiting_retry jobs whose next_attempt_at has passed
 *   2. Processes up to 10 pending jobs (burst clearing)
 *
 * Note: Stale claim recovery (every 5 min) runs via Supabase pg_cron —
 * completely independent of Vercel's cron limits. See migration 031.
 *
 * vercel.json schedule: "0 6 * * *" (06:00 UTC daily)
 */

import { NextResponse } from 'next/server';
import { runWorkerCycle } from '@/lib/workers/job-worker';
import { verifyCronSecret } from '@/lib/cron-auth';

export const maxDuration = 300;

export async function GET(req: Request) {
  // Verify this is a legitimate Vercel cron call
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const result = await runWorkerCycle(10);

    return NextResponse.json({
      ok:        true,
      processed: result.processed,
      total:     result.results.length,
      results:   result.results.map(r => ({
        jobId:     r.jobId,
        success:   r.success,
        status:    r.status,
        processed: r.processed,
        errors:    r.errors,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Maintenance Cron] Error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
