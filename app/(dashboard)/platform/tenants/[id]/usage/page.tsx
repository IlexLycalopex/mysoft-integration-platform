import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import {
  getUsageForTenant,
  refreshUsageSnapshot,
  type UsageSnapshot,
} from '@/lib/actions/usage';
import TenantTabNav from '@/components/platform/TenantTabNav';

interface TenantRow {
  id: string;
  name: string;
  plan_id: string | null;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function pct(used: number, max: number | null | undefined): number {
  if (!max) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function barColour(p: number): string {
  if (p >= 90) return 'var(--error)';
  if (p >= 70) return '#F59E0B';
  return 'var(--green)';
}

function ProgressBar({ used, max, label, formattedUsed, formattedMax }: {
  used: number;
  max: number | null | undefined;
  label: string;
  formattedUsed: string;
  formattedMax: string;
}) {
  if (!max) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formattedUsed} / Unlimited</span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
          <div style={{ height: '100%', width: '4%', background: 'var(--green)', borderRadius: 3 }} />
        </div>
      </div>
    );
  }
  const p = pct(used, max);
  const colour = barColour(p);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{label}</span>
        <span style={{ fontSize: 12, color: p >= 90 ? 'var(--error)' : p >= 70 ? '#92620A' : 'var(--muted)' }}>
          {formattedUsed} / {formattedMax} ({p}%)
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: colour, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

export default async function TenantUsagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const canEdit = profile.role === 'platform_super_admin';

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, plan_id')
    .eq('id', id)
    .single<TenantRow>();

  if (!tenant) notFound();

  // Fetch usage data; if no snapshot for current month, refresh it inline
  let usageData = await getUsageForTenant(id);
  if (!usageData.snapshot) {
    await refreshUsageSnapshot(id);
    usageData = await getUsageForTenant(id);
  }

  const { snapshot, plan, history } = usageData;

  const thStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    padding: '9px 16px',
    textAlign: 'left',
    background: '#F7FAFC',
    borderBottom: '1px solid var(--border)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '11px 16px',
    borderBottom: '1px solid #EEF2F5',
    fontSize: 13,
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      {/* Breadcrumb + heading */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          <Link href="/platform/tenants" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Tenants</Link>
          <span>›</span>
          <Link href={`/platform/tenants/${id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{tenant.name}</Link>
          <span>›</span>
          <span>Usage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            {tenant.name}
          </h1>
          <Link
            href={`/print/tenant-usage/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Export PDF
          </Link>
        </div>
      </div>

      <TenantTabNav tenantId={id} active="usage" />

      {/* Current Plan — read-only summary; manage in Subscription tab */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: '0 0 4px' }}>Current Plan</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{plan?.name ?? 'Free'}</span>
              {plan?.price_gbp_monthly != null ? (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  £{Number(plan.price_gbp_monthly).toFixed(2)}/month
                </span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Custom pricing</span>
              )}
            </div>
            {plan?.description && (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>{plan.description}</p>
            )}
          </div>
          {plan?.features && plan.features.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280, justifyContent: 'flex-end' }}>
              {plan.features.map((f) => (
                <span key={f} style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)', background: '#EBF5FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
          To change this tenant&apos;s plan, use the{' '}
          <a href={`/platform/tenants/${id}/subscription`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>Subscription</a> tab.
        </p>
      </div>

      {/* Current Month Usage */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: '0 0 16px' }}>
          This Month&apos;s Usage
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
            {snapshot?.year_month ?? 'current period'}
          </span>
        </h2>

        <ProgressBar
          label="Jobs"
          used={snapshot?.jobs_count ?? 0}
          max={plan?.max_jobs_per_month}
          formattedUsed={(snapshot?.jobs_count ?? 0).toLocaleString()}
          formattedMax={plan?.max_jobs_per_month?.toLocaleString() ?? 'Unlimited'}
        />
        <ProgressBar
          label="Rows Processed"
          used={snapshot?.rows_processed ?? 0}
          max={plan?.max_rows_per_month}
          formattedUsed={(snapshot?.rows_processed ?? 0).toLocaleString()}
          formattedMax={plan?.max_rows_per_month?.toLocaleString() ?? 'Unlimited'}
        />
        <ProgressBar
          label="Storage"
          used={snapshot ? Math.round(snapshot.storage_bytes / (1024 * 1024)) : 0}
          max={plan?.max_storage_mb}
          formattedUsed={fmtBytes(snapshot?.storage_bytes ?? 0)}
          formattedMax={plan?.max_storage_mb ? `${plan.max_storage_mb} MB` : 'Unlimited'}
        />

        {snapshot && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, marginBottom: 0 }}>
            Last computed: {new Date(snapshot.computed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </div>

      {/* Usage History */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
            Usage History
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>last 6 months</span>
          </h2>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No historical usage data available.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Month', 'Jobs', 'Rows Processed', 'Storage'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row: UsageSnapshot) => (
                <tr key={row.id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--navy)', fontFamily: 'var(--font-dm-mono)' }}>
                    {row.year_month}
                  </td>
                  <td style={tdStyle}>{row.jobs_count.toLocaleString()}</td>
                  <td style={tdStyle}>{row.rows_processed.toLocaleString()}</td>
                  <td style={tdStyle}>{fmtBytes(row.storage_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
