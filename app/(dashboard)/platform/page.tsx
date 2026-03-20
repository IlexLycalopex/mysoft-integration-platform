import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';

const OP_LABELS: Record<string, string> = {
  create_tenant: 'Create Tenant', update_tenant: 'Update Tenant',
  create_invite: 'Send Invite', accept_invite: 'Accept Invite',
  save_credentials: 'Save Credentials', update_user_role: 'Update Role',
  deactivate_user: 'Deactivate User', create_upload_job: 'Upload File',
  create_mapping: 'Create Mapping', update_mapping: 'Update Mapping',
  delete_mapping: 'Delete Mapping', create_sandbox_tenant: 'Create Sandbox',
  detach_sandbox_tenant: 'Detach Sandbox', send_password_reset: 'Password Reset',
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px', flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default async function PlatformDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [
    { data: tenants },
    { data: users },
    { data: recentJobs },
    { data: recentAudit },
    { data: allTenants },
    { data: apiKeys },
    { data: usageSnapshots },
    { data: allPlans },
  ] = await Promise.all([
    admin.from('tenants').select('id, status, is_sandbox, created_at'),
    admin.from('user_profiles').select('id, is_active, created_at'),
    admin.from('upload_jobs').select('id, status, created_at').order('created_at', { ascending: false }).limit(5),
    admin.from('audit_log').select('id, operation, tenant_id, created_at, user_id').order('created_at', { ascending: false }).limit(8),
    admin.from('tenants').select('id, name, plan_id, is_sandbox'),
    admin.from('api_keys').select('id, name, key_prefix, tenant_id, last_used_at, expires_at, revoked_at').is('revoked_at', null),
    admin.from('tenant_usage_monthly').select('tenant_id, jobs_count, rows_processed, storage_bytes').eq('year_month', yearMonth),
    admin.from('plans').select('id, name, max_jobs_per_month, max_rows_per_month, max_storage_mb'),
  ]);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  type TenantStat = { id: string; status: string; is_sandbox: boolean; created_at: string };
  const tenantRows = (tenants ?? []) as TenantStat[];
  const prodTenants = tenantRows.filter((t) => !t.is_sandbox);
  const totalTenants = prodTenants.length;
  const activeTenants = prodTenants.filter((t) => t.status === 'active').length;
  const suspendedTenants = prodTenants.filter((t) => t.status === 'suspended').length;
  const trialTenants = prodTenants.filter((t) => t.status === 'trial').length;
  const sandboxTenants = tenantRows.filter((t) => t.is_sandbox).length;
  const totalUsers = (users ?? []).length;
  const activeUsers = (users ?? []).filter((u) => u.is_active).length;
  const usersThisMonth = (users ?? []).filter((u) => u.created_at >= monthStart).length;
  const tenantsThisMonth = prodTenants.filter((t) => t.created_at >= monthStart).length;

  const tenantMap = Object.fromEntries((allTenants ?? []).map((t) => [t.id, t.name]));

  const auditUserIds = [...new Set((recentAudit ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
  let userMap: Record<string, string> = {};
  if (auditUserIds.length) {
    const { data: auditProfiles } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name')
      .in('id', auditUserIds) as { data: { id: string; first_name: string | null; last_name: string | null }[] | null };
    userMap = Object.fromEntries(
      (auditProfiles ?? []).map((p) => [p.id, p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.id.slice(0, 8) + '…'])
    );
  }

  const barTotal = totalTenants || 1;

  // ── Usage by tenant ────────────────────────────────────────────────────────
  type UsageSnapshotRow = { tenant_id: string; jobs_count: number; rows_processed: number; storage_bytes: number };
  type PlanLimitRow = { id: string; name: string; max_jobs_per_month: number | null; max_rows_per_month: number | null; max_storage_mb: number | null };
  type TenantWithPlanId = { id: string; name: string; plan_id: string | null; is_sandbox: boolean };

  const usageByTenant = new Map<string, UsageSnapshotRow>(
    ((usageSnapshots ?? []) as UsageSnapshotRow[]).map((r) => [r.tenant_id, r])
  );
  const planLimitMap = new Map<string, PlanLimitRow>(
    ((allPlans ?? []) as PlanLimitRow[]).map((p) => [p.id, p])
  );

  function calcPct(used: number, max: number | null | undefined): number {
    if (!max) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  }

  interface TenantUsageEntry {
    id: string;
    name: string;
    planName: string;
    jobs: number;
    maxJobs: number | null;
    rows: number;
    maxRows: number | null;
    jobsPct: number;
    rowsPct: number;
    topPct: number;
  }

  const tenantUsageEntries: TenantUsageEntry[] = ((allTenants ?? []) as TenantWithPlanId[])
    .filter((t) => !t.is_sandbox)
    .map((t) => {
      const snap = usageByTenant.get(t.id);
      const plan = t.plan_id ? planLimitMap.get(t.plan_id) : undefined;
      const jobs = snap?.jobs_count ?? 0;
      const rows = snap?.rows_processed ?? 0;
      const maxJobs = plan?.max_jobs_per_month ?? null;
      const maxRows = plan?.max_rows_per_month ?? null;
      const jobsPct = calcPct(jobs, maxJobs);
      const rowsPct = calcPct(rows, maxRows);
      return { id: t.id, name: t.name, planName: plan?.name ?? 'Free', jobs, maxJobs, rows, maxRows, jobsPct, rowsPct, topPct: Math.max(jobsPct, rowsPct) };
    })
    .sort((a, b) => b.topPct - a.topPct);

  const totalJobsMonth = tenantUsageEntries.reduce((s, t) => s + t.jobs, 0);
  const totalRowsMonth = tenantUsageEntries.reduce((s, t) => s + t.rows, 0);

  // Agent status computation
  interface AgentKeyRow {
    id: string;
    name: string;
    key_prefix: string;
    tenant_id: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }

  function agentStatus(key: AgentKeyRow): 'online' | 'idle' | 'offline' | 'never' {
    if (!key.last_used_at) return 'never';
    const lastSeen = new Date(key.last_used_at);
    const diffMs = now.getTime() - lastSeen.getTime();
    if (diffMs < 15 * 60 * 1000) return 'online';
    if (diffMs < 24 * 60 * 60 * 1000) return 'idle';
    return 'offline';
  }

  const activeApiKeys = ((apiKeys ?? []) as AgentKeyRow[]).filter(
    (k) => !k.expires_at || new Date(k.expires_at) > now
  );
  const offlineCount = activeApiKeys.filter((k) => agentStatus(k) === 'offline').length;

  const JOB_STATUS_COLOURS: Record<string, string> = {
    completed: 'var(--green)', processing: 'var(--blue)', failed: 'var(--error)', pending: 'var(--muted)', queued: '#92620A',
  };

  const AGENT_STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
    online:  { color: 'var(--green)', bg: '#EDFAF3', border: '#A8DFBE', label: 'Online' },
    idle:    { color: '#92620A', bg: '#FFF8E6', border: '#F5D98C', label: 'Idle' },
    offline: { color: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2', label: 'Offline' },
    never:   { color: 'var(--muted)', bg: '#F7FAFC', border: 'var(--border)', label: 'Never connected' },
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>Platform Overview</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Real-time summary across all tenants and users</p>
      </div>

      {/* Offline agent warning banner */}
      {offlineCount > 0 && (
        <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92620A', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>
            <strong>{offlineCount} agent{offlineCount !== 1 ? 's have' : ' has'} not reported in the last 15 minutes.</strong>
            {' '}Check the Agent Status section below for details.
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard
          label="Production Tenants"
          value={totalTenants}
          sub={`${activeTenants} active · ${trialTenants} trial · ${suspendedTenants} suspended`}
        />
        <StatCard label="Sandbox Environments" value={sandboxTenants} sub="Linked test tenants" />
        <StatCard label="Total Users" value={totalUsers} sub={`${activeUsers} active`} />
        <StatCard
          label="New This Month"
          value={tenantsThisMonth + usersThisMonth}
          sub={`${tenantsThisMonth} tenant${tenantsThisMonth !== 1 ? 's' : ''} · ${usersThisMonth} user${usersThisMonth !== 1 ? 's' : ''}`}
        />
        <StatCard label="Jobs This Month" value={totalJobsMonth.toLocaleString()} sub="All tenants combined" />
        <StatCard label="Rows Processed" value={totalRowsMonth.toLocaleString()} sub={`${yearMonth}`} />
      </div>

      {/* Tenant status bar */}
      {totalTenants > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 10 }}>Tenant Status Breakdown</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
            {activeTenants > 0 && <div style={{ flex: activeTenants / barTotal, background: 'var(--green)', borderRadius: 3 }} title={`${activeTenants} active`} />}
            {trialTenants > 0 && <div style={{ flex: trialTenants / barTotal, background: '#F59E0B', borderRadius: 3 }} title={`${trialTenants} trial`} />}
            {suspendedTenants > 0 && <div style={{ flex: suspendedTenants / barTotal, background: 'var(--error)', borderRadius: 3 }} title={`${suspendedTenants} suspended`} />}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
            {activeTenants > 0 && <span><span style={{ color: 'var(--green)', fontWeight: 600 }}>●</span> {activeTenants} Active</span>}
            {trialTenants > 0 && <span><span style={{ color: '#F59E0B', fontWeight: 600 }}>●</span> {trialTenants} Trial</span>}
            {suspendedTenants > 0 && <span><span style={{ color: 'var(--error)', fontWeight: 600 }}>●</span> {suspendedTenants} Suspended</span>}
          </div>
        </div>
      )}

      {/* Usage by Tenant */}
      {tenantUsageEntries.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Usage This Month</span>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
                Sorted by highest usage %. Red rows = ≥ 90% of plan limit.
              </p>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>{yearMonth}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'Plan', 'Jobs', 'Rows Processed', ''].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantUsageEntries.map((t) => {
                const atRisk = t.topPct >= 90;
                const warning = !atRisk && t.topPct >= 70;
                const rowBg = atRisk ? '#FFF4F4' : warning ? '#FFFBF0' : undefined;
                return (
                  <tr key={t.id} style={{ background: rowBg }}>
                    <td style={tdStyle}>
                      <Link href={`/platform/tenants/${t.id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {t.name}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.planName}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: t.jobsPct >= 90 ? 'var(--error)' : t.jobsPct >= 70 ? '#92620A' : 'var(--navy)' }}>
                        {t.jobs.toLocaleString()}
                        {t.maxJobs
                          ? <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> / {t.maxJobs.toLocaleString()} ({t.jobsPct}%)</span>
                          : <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> jobs</span>}
                      </span>
                      {t.maxJobs && (
                        <div style={{ height: 3, background: '#EEF2F5', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${t.jobsPct}%`, background: t.jobsPct >= 90 ? 'var(--error)' : t.jobsPct >= 70 ? '#F59E0B' : 'var(--green)', borderRadius: 2 }} />
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: t.rowsPct >= 90 ? 'var(--error)' : t.rowsPct >= 70 ? '#92620A' : 'var(--navy)' }}>
                        {t.rows.toLocaleString()}
                        {t.maxRows
                          ? <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> / {t.maxRows.toLocaleString()} ({t.rowsPct}%)</span>
                          : <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> rows</span>}
                      </span>
                      {t.maxRows && (
                        <div style={{ height: 3, background: '#EEF2F5', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${t.rowsPct}%`, background: t.rowsPct >= 90 ? 'var(--error)' : t.rowsPct >= 70 ? '#F59E0B' : 'var(--green)', borderRadius: 2 }} />
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/platform/tenants/${t.id}/usage`} style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        {/* Recent audit */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Recent Activity</span>
            <Link href="/audit" style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['When', 'Tenant', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!(recentAudit ?? []).length ? (
                <tr><td colSpan={3} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No activity yet.</td></tr>
              ) : (recentAudit ?? []).map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {row.tenant_id ? (tenantMap[row.tenant_id] ?? row.tenant_id.slice(0, 8) + '…') : <span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 11 }}>Platform</span>}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--navy)' }}>
                      {OP_LABELS[row.operation] ?? row.operation}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent jobs */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Recent Jobs</span>
          </div>
          {!(recentJobs ?? []).length ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No jobs yet.</div>
          ) : (recentJobs ?? []).map((job) => (
            <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #EEF2F5' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>
                {new Date(job.created_at).toLocaleDateString('en-GB', { dateStyle: 'short' })}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: JOB_STATUS_COLOURS[job.status] ?? 'var(--muted)', background: `${JOB_STATUS_COLOURS[job.status] ?? 'var(--muted)'}18`, padding: '2px 7px', borderRadius: 4 }}>
                {job.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Status */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Agent Status</span>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
              Based on API key last-used timestamp. Online = seen within 15 min.
            </p>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{activeApiKeys.length} key{activeApiKeys.length !== 1 ? 's' : ''}</span>
        </div>
        {activeApiKeys.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active API keys.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'Key Name', 'Prefix', 'Last Seen', 'Status'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeApiKeys.map((key) => {
                const status = agentStatus(key);
                const s = AGENT_STATUS_STYLE[status];
                return (
                  <tr key={key.id}>
                    <td style={tdStyle}>
                      <Link href={`/platform/tenants/${key.tenant_id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
                        {tenantMap[key.tenant_id] ?? key.tenant_id.slice(0, 8) + '…'}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, color: 'var(--navy)' }}>{key.name}</span>
                    </td>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', background: '#F0F4F8', padding: '2px 6px', borderRadius: 4 }}>
                        {key.key_prefix}…
                      </code>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '2px 7px' }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        {[
          { href: '/platform/tenants', label: 'Manage Tenants' },
          { href: '/platform/users', label: 'All Users' },
          { href: '/platform/billing', label: 'Billing Report' },
          { href: '/audit', label: 'Audit Log' },
          { href: '/platform/settings', label: 'Platform Settings' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{ fontSize: 13, color: 'var(--blue)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', textDecoration: 'none', background: 'var(--surface)', fontWeight: 500 }}>
            {label} →
          </Link>
        ))}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
