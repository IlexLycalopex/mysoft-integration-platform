import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RoleBadge } from '@/components/ui/Badge';
import type { UserRole } from '@/types/database';
import TenantFilter from './TenantFilter';
import UserSearch from './UserSearch';

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; q?: string }>;
}) {
  const { tenant: tenantFilter, q } = await searchParams;

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

  let profilesQuery = admin
    .from('user_profiles')
    .select('id, first_name, last_name, role, is_active, tenant_id, created_at')
    .order('created_at', { ascending: false });

  if (tenantFilter === '__platform__') {
    profilesQuery = profilesQuery.is('tenant_id', null);
  } else if (tenantFilter) {
    profilesQuery = profilesQuery.eq('tenant_id', tenantFilter);
  }

  let { data: profiles } = await profilesQuery;
  const { data: tenants } = await admin.from('tenants').select('id, name').order('name');

  // Fetch auth emails for search
  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name]));

  // Apply search filter
  if (q) {
    const lq = q.toLowerCase();
    profiles = (profiles ?? []).filter((p) => {
      const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase();
      return fullName.includes(lq) || p.id.toLowerCase().includes(lq);
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>All Users</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {profiles?.length ?? 0} user{profiles?.length !== 1 ? 's' : ''}
            {tenantFilter ? (tenantFilter === '__platform__' ? ' · platform users' : ` · ${tenantMap[tenantFilter] ?? 'unknown tenant'}`) : ' across all tenants'}
            {q ? ` matching "${q}"` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Suspense>
            <UserSearch />
          </Suspense>
          <Suspense>
            <TenantFilter tenants={tenants ?? []} basePath="/platform/users" />
          </Suspense>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['User', 'Tenant', 'Role', 'Status', 'Joined'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!profiles?.length ? (
              <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No users found.</td></tr>
            ) : profiles.map((p) => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>
                    {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>{p.id.slice(0, 12)}…</div>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 13 }}>
                    {p.tenant_id ? tenantMap[p.tenant_id] ?? <span style={{ color: 'var(--muted)' }}>Unknown</span> : <span style={{ color: 'var(--blue)', fontSize: 11, fontWeight: 600 }}>Platform</span>}
                  </span>
                </td>
                <td style={tdStyle}><RoleBadge role={p.role as UserRole} /></td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: p.is_active ? 'var(--green)' : 'var(--muted)' }}>
                    {p.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(p.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
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
