import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { getTenantPlanFeatures } from '@/lib/actions/usage';
import { hasFeature } from '@/lib/features';
import SettingsNav from '@/components/layout/SettingsNav';
import ToggleWatcherButton from './ToggleWatcherButton';
import DeleteWatcherButton from './DeleteWatcherButton';
import RevealTokenButton from './RevealTokenButton';
import FeatureLock from '@/components/ui/FeatureLock';
import type { UserRole } from '@/types/database';
import type { WatcherConfig } from '@/lib/actions/watchers';

interface FieldMappingRow {
  id: string;
  name: string;
}

interface ApiKeyRow {
  last_used_at: string | null;
  revoked_at: string | null;
}

function getAgentStatus(keys: ApiKeyRow[]): { label: string; colour: string; bg: string; border: string; detail: string } {
  const active = keys.filter((k) => !k.revoked_at);
  if (!active.length) return { label: 'No API key', colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2', detail: 'Create an API key for the agent to authenticate with.' };

  const latest = active
    .map((k) => k.last_used_at ? new Date(k.last_used_at).getTime() : 0)
    .sort((a, b) => b - a)[0];

  if (!latest) return { label: 'Never connected', colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C', detail: 'Agent has not yet made a connection. Install and start the Windows Agent.' };

  const minutesAgo = (Date.now() - latest) / 60000;
  if (minutesAgo <= 15) return { label: 'Online', colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1', detail: `Last seen ${Math.round(minutesAgo)} min ago` };
  if (minutesAgo <= 1440) return { label: 'Idle', colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C', detail: `Last seen ${Math.round(minutesAgo / 60)}h ago` };
  return { label: 'Offline', colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2', detail: `Last seen ${Math.round(minutesAgo / 1440)}d ago` };
}

export default async function WatchersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canManage = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'].includes(profile?.role ?? '');
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '');

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile?.tenant_id ?? null);

  const planFeatures = (!isPlatformAdmin && profile?.tenant_id)
    ? await getTenantPlanFeatures(profile.tenant_id)
    : [];
  const canUseWatchers = isPlatformAdmin || hasFeature(planFeatures, 'watchers');

  let watchers: WatcherConfig[] = [];
  let mappings: FieldMappingRow[] = [];
  let apiKeys: ApiKeyRow[] = [];

  if (effectiveTenantId) {
    const admin = createAdminClient();
    const [watchersResult, mappingsResult, keysResult] = await Promise.all([
      admin
        .from('watcher_configs')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      admin
        .from('field_mappings')
        .select('id, name')
        .eq('tenant_id', effectiveTenantId)
        .order('name'),
      admin
        .from('api_keys')
        .select('last_used_at, revoked_at')
        .eq('tenant_id', effectiveTenantId),
    ]);
    watchers = (watchersResult.data ?? []) as WatcherConfig[];
    mappings = (mappingsResult.data ?? []) as FieldMappingRow[];
    apiKeys = (keysResult.data ?? []) as ApiKeyRow[];
  }

  const mappingMap = Object.fromEntries(mappings.map((m) => [m.id, m.name]));
  const hasAgentWatcher = watchers.some((w) => w.source_type === 'local_folder');
  const agentStatus = getAgentStatus(apiKeys);

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Tenant configuration and preferences
        </p>
      </div>

      <SettingsNav role={profile?.role ?? 'tenant_auditor'} />

      <div style={{ position: 'relative' }}>
        {!canUseWatchers && <FeatureLock featureName="Automated Watchers" />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>File Watchers</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
            Automatically ingest files into this platform on a schedule.
          </p>
        </div>
        {canManage && effectiveTenantId && (
          <Link
            href="/settings/watchers/new"
            style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            + New Watcher
          </Link>
        )}
      </div>

      {/* How it works — three-column explainer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#FFFBF0', border: '1px solid #F5D98C', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7A5100', marginBottom: 6 }}>
            ⚙ Windows Agent (Local Folder)
          </div>
          <div style={{ fontSize: 12, color: '#7A5100', lineHeight: 1.6 }}>
            A lightweight background service installed on your Windows server watches a local folder and pushes new files to this platform via the API. The folder path, pattern, and schedule are all configured here — the agent downloads its config automatically.
          </div>
          {hasAgentWatcher && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: agentStatus.colour, background: agentStatus.bg, border: `1px solid ${agentStatus.border}`, borderRadius: 4, padding: '2px 8px' }}>
                Agent: {agentStatus.label}
              </span>
              <span style={{ fontSize: 11, color: '#92620A' }}>{agentStatus.detail}</span>
            </div>
          )}
        </div>

        <div style={{ background: '#EEF7FF', border: '1px solid #A3CFFF', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A4F92', marginBottom: 6 }}>
            ☁ SFTP (Cloud — no install)
          </div>
          <div style={{ fontSize: 12, color: '#0A4F92', lineHeight: 1.6 }}>
            This platform connects directly to your SFTP server from the cloud and polls it on a schedule. No software needs to be installed on your machines — just a reachable SFTP host and credentials.
          </div>
        </div>

        <div style={{ background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0E5C30', marginBottom: 6 }}>
            ⬆ HTTP Push (external system pushes)
          </div>
          <div style={{ fontSize: 12, color: '#0E5C30', lineHeight: 1.6 }}>
            A unique push URL is generated per watcher. External systems (ERP exports, iPaaS tools, scripts) POST files directly to this URL — no agent or polling required. The URL is the authentication token.
          </div>
        </div>
      </div>

      {/* Watcher table */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>Watcher Configurations</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {watchers.filter((w) => w.enabled).length} active
          </span>
        </div>
        {/* Horizontal scroll wrapper keeps actions column visible on narrow screens */}
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              {['Name', 'Type', 'Pattern', 'Mapping', 'Auto-process', 'Status', ...(canManage ? ['Actions'] : [])].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {watchers.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No watchers configured yet.{' '}
                  {canManage && (
                    <Link href="/settings/watchers/new" style={{ color: 'var(--blue)' }}>
                      Create one
                    </Link>
                  )}
                  {' '}to start auto-ingesting files.
                </td>
              </tr>
            ) : watchers.map((watcher) => (
              <tr key={watcher.id}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>{watcher.name}</div>
                  {watcher.source_type === 'local_folder' && watcher.folder_path && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', marginTop: 2 }}>{watcher.folder_path}</div>
                  )}
                  {watcher.source_type === 'sftp' && watcher.sftp_host && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{watcher.sftp_host}{watcher.sftp_remote_path ? `:${watcher.sftp_remote_path}` : ''}</div>
                  )}
                  {watcher.source_type === 'http_push' && watcher.push_token && (
                    <RevealTokenButton token={watcher.push_token} />
                  )}
                </td>
                <td style={tdStyle}>
                  {watcher.source_type === 'sftp' ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6B35A0', background: '#F3F0FF', border: '1px solid #DDD6FE', borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      SFTP
                    </span>
                  ) : watcher.source_type === 'http_push' ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#0E5C30', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      HTTP Push
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      Agent
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <code style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', background: '#F0F4F8', padding: '2px 6px', borderRadius: 4 }}>
                    {watcher.file_pattern}
                  </code>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {watcher.mapping_id ? (mappingMap[watcher.mapping_id] ?? '—') : '—'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {watcher.auto_process ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 7px' }}>Yes</span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Manual</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {watcher.enabled ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '2px 7px' }}>
                      Enabled
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>
                      Disabled
                    </span>
                  )}
                </td>
                {canManage && (
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <Link
                        href={`/settings/watchers/${watcher.id}/edit`}
                        style={{ fontSize: 12, color: 'var(--blue)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', textDecoration: 'none', fontWeight: 500 }}
                      >
                        Edit
                      </Link>
                      <ToggleWatcherButton watcherId={watcher.id} enabled={watcher.enabled} />
                      <DeleteWatcherButton watcherId={watcher.id} watcherName={watcher.name} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>{/* end scroll wrapper */}
      </div>
      </div>
    </div>
  );
}

// overflow: hidden removed — was clipping the actions column on narrow viewports.
// Border-radius is preserved by the rounded panel; the table scrolls horizontally instead.
const panelStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 };
const panelHeadStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const panelTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--navy)' };
const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
