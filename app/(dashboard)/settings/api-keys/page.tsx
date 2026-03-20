import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { getTenantPlanFeatures } from '@/lib/actions/usage';
import { hasFeature } from '@/lib/features';
import SettingsNav from '@/components/layout/SettingsNav';
import CreateApiKeyForm from './CreateApiKeyForm';
import RevokeKeyButton from './RevokeKeyButton';
import FeatureLock from '@/components/ui/FeatureLock';
import type { UserRole } from '@/types/database';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

function keyStatus(key: ApiKeyRow): { label: string; color: string; background: string; border: string } {
  if (key.revoked_at) {
    return { label: 'Revoked', color: '#9B2B1E', background: '#FDE8E6', border: '#F5C6C2' };
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return { label: 'Expired', color: '#92620A', background: '#FFF8E6', border: '#F5D98C' };
  }
  return { label: 'Active', color: 'var(--green)', background: '#EDFAF3', border: '#A8DFBE' };
}

export default async function ApiKeysPage() {
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
  const canUseApiKeys = isPlatformAdmin || hasFeature(planFeatures, 'api_access');

  let keys: ApiKeyRow[] = [];
  if (effectiveTenantId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });
    keys = (data ?? []) as ApiKeyRow[];
  }

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

      <SettingsNav role={profile?.role ?? 'tenant_auditor'} />

      <div style={{ position: 'relative' }}>
        {!canUseApiKeys && <FeatureLock featureName="API Access" />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>API Keys</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
            Keys are used by the Windows Agent and direct REST API clients to ingest files without a browser session.
          </p>
        </div>
        {canManage && effectiveTenantId && <CreateApiKeyForm />}
      </div>

      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>API Keys</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {keys.filter((k) => !k.revoked_at && !(k.expires_at && new Date(k.expires_at) < new Date())).length} active
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Prefix', 'Created', 'Last Used', 'Expires', 'Status', ...(canManage ? [''] : [])].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No API keys yet. Create one to enable automated file ingestion.
                </td>
              </tr>
            ) : keys.map((key) => {
              const status = keyStatus(key);
              return (
                <tr key={key.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>{key.name}</div>
                  </td>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', background: '#F0F4F8', padding: '2px 6px', borderRadius: 4 }}>
                      {key.key_prefix}…
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(key.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })
                        : '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {key.expires_at
                        ? new Date(key.expires_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })
                        : 'Never'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: status.color, background: status.background,
                      border: `1px solid ${status.border}`, borderRadius: 4, padding: '2px 7px',
                    }}>
                      {status.label}
                      {key.revoked_at && (
                        <span style={{ fontWeight: 400, marginLeft: 4 }}>
                          {new Date(key.revoked_at).toLocaleDateString('en-GB', { dateStyle: 'short' })}
                        </span>
                      )}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {!key.revoked_at && <RevokeKeyButton keyId={key.id} keyName={key.name} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' };
const panelHeadStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const panelTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--navy)' };
const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
