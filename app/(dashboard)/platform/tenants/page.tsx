import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatusBadge } from '@/components/ui/Badge';
import type { UserRole, TenantStatus, TenantRegion } from '@/types/database';
import TenantSearchFilter from './TenantSearchFilter';

const REGION_LABELS: Record<TenantRegion, string> = { uk: 'United Kingdom', us: 'United States', eu: 'European Union' };

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q, filter } = await searchParams;

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
  const { data: allTenants } = await admin
    .from('tenants')
    .select('id, name, slug, region, status, is_sandbox, created_at')
    .order('created_at', { ascending: false });

  // Get user counts per tenant
  const { data: userCounts } = await admin.from('user_profiles').select('tenant_id');
  const countMap = (userCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.tenant_id) acc[row.tenant_id] = (acc[row.tenant_id] ?? 0) + 1;
    return acc;
  }, {});

  // Apply filters
  let tenants = allTenants ?? [];
  if (q) {
    const lq = q.toLowerCase();
    tenants = tenants.filter((t) => t.name.toLowerCase().includes(lq) || t.slug.toLowerCase().includes(lq));
  }
  if (filter === 'production') tenants = tenants.filter((t) => !t.is_sandbox);
  else if (filter === 'sandbox') tenants = tenants.filter((t) => t.is_sandbox);
  else if (filter === 'active') tenants = tenants.filter((t) => t.status === 'active');
  else if (filter === 'trial') tenants = tenants.filter((t) => t.status === 'trial');
  else if (filter === 'suspended') tenants = tenants.filter((t) => t.status === 'suspended');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>Tenants</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {tenants.length} of {allTenants?.length ?? 0} tenant{allTenants?.length !== 1 ? 's' : ''}
            {q || filter ? ' (filtered)' : ' registered'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Suspense>
            <TenantSearchFilter initialSearch={q ?? ''} initialFilter={filter ?? ''} />
          </Suspense>
          {profile.role === 'platform_super_admin' && (
            <Link
              href="/platform/tenants/new"
              style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New tenant
            </Link>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Tenant', 'Region', 'Status', 'Users', 'Created'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!tenants.length ? (
              <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {q || filter ? 'No tenants match your search.' : 'No tenants yet. Create your first tenant to get started.'}
              </td></tr>
            ) : tenants.map((t) => (
              <tr key={t.id}>
                <td style={tdStyle}>
                  <Link href={`/platform/tenants/${t.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--blue)' }}>{t.name}</div>
                      {t.is_sandbox && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#7A5500', background: '#FFF3CD', border: '1px solid #E8C84A', borderRadius: 3, padding: '1px 5px' }}>SANDBOX</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', marginTop: 2 }}>{t.slug}</div>
                  </Link>
                </td>
                <td style={tdStyle}><span style={{ fontSize: 13 }}>{REGION_LABELS[t.region as TenantRegion]}</span></td>
                <td style={tdStyle}><StatusBadge status={t.status as TenantStatus} /></td>
                <td style={tdStyle}><span style={{ fontSize: 13, fontWeight: 500 }}>{countMap[t.id] ?? 0}</span></td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(t.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
