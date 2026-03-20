import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import type { UserRole } from '@/types/database';
import { getEmulationContext } from '@/lib/emulation';
import { getSourceBadge } from '@/lib/source-labels';
import JobVolumeChart, { type DayData } from '@/components/dashboard/JobVolumeChart';
import ErrorRateSparkline from '@/components/dashboard/ErrorRateSparkline';
import TransactionBreakdown from '@/components/dashboard/TransactionBreakdown';
import AgentStatusPanel, { type ApiKeyStatus } from '@/components/dashboard/AgentStatusPanel';
import UsageBanner from '@/components/usage/UsageBanner';
import { getUsageForTenant, refreshUsageSnapshot } from '@/lib/actions/usage';

// ── Raw row types ────────────────────────────────────────────────────────────

interface RawJob {
  status: string;
  created_at: string;
  processed_count: number | null;
  error_count: number | null;
  mapping_id: string | null;
}

interface RawError {
  error_message: string;
}

// ── Data processing helpers ──────────────────────────────────────────────────

function buildDayBuckets(jobs: RawJob[], days: number): DayData[] {
  const map = new Map<string, DayData>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, completed: 0, withErrors: 0, failed: 0, pending: 0 });
  }
  for (const job of jobs) {
    const key = job.created_at.slice(0, 10);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (job.status === 'completed') bucket.completed++;
    else if (job.status === 'completed_with_errors') bucket.withErrors++;
    else if (job.status === 'failed') bucket.failed++;
    else bucket.pending++;
  }
  return Array.from(map.values());
}

function buildErrorRate(jobs: RawJob[], days: number): Array<{ date: string; rate: number }> {
  const map = new Map<string, { total: number; failed: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { total: 0, failed: 0 });
  }
  for (const job of jobs) {
    const key = job.created_at.slice(0, 10);
    const bucket = map.get(key);
    if (!bucket) continue;
    bucket.total++;
    if (job.status === 'failed' || job.status === 'completed_with_errors') bucket.failed++;
  }
  return Array.from(map.entries()).map(([date, { total, failed }]) => ({
    date,
    rate: total > 0 ? failed / total : 0,
  }));
}

function buildTopErrors(errors: RawError[]): Array<{ message: string; count: number }> {
  const map = new Map<string, number>();
  for (const e of errors) {
    const key = (e.error_message ?? '').slice(0, 80);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function buildTransactionBreakdown(
  jobs: RawJob[],
  mappings: Array<{ id: string; transaction_type: string }>
): Array<{ type: string; count: number; label: string }> {
  const typeMap = new Map(mappings.map((m) => [m.id, m.transaction_type]));
  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (job.status !== 'completed' && job.status !== 'completed_with_errors') continue;
    const type = (job.mapping_id ? typeMap.get(job.mapping_id) : null) ?? 'unknown';
    counts.set(type, (counts.get(type) ?? 0) + (job.processed_count ?? 0));
  }
  const LABELS: Record<string, string> = {
    journal_entry: 'Journal Entry',
    payroll_journal: 'Payroll Journal',
    ar_invoice: 'AR Invoice',
    ap_bill: 'AP Bill',
    expense_report: 'Expense Report',
    ar_payment: 'AR Payment',
    ap_payment: 'AP Payment',
    timesheet: 'Timesheet',
    vendor: 'Vendor Import',
    customer: 'Customer Import',
    unknown: 'Unknown',
  };
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, label: LABELS[type] ?? type }))
    .sort((a, b) => b.count - a.count);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('first_name, role, tenant_id')
    .eq('id', user!.id)
    .single<{ first_name: string | null; role: UserRole; tenant_id: string | null }>();

  const displayName = profile?.first_name ?? user?.email ?? 'there';
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '');

  // Platform admins go to /platform unless they are currently emulating a tenant user
  const emulationCtx = isPlatformAdmin ? await getEmulationContext() : null;
  if (isPlatformAdmin && !emulationCtx) redirect('/platform');

  const admin = createAdminClient();
  // When emulating, scope all data to the emulated tenant
  const effectiveTenantId = emulationCtx ? emulationCtx.tenant_id : (profile?.tenant_id ?? null);

  // ── Live stats ──────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const thirtyDaysAgo = new Date(todayStart); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysAgo = new Date(todayStart); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  let jobsQuery = admin
    .from('upload_jobs')
    .select('id, status, processed_count, error_count, created_at')
    .gte('created_at', todayStart.toISOString());

  let errorsQuery = admin
    .from('job_errors')
    .select('id', { count: 'exact', head: true });

  let monthRowsQuery = admin
    .from('upload_jobs')
    .select('processed_count')
    .gte('created_at', monthStart.toISOString())
    .eq('status', 'completed');

  let recentJobsQuery = admin
    .from('upload_jobs')
    .select('id, filename, status, source_type, processed_count, error_count, row_count, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  // Analytics queries
  let dailyJobsQuery = admin
    .from('upload_jobs')
    .select('status, created_at, processed_count, error_count, mapping_id')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  let topErrorsQuery = admin
    .from('job_errors')
    .select('error_message')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .limit(500);

  let apiKeysQuery = admin
    .from('api_keys')
    .select('id, name, key_prefix, last_used_at, created_at')
    .is('revoked_at', null)
    .order('last_used_at', { ascending: false });

  let mappingsQuery = admin
    .from('field_mappings')
    .select('id, transaction_type');

  // For error rate sparkline (14-day jobs)
  let sparklineJobsQuery = admin
    .from('upload_jobs')
    .select('status, created_at')
    .gte('created_at', fourteenDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  if (effectiveTenantId) {
    jobsQuery = jobsQuery.eq('tenant_id', effectiveTenantId);
    errorsQuery = errorsQuery.eq('tenant_id', effectiveTenantId);
    monthRowsQuery = monthRowsQuery.eq('tenant_id', effectiveTenantId);
    recentJobsQuery = recentJobsQuery.eq('tenant_id', effectiveTenantId);
    dailyJobsQuery = dailyJobsQuery.eq('tenant_id', effectiveTenantId);
    topErrorsQuery = topErrorsQuery.eq('tenant_id', effectiveTenantId);
    apiKeysQuery = apiKeysQuery.eq('tenant_id', effectiveTenantId);
    mappingsQuery = mappingsQuery.eq('tenant_id', effectiveTenantId);
    sparklineJobsQuery = sparklineJobsQuery.eq('tenant_id', effectiveTenantId);
  }

  const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.all([
    jobsQuery,
    errorsQuery,
    monthRowsQuery,
    recentJobsQuery,
    dailyJobsQuery,
    topErrorsQuery,
    apiKeysQuery,
    mappingsQuery,
    sparklineJobsQuery,
  ]);

  const todayJobs  = (r1 as { data: { id: string; status: string; processed_count: number; error_count: number }[] | null }).data;
  const openErrors = (r2 as { count: number | null }).count;
  const monthJobs  = (r3 as { data: { processed_count: number }[] | null }).data;
  const recentJobs = (r4 as { data: { id: string; filename: string; status: string; source_type: string; processed_count: number; error_count: number; row_count: number | null; created_at: string }[] | null }).data;
  const dailyJobs  = ((r5 as { data: RawJob[] | null }).data) ?? [];
  const rawErrors  = ((r6 as { data: RawError[] | null }).data) ?? [];
  const rawApiKeys = ((r7 as { data: { id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string }[] | null }).data) ?? [];
  const rawMappings = ((r8 as { data: { id: string; transaction_type: string }[] | null }).data) ?? [];
  const sparklineJobs = ((r9 as { data: { status: string; created_at: string }[] | null }).data) ?? [];

  const jobsToday = todayJobs?.length ?? 0;
  const completedToday = todayJobs?.filter((j) => j.status === 'completed').length ?? 0;
  const successRate = jobsToday > 0 ? Math.round((completedToday / jobsToday) * 100) : null;
  const rowsThisMonth = (monthJobs ?? []).reduce((sum, j) => sum + (j.processed_count ?? 0), 0);

  // Process analytics data
  const dayBuckets = buildDayBuckets(dailyJobs, 30);
  const topErrors = buildTopErrors(rawErrors);
  const txBreakdown = buildTransactionBreakdown(dailyJobs, rawMappings);

  // Error rate sparkline (14 days) — reuse sparklineJobs which match RawJob shape
  const sparklineRaw: RawJob[] = sparklineJobs.map((j) => ({
    status: j.status,
    created_at: j.created_at,
    processed_count: null,
    error_count: null,
    mapping_id: null,
  }));
  const errorRateDays = buildErrorRate(sparklineRaw, 14);
  const nowMs = todayStart.getTime();
  const allJobs14 = sparklineJobs.length;
  const failedJobs14 = sparklineJobs.filter((j) => j.status === 'failed' || j.status === 'completed_with_errors').length;
  const currentErrorRate = allJobs14 > 0 ? failedJobs14 / allJobs14 : 0;

  // ── Usage banner data ────────────────────────────────────────
  let usageBannerData: { jobs_count: number; rows_processed: number } | null = null;
  let usagePlanData: { max_jobs_per_month: number | null; max_rows_per_month: number | null } | null = null;
  let usagePlanName = 'Free';

  if (effectiveTenantId) {
    let usageData = await getUsageForTenant(effectiveTenantId);
    if (!usageData.snapshot) {
      await refreshUsageSnapshot(effectiveTenantId);
      usageData = await getUsageForTenant(effectiveTenantId);
    }
    if (usageData.snapshot) {
      usageBannerData = {
        jobs_count: usageData.snapshot.jobs_count,
        rows_processed: usageData.snapshot.rows_processed,
      };
    }
    if (usageData.plan) {
      usagePlanData = {
        max_jobs_per_month: usageData.plan.max_jobs_per_month,
        max_rows_per_month: usageData.plan.max_rows_per_month,
      };
      usagePlanName = usageData.plan.name;
    }
  }

  // Agent status props
  const apiKeyStatuses: ApiKeyStatus[] = rawApiKeys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    lastUsedAt: k.last_used_at,
  }));

  const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
    pending:    { bg: '#FFF8E6', text: '#92620A', border: '#F5D98C' },
    processing: { bg: '#E6F4FF', text: '#0A4F92', border: '#A3CFFF' },
    completed:  { bg: '#E6F7ED', text: '#1A6B30', border: '#A3D9B1' },
    failed:     { bg: '#FDE8E6', text: '#9B2B1E', border: '#F5C6C2' },
    cancelled:  { bg: '#F7FAFC', text: 'var(--muted)', border: 'var(--border)' },
  };

  const stats = [
    { label: 'Jobs Today',      value: String(jobsToday),                              accent: 'var(--blue)' },
    { label: 'Success Rate',    value: successRate != null ? `${successRate}%` : '—',  accent: 'var(--green)' },
    { label: 'Open Errors',     value: String(openErrors ?? 0),                        accent: 'var(--error)' },
    { label: 'Rows This Month', value: rowsThisMonth.toLocaleString(),                  accent: '#F59E0B' },
  ];

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e8eaed',
    borderRadius: 8,
    padding: '16px 20px',
  };

  return (
    <div style={{ padding: '24px' }}>
      {usageBannerData && usagePlanData && (
        <UsageBanner
          usage={usageBannerData}
          plan={usagePlanData}
          planName={usagePlanName}
        />
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Welcome back, {displayName}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '8px 0 0 8px', background: s.accent }} />
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--navy)', letterSpacing: -1, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Analytics section ─────────────────────────────────────── */}

      {/* Row 1: Job volume chart + Agent status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Job Volume — last 30 days
          </div>
          <JobVolumeChart days={dayBuckets} height={200} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Agent Status
          </div>
          <AgentStatusPanel apiKeys={apiKeyStatuses} nowMs={nowMs} />
        </div>
      </div>

      {/* Row 2: Transaction types + Error rate sparkline + Top errors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24, alignItems: 'start' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Transaction Types — last 30 days
          </div>
          <TransactionBreakdown data={txBreakdown} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Error Rate — last 14 days
          </div>
          <ErrorRateSparkline days={errorRateDays} currentRate={currentErrorRate} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>
            Top Errors — last 30 days
          </div>
          {topErrors.length === 0 ? (
            <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, padding: '8px 0' }}>No errors recorded</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {topErrors.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '5px 0', fontSize: 12, color: 'var(--navy)', borderBottom: i < topErrors.length - 1 ? '1px solid #F0F4F8' : 'none', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span title={e.message}>{e.message.slice(0, 60)}{e.message.length > 60 ? '…' : ''}</span>
                    </td>
                    <td style={{ padding: '5px 0 5px 10px', fontSize: 12, fontWeight: 700, color: 'var(--error)', borderBottom: i < topErrors.length - 1 ? '1px solid #F0F4F8' : 'none', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {e.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent jobs */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Recent Jobs</span>
          <Link href="/jobs" style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}>View all →</Link>
        </div>

        {!recentJobs?.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>No integration jobs yet.</p>
            <p style={{ fontSize: 13 }}>
              <Link href="/uploads" style={{ color: 'var(--blue)' }}>Upload a file</Link> to get started.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['File', 'Source', 'Status', 'Progress', 'Started'].map((h) => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => {
                const colours = STATUS_COLOURS[job.status] ?? STATUS_COLOURS.pending;
                const pct = job.row_count ? Math.round((job.processed_count / job.row_count) * 100) : null;
                return (
                  <tr key={job.id}>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13 }}>
                      <span style={{ fontWeight: 500, color: 'var(--navy)' }}>{job.filename}</span>
                    </td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13 }}>
                      {(() => {
                        const src = getSourceBadge(job.source_type);
                        return (
                          <span style={{ fontSize: 11, fontWeight: 600, color: src.colour, background: src.bg, border: `1px solid ${src.border}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                            {src.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: colours.text, background: colours.bg, border: `1px solid ${colours.border}`, borderRadius: 4, padding: '2px 7px' }}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13 }}>
                      {job.row_count != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 4, background: '#E5EFF5', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: job.error_count > 0 ? 'var(--error)' : 'var(--green)', width: `${pct ?? 0}%` }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{job.processed_count}/{job.row_count}</span>
                        </div>
                      ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(job.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
