import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCredentials } from '@/lib/actions/credentials';
import { getX3CredentialsSummary } from '@/lib/actions/x3-credentials';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { getTenantPlanFeatures } from '@/lib/actions/usage';
import { hasFeature } from '@/lib/features';
import SettingsNav from '@/components/layout/SettingsNav';
import IntacctConfigForm from './IntacctConfigForm';
import X3ConfigForm from './X3ConfigForm';
import type { UserRole } from '@/types/database';

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) {
    redirect('/settings');
  }

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);
  const [existing, existingX3] = effectiveTenantId
    ? await Promise.all([
        getCredentials(effectiveTenantId),
        getX3CredentialsSummary(effectiveTenantId),
      ])
    : [null, null];

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const planFeatures = (!isPlatformAdmin && profile.tenant_id)
    ? await getTenantPlanFeatures(profile.tenant_id)
    : [];
  const canUseSso = isPlatformAdmin || hasFeature(planFeatures, 'saml_sso');

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

      <SettingsNav role={profile.role} />

      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <div>
            <span style={panelTitleStyle}>Sage Intacct Connection</span>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
              Credentials are encrypted at rest using AES-256-GCM.
            </p>
          </div>
          {existing && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--green)',
              background: '#E6F7ED',
              border: '1px solid #A3D9B1',
              borderRadius: 4,
              padding: '3px 8px',
            }}>
              Configured
            </span>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {effectiveTenantId ? (
            <IntacctConfigForm existing={existing} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              No tenant associated with your account.
            </p>
          )}
        </div>
      </div>

      {/* Sage X3 */}
      <div style={{ ...panelStyle, marginTop: 16 }}>
        <div style={panelHeadStyle}>
          <div>
            <span style={panelTitleStyle}>Sage X3 Connection</span>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
              Credentials are encrypted at rest using AES-256-GCM.
            </p>
          </div>
          {existingX3 && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--green)',
              background: '#E6F7ED',
              border: '1px solid #A3D9B1',
              borderRadius: 4,
              padding: '3px 8px',
            }}>
              Configured
            </span>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {effectiveTenantId ? (
            <X3ConfigForm existing={existingX3} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              No tenant associated with your account.
            </p>
          )}
        </div>
      </div>

      {/* SSO */}
      <div style={{ position: 'relative', marginTop: 16 }}>
        {!canUseSso && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(247,250,252,0.85)',
            borderRadius: 8, zIndex: 10, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>SAML SSO requires an upgraded plan</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Contact support to upgrade</span>
          </div>
        )}
        <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <div>
            <span style={panelTitleStyle}>Single Sign-On (SSO)</span>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
              SAML 2.0 — Azure AD, Okta, PingFederate and compatible IdPs
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            Coming soon
          </span>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--navy)' }}>Planned SSO support</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>SAML 2.0</strong> — Microsoft Azure AD / Entra ID, Okta, PingFederate, Google Workspace</li>
              <li><strong>OAuth 2.0 / OIDC</strong> — Microsoft 365, Google</li>
              <li>Automatic user provisioning on first login (JIT)</li>
              <li>Role mapping from IdP group claims to platform roles</li>
              <li>Per-tenant IdP configuration — each tenant can connect their own directory</li>
            </ul>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, opacity: 0.45, pointerEvents: 'none' as const }}>
            <div>
              <label style={fieldLabelStyle}>IDENTITY PROVIDER</label>
              <select style={fieldInputStyle} disabled>
                <option>Microsoft Azure AD / Entra ID</option>
                <option>Okta</option>
                <option>PingFederate</option>
                <option>Google Workspace</option>
                <option>Other SAML 2.0</option>
              </select>
            </div>
            <div />
            <div>
              <label style={fieldLabelStyle}>SAML METADATA URL</label>
              <input placeholder="https://login.microsoftonline.com/…/federationmetadata/…" style={fieldInputStyle} disabled readOnly />
              <p style={fieldHelpStyle}>From your IdP&apos;s SAML application configuration.</p>
            </div>
            <div>
              <label style={fieldLabelStyle}>ENTITY ID (SP)</label>
              <input placeholder="Auto-generated on enable" style={{ ...fieldInputStyle, background: '#F7FAFC', color: 'var(--muted)' }} disabled readOnly />
              <p style={fieldHelpStyle}>Register this as the Audience URI in your IdP.</p>
            </div>
            <div>
              <label style={fieldLabelStyle}>ROLE ATTRIBUTE CLAIM</label>
              <input placeholder="http://schemas.microsoft.com/ws/2008/06/identity/claims/groups" style={fieldInputStyle} disabled readOnly />
              <p style={fieldHelpStyle}>IdP claim used to map groups to platform roles.</p>
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Contact <strong>support@mysoftx3.com</strong> to request early access or discuss your SSO requirements.
          </p>
        </div>
        </div>
      </div>

      <div style={{ ...panelStyle, marginTop: 16 }}>
        <div style={panelHeadStyle}>
          <div>
            <span style={panelTitleStyle}>Security Notes</span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <ul style={{ fontSize: 13, color: 'var(--muted)', margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Credentials are encrypted before storage using AES-256-GCM.</li>
            <li>Only tenant admins and platform admins can view or update credentials.</li>
            <li>All changes are recorded in the audit log.</li>
            <li>Use a dedicated API user in Intacct with minimum required permissions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  overflow: 'hidden',
};
const panelHeadStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  background: '#F7FAFC',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const panelTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--navy)',
};
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const fieldInputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' as const };
const fieldHelpStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' };
