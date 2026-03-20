import { createClient } from '@/lib/supabase/server';
import TenantSettingsForm from './TenantSettingsForm';
import SettingsNav from '@/components/layout/SettingsNav';
import type { UserRole } from '@/types/database';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canEdit = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'].includes(profile?.role ?? '');

  let tenant = null;
  if (profile?.tenant_id) {
    const { data } = await supabase
      .from('tenants')
      .select('id, name, region, status, created_at, file_retention_days, settings')
      .eq('id', profile.tenant_id)
      .single<{ id: string; name: string; region: string; status: string; created_at: string; file_retention_days: number; settings: Record<string, unknown> }>();
    tenant = data;
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

      {/* Tenant details */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>Tenant Details</span>
        </div>
        <div style={{ padding: 20 }}>
          {tenant ? (
            <TenantSettingsForm tenant={tenant} canEdit={canEdit} />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              No tenant associated with your account. Contact your administrator.
            </p>
          )}
        </div>
      </div>

      {/* Danger zone — tenant admins only */}
      {canEdit && tenant && (
        <div style={{ ...panelStyle, borderColor: '#F5C6C2', marginTop: 16 }}>
          <div style={{ ...panelHeadStyle, borderColor: '#F5C6C2', background: '#FDE8E6' }}>
            <span style={{ ...panelTitleStyle, color: 'var(--error)' }}>Danger Zone</span>
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Contact Mysoft Support to suspend or offboard this tenant.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, overflow: 'hidden',
};
const panelHeadStyle: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC',
};
const panelTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--navy)',
};
