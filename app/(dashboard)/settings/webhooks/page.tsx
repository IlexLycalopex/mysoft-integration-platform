import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { getTenantPlanFeatures } from '@/lib/actions/usage';
import { hasFeature } from '@/lib/features';
import SettingsNav from '@/components/layout/SettingsNav';
import { WebhookCard, AddWebhookButton } from './WebhookActions';
import FeatureLock from '@/components/ui/FeatureLock';
import type { UserRole } from '@/types/database';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
}

export default async function WebhooksPage() {
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
  const canUseWebhooks = isPlatformAdmin || hasFeature(planFeatures, 'webhooks');

  let webhooks: WebhookRow[] = [];

  if (effectiveTenantId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('webhook_endpoints')
      .select('id, name, url, events, enabled, last_triggered_at, last_status_code, last_error, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });
    webhooks = (data ?? []) as WebhookRow[];
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
        {!canUseWebhooks && <FeatureLock featureName="Webhooks" />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Webhooks</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
            Receive HTTP notifications when jobs complete or fail.
          </p>
        </div>
        {canManage && effectiveTenantId && <AddWebhookButton />}
      </div>

      {!effectiveTenantId ? (
        <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 8, padding: '14px 18px', fontSize: 13, color: '#92620A' }}>
          No tenant associated with your account.
        </div>
      ) : webhooks.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No webhooks configured yet. Add one above to start receiving notifications.
        </div>
      ) : (
        <div>
          {webhooks.map((webhook) => (
            <WebhookCard key={webhook.id} webhook={webhook} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
