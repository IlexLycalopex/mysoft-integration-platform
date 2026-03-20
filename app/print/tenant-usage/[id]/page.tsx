import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import { getUsageForTenant, refreshUsageSnapshot, type UsageSnapshot, type PlanRow } from '@/lib/actions/usage';
import PrintButton from './PrintButton';

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
  if (p >= 90) return '#C0392B';
  if (p >= 70) return '#F59E0B';
  return '#1A6B30';
}

function UsageRow({
  label,
  used,
  max,
  formattedUsed,
  formattedMax,
}: {
  label: string;
  used: number;
  max: number | null | undefined;
  formattedUsed: string;
  formattedMax: string;
}) {
  const p = pct(used, max);
  const colour = barColour(p);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1A2B38' }}>{label}</span>
        <span style={{ fontSize: 12, color: p >= 90 ? '#C0392B' : p >= 70 ? '#92620A' : '#4A5568' }}>
          {formattedUsed}
          {max ? ` / ${formattedMax} (${p}%)` : ' / Unlimited'}
        </span>
      </div>
      <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: max ? `${p}%` : '4%', background: colour, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default async function TenantUsageReportPage({ params }: { params: Promise<{ id: string }> }) {
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

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, plan_id')
    .eq('id', id)
    .single<{ id: string; name: string; plan_id: string | null }>();

  if (!tenant) notFound();

  let usageData = await getUsageForTenant(id);
  if (!usageData.snapshot) {
    await refreshUsageSnapshot(id);
    usageData = await getUsageForTenant(id);
  }

  const { snapshot, plan, history }: { snapshot: UsageSnapshot | null; plan: PlanRow | null; history: UsageSnapshot[] } = usageData;
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.5,
    color: '#6B7280',
    textTransform: 'uppercase',
    padding: '8px 12px',
    textAlign: 'left',
    background: '#F9FAFB',
    borderBottom: '1px solid #E5E7EB',
  };
  const tdStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderBottom: '1px solid #F0F4F8',
    fontSize: 12,
    verticalAlign: 'middle',
    color: '#1A2B38',
  };

  return (
    <>
      {/* Print styles — hide print button and enforce white bg */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            @page { margin: 1.5cm; }
          }
          body { margin: 0; background: #F7FAFC; font-family: var(--font-dm-sans, system-ui, sans-serif); }
        `
      }} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px', background: '#fff', minHeight: '100vh' }}>

        {/* Print button — hidden when printing */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <PrintButton />
        </div>

        {/* Header */}
        <div style={{ borderBottom: '2px solid #1A2B38', paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4A5568', marginBottom: 4 }}>
                Mysoft Integration Platform
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A2B38', margin: 0, letterSpacing: -0.3 }}>
                Usage Report — {tenant.name}
              </h1>
              <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0' }}>
                Period: {snapshot?.year_month ?? 'Current month'}
                {' · '}
                Plan: <strong>{plan?.name ?? 'Free'}</strong>
                {plan?.price_gbp_monthly != null && ` · £${Number(plan.price_gbp_monthly).toFixed(2)}/mo`}
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#9CA3AF' }}>
              <div>Generated</div>
              <div style={{ fontWeight: 500 }}>{generatedAt}</div>
            </div>
          </div>
        </div>

        {/* Current month usage */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1A2B38', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            This Month&apos;s Usage
          </h2>
          <UsageRow
            label="Integration Jobs"
            used={snapshot?.jobs_count ?? 0}
            max={plan?.max_jobs_per_month}
            formattedUsed={(snapshot?.jobs_count ?? 0).toLocaleString()}
            formattedMax={plan?.max_jobs_per_month?.toLocaleString() ?? 'Unlimited'}
          />
          <UsageRow
            label="Rows Processed"
            used={snapshot?.rows_processed ?? 0}
            max={plan?.max_rows_per_month}
            formattedUsed={(snapshot?.rows_processed ?? 0).toLocaleString()}
            formattedMax={plan?.max_rows_per_month?.toLocaleString() ?? 'Unlimited'}
          />
          <UsageRow
            label="Storage Used"
            used={snapshot ? Math.round(snapshot.storage_bytes / (1024 * 1024)) : 0}
            max={plan?.max_storage_mb}
            formattedUsed={fmtBytes(snapshot?.storage_bytes ?? 0)}
            formattedMax={plan?.max_storage_mb ? `${plan.max_storage_mb} MB` : 'Unlimited'}
          />
          {snapshot && (
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: '8px 0 0' }}>
              Usage data computed: {new Date(snapshot.computed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>

        {/* Plan limits summary */}
        {plan && (
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 16px', marginBottom: 28 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Plan Entitlements</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Max Jobs / Month', value: plan.max_jobs_per_month?.toLocaleString() ?? 'Unlimited' },
                { label: 'Max Rows / Month', value: plan.max_rows_per_month?.toLocaleString() ?? 'Unlimited' },
                { label: 'Max Storage', value: plan.max_storage_mb ? `${plan.max_storage_mb} MB` : 'Unlimited' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2B38', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Usage history */}
        {history.length > 0 && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1A2B38', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Usage History — Last 6 Months
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
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
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'var(--font-dm-mono, monospace)' }}>{row.year_month}</td>
                    <td style={tdStyle}>{row.jobs_count.toLocaleString()}</td>
                    <td style={tdStyle}>{row.rows_processed.toLocaleString()}</td>
                    <td style={tdStyle}>{fmtBytes(row.storage_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #E5E7EB', fontSize: 10, color: '#9CA3AF', display: 'flex', justifyContent: 'space-between' }}>
          <span>Mysoft Integration Platform — Confidential</span>
          <span>Tenant ID: {tenant.id}</span>
        </div>
      </div>
    </>
  );
}
