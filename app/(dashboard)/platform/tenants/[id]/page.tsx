import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatusBadge } from '@/components/ui/Badge';
import SendResetButton from '@/components/ui/SendResetButton';
import EditRoleSelect from '@/components/ui/EditRoleSelect';
import type { UserRole, TenantStatus, TenantRegion } from '@/types/database';
import TenantDetailForm from './TenantDetailForm';
import SandboxPanel from './SandboxPanel';
import InviteTenantUserForm from './InviteTenantUserForm';
import ArchiveTenantButton from './ArchiveTenantButton';
import DeleteTenantButton from './DeleteTenantButton';
import { getActiveSubscription } from '@/lib/actions/subscriptions';
import { startEmulation } from '@/lib/actions/emulation';
import TenantTabNav from '@/components/platform/TenantTabNav';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  home_region: TenantRegion;
  status: TenantStatus;
  is_sandbox: boolean;
  sandbox_of: string | null;
  created_at: string;
  trial_ends_at: string | null;
  archived_at: string | null;
}

interface SandboxRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface UserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: UserRole;
  expires_at: string;
  created_at: string;
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const canEdit = profile.role === 'platform_super_admin';
  const admin = createAdminClient();

  const now = new Date();

  const [{ data: tenant }, usersResult, { data: sandboxRow }, invitesResult, apiKeysResult, activeSub] = await Promise.all([
    admin.from('tenants').select('id, name, slug, home_region, status, is_sandbox, sandbox_of, created_at, trial_ends_at, archived_at').eq('id', id).single<TenantRow>(),
    admin.from('user_profiles').select('id, first_name, last_name, role, is_active, created_at').eq('tenant_id', id).order('created_at'),
    admin.from('tenants').select('id, name, status, created_at').eq('sandbox_of', id).eq('is_sandbox', true).maybeSingle<SandboxRow>(),
    admin
      .from('user_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('tenant_id', id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    admin
      .from('api_keys')
      .select('id, name, key_prefix, last_used_at, expires_at, revoked_at, created_at')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false }),
    getActiveSubscription(id),
  ]);

  const users = (usersResult as { data: UserRow[] | null }).data ?? [];
  const invites = (invitesResult as { data: InviteRow[] | null }).data ?? [];

  interface ApiKeyTenantRow {
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }

  function agentStatusForKey(key: ApiKeyTenantRow): 'online' | 'idle' | 'offline' | 'never' {
    if (!key.last_used_at) return 'never';
    const diffMs = now.getTime() - new Date(key.last_used_at).getTime();
    if (diffMs < 15 * 60 * 1000) return 'online';
    if (diffMs < 24 * 60 * 60 * 1000) return 'idle';
    return 'offline';
  }

  const AGENT_STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
    online:  { color: 'var(--green)', bg: '#EDFAF3', border: '#A8DFBE', label: 'Online' },
    idle:    { color: '#92620A', bg: '#FFF8E6', border: '#F5D98C', label: 'Idle' },
    offline: { color: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2', label: 'Offline' },
    never:   { color: 'var(--muted)', bg: '#F7FAFC', border: 'var(--border)', label: 'Never connected' },
  };

  const tenantApiKeys = (apiKeysResult as { data: ApiKeyTenantRow[] | null }).data ?? [];

  if (!tenant) notFound();

  // Pre-compute trial / archive display values (avoids calling Date.now() inside JSX)
  const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const trialDaysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000) : null;
  const trialExpired = trialDaysLeft !== null && trialDaysLeft <= 0;

  const archiveDate = tenant.archived_at ? new Date(tenant.archived_at) : null;
  const purgeDate = archiveDate ? new Date(archiveDate.getTime() + 90 * 86400000) : null;
  const daysUntilPurge = purgeDate ? Math.max(0, Math.ceil((purgeDate.getTime() - now.getTime()) / 86400000)) : null;

  const STATUS_ACCENT: Partial<Record<TenantStatus, { bg: string; border: string; color: string }>> = {
    trial:      { bg: '#FFFBEB', border: '#F5D98C', color: '#7A5500' },
    suspended:  { bg: '#FDE8E6', border: '#F5C6C2', color: '#9B2B1E' },
    offboarded: { bg: '#FDE8E6', border: '#F5C6C2', color: '#9B2B1E' },
  };
  const accent = STATUS_ACCENT[tenant.status];

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div style={{
        marginBottom: 24,
        ...(accent ? {
          background: accent.bg,
          border: `1px solid ${accent.border}`,
          borderLeft: `4px solid ${accent.border}`,
          borderRadius: 6,
          padding: '12px 16px',
        } : {}),
      }}>
        <Link href="/platform/tenants" style={{ fontSize: 12, color: accent ? accent.color : 'var(--muted)', textDecoration: 'none' }}>
          ← Tenants
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 2px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: accent ? accent.color : 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            {tenant.name}
          </h1>
          <StatusBadge status={tenant.status} />
        </div>
        <p style={{ fontSize: 12, color: accent ? accent.color : 'var(--muted)', margin: 0, fontFamily: 'var(--font-dm-mono)', opacity: 0.75 }}>
          {tenant.id}
        </p>
      </div>

      {/* Trial expiry warning */}
      {tenant.status === 'trial' && trialEnd && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: trialExpired ? '#FDE8E6' : '#FFF8E6', border: `1px solid ${trialExpired ? '#F5C6C2' : '#F5D98C'}`, borderRadius: 6, fontSize: 12, color: trialExpired ? '#9B2B1E' : '#7A5500', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{trialExpired ? '⚠️' : '⏳'}</span>
          <span>
            {trialExpired
              ? <><strong>Trial expired</strong> — tenant is scheduled to be suspended by the daily cron.</>
              : <><strong>Trial ends {trialEnd.toLocaleDateString('en-GB', { dateStyle: 'medium' })}</strong> — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining. Convert to a paid plan in <Link href={`/platform/tenants/${tenant.id}/subscription`} style={{ color: '#7A5500', fontWeight: 600 }}>Subscription</Link>.</>
            }
          </span>
        </div>
      )}

      {/* Offboarded / archived countdown */}
      {tenant.status === 'offboarded' && archiveDate && purgeDate && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, fontSize: 12, color: '#9B2B1E' }}>
          <span style={{ fontWeight: 700 }}>Tenant archived on {archiveDate.toLocaleDateString('en-GB', { dateStyle: 'medium' })}</span>
          {' — '}
          {daysUntilPurge !== null && daysUntilPurge > 0
            ? <>Data purge scheduled in <strong>{daysUntilPurge} day{daysUntilPurge !== 1 ? 's' : ''}</strong> ({purgeDate.toLocaleDateString('en-GB', { dateStyle: 'medium' })}).</>
            : <>Data purge overdue — will run on next scheduled cron.</>
          }
        </div>
      )}

      {/* Sandbox badge if this IS a sandbox */}
      {tenant.is_sandbox && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: '#FFF3CD', border: '1px solid #E8C84A', borderRadius: 6, fontSize: 12, color: '#7A5500', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700 }}>SANDBOX TENANT</span>
          <span>—</span>
          <span>Linked to production tenant: </span>
          {tenant.sandbox_of && (
            <Link href={`/platform/tenants/${tenant.sandbox_of}`} style={{ color: '#7A5500', fontWeight: 600 }}>
              view production →
            </Link>
          )}
        </div>
      )}

      <TenantTabNav tenantId={tenant.id} active="details" />

      {/* Tenant details card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: '0 0 16px' }}>Tenant Details</h2>
        <TenantDetailForm tenant={tenant} canEdit={canEdit} />
      </div>

      {/* Subscription summary (read-only) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: activeSub ? 12 : 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Subscription</h2>
          <Link href={`/platform/tenants/${tenant.id}/subscription`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>
            Manage →
          </Link>
        </div>
        {activeSub ? (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Plan</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{activeSub.plan_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Status</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '2px 7px' }}>
                {activeSub.status.charAt(0).toUpperCase() + activeSub.status.slice(1)}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Price/mo</div>
              <div style={{ fontSize: 13, color: 'var(--navy)' }}>
                {activeSub.is_free_of_charge
                  ? <span style={{ color: '#1A6B30', fontWeight: 600 }}>Free of charge</span>
                  : `£${(activeSub.effective_price_gbp ?? activeSub.plan_price_gbp ?? 0).toFixed(2)}`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Period end</div>
              <div style={{ fontSize: 13, color: 'var(--navy)' }}>
                {new Date(activeSub.period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            {activeSub.in_minimum_period && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Commitment</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px' }}>
                  In minimum period
                </span>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>
            No active subscription configured.{' '}
            {canEdit && (
              <Link href={`/platform/tenants/${tenant.id}/subscription`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                Create one →
              </Link>
            )}
          </p>
        )}
      </div>

      {/* Sandbox management — only shown on production tenants */}
      {!tenant.is_sandbox && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Sandbox Environment</h2>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
                Linked test environment — users can switch context from the top bar
              </p>
            </div>
            {sandboxRow && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#7A5500', background: '#FFF3CD', border: '1px solid #E8C84A', borderRadius: 4, padding: '3px 8px' }}>
                Configured
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <SandboxPanel
              productionTenantId={tenant.id}
              sandbox={sandboxRow ?? null}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}

      {/* Users in this tenant */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
              Users
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                {users.length} active
                {invites.length > 0 && ` · ${invites.length} pending`}
              </span>
            </h2>
          </div>
          {canEdit && <InviteTenantUserForm tenantId={tenant.id} />}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name / Email', 'Role', 'Status', 'Date', ''].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && invites.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No users in this tenant yet.
                </td>
              </tr>
            ) : (
              <>
                {users.map((u) => (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>
                        {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>{u.id.slice(0, 12)}…</div>
                    </td>
                    <td style={tdStyle}>
                      {canEdit && u.is_active
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
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        {canEdit && u.is_active && (
                          <form action={startEmulation.bind(null, u.id, tenant.id)}>
                            <button
                              type="submit"
                              title={`Emulate ${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Emulate user'}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
                                border: '1px solid #D97706', background: '#FEF3C7', color: '#92600A',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              Emulate
                            </button>
                          </form>
                        )}
                        {u.is_active && <SendResetButton userId={u.id} />}
                      </div>
                    </td>
                  </tr>
                ))}

                {invites.map((inv) => (
                  <tr key={`invite-${inv.id}`} style={{ opacity: 0.85 }}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 13, color: 'var(--navy)', fontStyle: 'italic' }}>{inv.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Invite pending</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#EEF2F5', color: '#6B8599' }}>
                        {inv.role.replace('tenant_', '').charAt(0).toUpperCase() + inv.role.replace('tenant_', '').slice(1)}
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
                    <td style={tdStyle} />
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Danger Zone — super admin only */}
      {canEdit && (
        <div style={{ background: 'var(--surface)', border: '1px solid #F5C6C2', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5C6C2', background: '#FFF8F8' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#9B2B1E', margin: 0 }}>Danger Zone</h2>
            <p style={{ fontSize: 11, color: '#C0392B', margin: '2px 0 0' }}>
              Actions here are irreversible. Archiving starts the 90-day data-purge countdown. Deleting is permanent and immediate.
            </p>
          </div>

          {/* Archive */}
          {tenant.status !== 'offboarded' && (
            <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #F5C6C2' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Archive this tenant</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Sets tenant to Offboarded. Tenant data will be automatically purged after 90 days.
                </div>
              </div>
              <ArchiveTenantButton tenantId={tenant.id} tenantName={tenant.name} />
            </div>
          )}

          {/* Delete */}
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#7B0F0F' }}>Delete this tenant permanently</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Immediately and permanently removes this tenant and all data. Cannot be undone.
                </div>
              </div>
              <DeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
            </div>
          </div>
        </div>
      )}

      {/* API Keys & Agents */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
            API Keys &amp; Agents
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {tenantApiKeys.filter((k) => !k.revoked_at && !(k.expires_at && new Date(k.expires_at) < now)).length} active
            </span>
          </h2>
        </div>
        {tenantApiKeys.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No API keys for this tenant.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Prefix', 'Last Seen', 'Agent Status', 'Key Status'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenantApiKeys.map((key) => {
                const isRevoked = !!key.revoked_at;
                const isExpired = !isRevoked && !!(key.expires_at && new Date(key.expires_at) < now);
                const keyStatusLabel = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active';
                const keyStatusStyle = isRevoked
                  ? { color: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' }
                  : isExpired
                    ? { color: '#92620A', bg: '#FFF8E6', border: '#F5D98C' }
                    : { color: 'var(--green)', bg: '#EDFAF3', border: '#A8DFBE' };
                const status = (!isRevoked && !isExpired) ? agentStatusForKey(key) : null;
                const s = status ? AGENT_STATUS_STYLE[status] : null;
                return (
                  <tr key={key.id}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{key.name}</span>
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
                      {s ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '2px 7px' }}>
                          {s.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: keyStatusStyle.color, background: keyStatusStyle.bg, border: `1px solid ${keyStatusStyle.border}`, borderRadius: 4, padding: '2px 7px' }}>
                        {keyStatusLabel}
                      </span>
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

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '11px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
