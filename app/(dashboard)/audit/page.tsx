import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';
import AuditTenantFilter from './AuditTenantFilter';
import AuditExportButton from './AuditExportButton';
import Pagination from '@/components/ui/Pagination';

const OP_LABELS: Record<string, string> = {
  create_tenant:       'Create Tenant',
  update_tenant:       'Update Tenant',
  create_invite:       'Send Invite',
  accept_invite:       'Accept Invite',
  save_credentials:    'Save Credentials',
  update_credentials:  'Update Credentials',
  update_user_role:    'Update Role',
  deactivate_user:     'Deactivate User',
  create_upload_job:   'Upload File',
  create_mapping:      'Create Mapping',
  update_mapping:      'Update Mapping',
  delete_mapping:      'Delete Mapping',
  cancel_upload_job:   'Cancel Job',
  delete_upload_job:   'Delete Job',
  force_kill_job:      'Force Cancel Job',
  create_watcher:      'Create Watcher',
  update_watcher:      'Update Watcher',
  archive_watcher:     'Archive Watcher',
};

const OP_COLOURS: Record<string, string> = {
  create_tenant:       'var(--blue)',
  update_tenant:       'var(--navy)',
  create_invite:       '#7B5EA7',
  accept_invite:       'var(--green)',
  save_credentials:    '#B45309',
  update_credentials:  '#B45309',
  update_user_role:    '#0369A1',
  deactivate_user:     'var(--error)',
  create_upload_job:   '#0369A1',
  create_mapping:      'var(--green)',
  update_mapping:      'var(--navy)',
  delete_mapping:      'var(--error)',
  cancel_upload_job:   'var(--muted)',
  delete_upload_job:   'var(--error)',
  force_kill_job:      'var(--error)',
  create_watcher:      'var(--green)',
  update_watcher:      'var(--navy)',
  archive_watcher:     '#6b7280',
};

interface AuditRow {
  id: string;
  operation: string;
  resource_type: string | null;
  resource_id: string | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  tenant_id: string | null;
}

const VALID_PAGE_SIZES = [10, 25, 50];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; page?: string; pageSize?: string }>;
}) {
  const { tenant: tenantFilter, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10));
  const pageSize = VALID_PAGE_SIZES.includes(parseInt(pageSizeParam ?? '25', 10))
    ? parseInt(pageSizeParam ?? '25', 10)
    : 25;
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const isSuperAdmin = profile.role === 'platform_super_admin';

  // Resolve effective tenant — handles impersonation mode for platform/support admins
  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  let query = admin
    .from('audit_log')
    .select('id, operation, resource_type, resource_id, new_values, created_at, user_id, tenant_id', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (!isPlatformAdmin) {
    // Tenant users: strictly scope to own tenant
    if (!effectiveTenantId) redirect('/dashboard');
    query = query.eq('tenant_id', effectiveTenantId);
  } else if (tenantFilter === '__platform__') {
    // Explicit filter: platform-level events (no tenant)
    query = query.is('tenant_id', null);
  } else if (tenantFilter) {
    // Explicit filter: specific tenant chosen in dropdown
    query = query.eq('tenant_id', tenantFilter);
  } else if (effectiveTenantId && !isSuperAdmin) {
    // Support admins in impersonation mode with no explicit filter:
    // default to current tenant to prevent accidental cross-tenant data exposure
    query = query.eq('tenant_id', effectiveTenantId);
  }
  // Super admins with no filter and no impersonation: see all (intended)

  query = query.range(offset, offset + pageSize - 1);

  const { data: rows, count: totalAudit } = await query as { data: AuditRow[] | null; count: number | null };

  // Fetch tenants for filter dropdown (platform admins only)
  const { data: tenants } = isPlatformAdmin
    ? await admin.from('tenants').select('id, name').order('name')
    : { data: null };

  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name]));

  // Build user display map
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
  let userMap: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('id, first_name, last_name')
      .in('id', userIds) as {
        data: { id: string; first_name: string | null; last_name: string | null }[] | null
      };
    userMap = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.id,
        p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.id.slice(0, 8) + '…',
      ])
    );
  }

  const filterLabel = isPlatformAdmin && tenantFilter
    ? tenantFilter === '__platform__' ? ' · platform events' : ` · ${tenantMap[tenantFilter] ?? 'unknown tenant'}`
    : !isPlatformAdmin ? ' for your tenant' : '';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            Audit Log
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {totalAudit ?? 0} event{(totalAudit ?? 0) !== 1 ? 's' : ''} recorded{filterLabel}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isPlatformAdmin && tenants && (
            <Suspense>
              <AuditTenantFilter tenants={tenants} />
            </Suspense>
          )}
          <AuditExportButton rows={rows ?? []} userMap={userMap} tenantMap={tenantMap} opLabels={OP_LABELS} />
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['When', 'User', ...(isPlatformAdmin && !tenantFilter ? ['Tenant'] : []), 'Action', 'Resource', 'Detail'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan={isPlatformAdmin && !tenantFilter ? 6 : 5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No audit events yet.
                </td>
              </tr>
            ) : rows.map((row) => {
              const opLabel = OP_LABELS[row.operation] ?? row.operation;
              const opColour = OP_COLOURS[row.operation] ?? 'var(--muted)';
              const detail = row.new_values
                ? Object.entries(row.new_values)
                    .filter(([k]) => !k.toLowerCase().includes('password'))
                    .slice(0, 2)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')
                : null;

              return (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', whiteSpace: 'nowrap' }}>
                      {new Date(row.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--navy)' }}>
                      {row.user_id ? (userMap[row.user_id] ?? row.user_id.slice(0, 8) + '…') : '—'}
                    </span>
                  </td>
                  {isPlatformAdmin && !tenantFilter && (
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {row.tenant_id ? (tenantMap[row.tenant_id] ?? <span style={{ fontFamily: 'var(--font-dm-mono)' }}>{row.tenant_id.slice(0, 8)}…</span>) : <span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 11 }}>Platform</span>}
                      </span>
                    </td>
                  )}
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: opColour, background: `${opColour}18`, border: `1px solid ${opColour}40`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      {opLabel}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {row.resource_type ?? '—'}
                      {row.resource_id && (
                        <span style={{ fontFamily: 'var(--font-dm-mono)', marginLeft: 4 }}>
                          {String(row.resource_id).slice(0, 8)}…
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>
                      {detail ?? '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Suspense>
          <Pagination total={totalAudit ?? 0} page={page} pageSize={pageSize} />
        </Suspense>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
