import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import InviteUserButton from './InviteUserButton';
import SettingsNav from '@/components/layout/SettingsNav';
import SendResetButton from '@/components/ui/SendResetButton';
import EditRoleSelect from '@/components/ui/EditRoleSelect';
import type { UserRole } from '@/types/database';

interface UserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  kind: 'user';
}

interface InviteRow {
  id: string;
  email: string;
  role: UserRole;
  expires_at: string;
  created_at: string;
  kind: 'invite';
}

type Row = UserRow | InviteRow;

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canManage = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'].includes(myProfile?.role ?? '');

  const admin = createAdminClient();

  const [profilesResult, invitesResult] = await Promise.all([
    admin
      .from('user_profiles')
      .select('id, first_name, last_name, role, is_active, created_at')
      .eq('tenant_id', myProfile?.tenant_id ?? '')
      .order('created_at', { ascending: true }),
    admin
      .from('user_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('tenant_id', myProfile?.tenant_id ?? '')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const userRows: UserRow[] = ((profilesResult.data ?? []) as { id: string; first_name: string | null; last_name: string | null; role: string; is_active: boolean; created_at: string }[]).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    role: p.role as UserRole,
    is_active: p.is_active,
    created_at: p.created_at,
    kind: 'user' as const,
  }));

  const inviteRows: InviteRow[] = ((invitesResult.data ?? []) as { id: string; email: string; role: string; created_at: string; expires_at: string }[]).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as UserRole,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
    kind: 'invite' as const,
  }));

  // Merge: active users first, then invites at the bottom
  const rows: Row[] = [...userRows, ...inviteRows];

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Tenant configuration and preferences
        </p>
      </div>

      <SettingsNav role={myProfile?.role ?? 'tenant_auditor'} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Team Members</span>
        {canManage && <InviteUserButton />}
      </div>

      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>Team Members</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {userRows.filter((r) => r.is_active).length} active
            {inviteRows.length > 0 && ` · ${inviteRows.length} pending`}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name / Email', 'Role', 'Status', 'Date', ...(canManage ? [''] : [])].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canManage ? 5 : 4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No users yet.</td></tr>
            ) : rows.map((row) => {
              if (row.kind === 'invite') {
                return (
                  <tr key={`invite-${row.id}`} style={{ opacity: 0.85 }}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 13, color: 'var(--navy)', fontStyle: 'italic' }}>{row.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Invite pending</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#EEF2F5', color: '#6B8599' }}>
                        {row.role.replace('tenant_', '').charAt(0).toUpperCase() + row.role.replace('tenant_', '').slice(1)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px' }}>
                        Invited
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Pending
                      </span>
                    </td>
                    {canManage && <td style={tdStyle} />}
                  </tr>
                );
              }

              const u = row as UserRow;
              return (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>{u.id.slice(0, 8)}…</div>
                  </td>
                  <td style={tdStyle}>
                    {canManage && u.is_active
                      ? <EditRoleSelect userId={u.id} currentRole={u.role} />
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#EEF2F5', color: '#1A2B38' }}>{u.role.replace('tenant_', '').charAt(0).toUpperCase() + u.role.replace('tenant_', '').slice(1)}</span>
                    }
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: u.is_active ? 'var(--green)' : 'var(--muted)' }}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(u.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {u.is_active && <SendResetButton userId={u.id} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' };
const panelHeadStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const panelTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--navy)' };
const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
