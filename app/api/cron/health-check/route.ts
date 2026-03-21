import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendAlertEmail } from '@/lib/email';
import { verifyCronSecret } from '@/lib/cron-auth';

const ALERT_COOLDOWN_HOURS = 2;
const AGENT_OFFLINE_MINUTES = 35;
const STUCK_JOB_MINUTES = 10;
const HIGH_ERROR_RATE_THRESHOLD = 0.5;
const HIGH_ERROR_RATE_SAMPLE = 10;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const jobUrl = `${baseUrl}/jobs`;

  let agentOfflineCount = 0;
  let stuckJobCount = 0;
  let highErrorRateCount = 0;

  // ── Helper: check dedup and send alert ──────────────────────────────────────
  async function shouldSendAlert(
    tenantId: string | null,
    alertType: string,
    resourceId: string | null
  ): Promise<boolean> {
    const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    let query = admin
      .from('alert_events')
      .select('id')
      .eq('alert_type', alertType)
      .gte('sent_at', cooldownCutoff)
      .is('resolved_at', null)
      .limit(1);

    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (resourceId) query = query.eq('resource_id', resourceId);

    const { data } = await query;
    return !data || data.length === 0;
  }

  async function recordAlert(
    tenantId: string | null,
    alertType: string,
    resourceId: string | null
  ): Promise<void> {
    await admin.from('alert_events').insert({
      tenant_id: tenantId ?? undefined,
      alert_type: alertType,
      resource_id: resourceId,
    });
  }

  async function sendToTenantAdmins(
    tenantId: string,
    alertType: string,
    message: string
  ): Promise<void> {
    const { data: admins } = await admin
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'tenant_admin');

    for (const adminProfile of admins ?? []) {
      const { data: { user } } = await admin.auth.admin.getUserById(adminProfile.id);
      if (user?.email) {
        await sendAlertEmail({ to: user.email, alertType, message, jobUrl }).catch(() => {});
      }
    }
  }

  // ── Check 1: Agent offline ───────────────────────────────────────────────────
  // For each tenant with at least one enabled watcher_config, check api_keys.last_used_at
  try {
    const { data: tenantsWithWatchers } = await admin
      .from('watcher_configs')
      .select('tenant_id')
      .eq('enabled', true);

    const tenantIdsWithWatchers = [...new Set((tenantsWithWatchers ?? []).map(w => w.tenant_id))];

    const offlineCutoff = new Date(Date.now() - AGENT_OFFLINE_MINUTES * 60 * 1000).toISOString();

    for (const tenantId of tenantIdsWithWatchers) {
      const { data: keys } = await admin
        .from('api_keys')
        .select('id, last_used_at')
        .eq('tenant_id', tenantId)
        .is('revoked_at', null)
        .order('last_used_at', { ascending: false })
        .limit(1);

      const lastUsed = keys?.[0]?.last_used_at ?? null;
      const isOffline = !lastUsed || lastUsed < offlineCutoff;

      if (isOffline) {
        const canSend = await shouldSendAlert(tenantId, 'agent_offline', tenantId);
        if (canSend) {
          const lastSeenMsg = lastUsed
            ? `Last seen: ${new Date(lastUsed).toUTCString()}`
            : 'Never connected';
          await sendToTenantAdmins(
            tenantId,
            'agent_offline',
            `The Mysoft Integration Agent has not connected for more than ${AGENT_OFFLINE_MINUTES} minutes. ${lastSeenMsg}. Please check the agent service on your server.`
          );
          await recordAlert(tenantId, 'agent_offline', tenantId);
          agentOfflineCount++;
        }
      }
    }
  } catch {
    // Non-fatal — continue with other checks
  }

  // ── Stale job recovery ───────────────────────────────────────────────────────
  // pg_cron is not available on this plan, so we drive recover_stale_jobs() from
  // this Vercel cron instead. It uses COALESCE(claimed_at, started_at) so HTTP-push
  // jobs (which have claimed_at = NULL) are caught alongside agent-claimed jobs.
  try {
    await (admin as any).rpc('recover_stale_jobs');
  } catch {
    // Non-fatal — stale recovery failure must not block alerting
  }

  // ── Check 2: Stuck jobs ──────────────────────────────────────────────────────
  // Alert on any jobs still in 'processing' after recovery ran. These are genuinely
  // stuck (e.g. the worker is running but not completing) and need human attention.
  try {
    const stuckCutoff = new Date(Date.now() - STUCK_JOB_MINUTES * 60 * 1000).toISOString();

    const { data: stuckJobs } = await admin
      .from('upload_jobs')
      .select('id, tenant_id, filename')
      .eq('status', 'processing')
      .lt('started_at', stuckCutoff);

    for (const job of stuckJobs ?? []) {
      const canSend = await shouldSendAlert(job.tenant_id, 'stuck_job', job.id);
      if (canSend) {
        await sendToTenantAdmins(
          job.tenant_id,
          'stuck_job',
          `Job "${job.filename}" (ID: ${job.id}) has been in "processing" status for more than ${STUCK_JOB_MINUTES} minutes. It may be stuck. Please check the job log or contact support.`
        );
        await recordAlert(job.tenant_id, 'stuck_job', job.id);
        stuckJobCount++;
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Check 3: High error rate ─────────────────────────────────────────────────
  try {
    // Get all distinct tenant IDs that have completed jobs
    const { data: tenantRows } = await admin
      .from('upload_jobs')
      .select('tenant_id')
      .in('status', ['completed', 'failed']);

    const tenantIds = [...new Set((tenantRows ?? []).map(r => r.tenant_id))];

    for (const tenantId of tenantIds) {
      const { data: recentJobs } = await admin
        .from('upload_jobs')
        .select('id, error_count')
        .eq('tenant_id', tenantId)
        .in('status', ['completed', 'failed'])
        .order('completed_at', { ascending: false })
        .limit(HIGH_ERROR_RATE_SAMPLE);

      if (!recentJobs || recentJobs.length < 2) continue;

      const jobsWithErrors = recentJobs.filter(j => (j.error_count ?? 0) > 0).length;
      const errorRate = jobsWithErrors / recentJobs.length;

      if (errorRate > HIGH_ERROR_RATE_THRESHOLD) {
        const canSend = await shouldSendAlert(tenantId, 'high_error_rate', tenantId);
        if (canSend) {
          await sendToTenantAdmins(
            tenantId,
            'high_error_rate',
            `${Math.round(errorRate * 100)}% of the last ${recentJobs.length} jobs completed with errors (threshold: ${Math.round(HIGH_ERROR_RATE_THRESHOLD * 100)}%). Please review your field mappings and Intacct credentials.`
          );
          await recordAlert(tenantId, 'high_error_rate', tenantId);
          highErrorRateCount++;
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({
    ok: true,
    checks: {
      agentOffline: agentOfflineCount,
      stuckJobs: stuckJobCount,
      highErrorRate: highErrorRateCount,
    },
  });
}
