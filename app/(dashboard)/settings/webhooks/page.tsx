import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import { getTenantPlanFeatures } from '@/lib/actions/usage';
import { hasFeature } from '@/lib/features';
import SettingsNav from '@/components/layout/SettingsNav';
import { WebhookCard, AddWebhookButton } from './WebhookActions';
import ReceiversSection from './ReceiversSection';
import FeatureLock from '@/components/ui/FeatureLock';
import type { UserRole } from '@/types/database';
import type { ChannelType } from '@/lib/webhooks';
import type { DeliveryLogRow, ReceiverRow } from '@/lib/actions/webhooks';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  channel_type: ChannelType;
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
  const deliveryLogsByEndpoint: Record<string, DeliveryLogRow[]> = {};
  let receivers: ReceiverRow[] = [];

  if (effectiveTenantId) {
    const admin = createAdminClient();

    // Outbound endpoints
    const { data: wData } = await (admin as any)
      .from('webhook_endpoints')
      .select('id, name, url, events, enabled, channel_type, last_triggered_at, last_status_code, last_error, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });
    webhooks = (wData ?? []) as WebhookRow[];

    // Delivery logs (last 20 per endpoint)
    if (webhooks.length > 0) {
      const endpointIds = webhooks.map((w) => w.id);
      const { data: logData } = await (admin as any)
        .from('webhook_delivery_log')
        .select('id, endpoint_id, event, status_code, error, duration_ms, delivered_at, is_replay')
        .in('endpoint_id', endpointIds)
        .eq('tenant_id', effectiveTenantId)
        .order('delivered_at', { ascending: false })
        .limit(200);

      for (const log of (logData ?? []) as DeliveryLogRow[]) {
        (deliveryLogsByEndpoint[log.endpoint_id] ??= []).push(log);
      }
      // Trim to 20 per endpoint
      for (const key of Object.keys(deliveryLogsByEndpoint)) {
        deliveryLogsByEndpoint[key] = deliveryLogsByEndpoint[key].slice(0, 20);
      }
    }

    // Inbound receivers
    const { data: rData } = await (admin as any)
      .from('webhook_receivers')
      .select('id, name, description, receiver_key, enabled, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });
    receivers = (rData ?? []) as ReceiverRow[];
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

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

        {/* ── Outbound webhooks ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Outbound Webhooks</span>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
              Receive HTTP notifications when jobs complete, fail, or hit quota limits. Supports Generic HTTP, Microsoft Teams, and Slack.
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
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                deliveryLogs={deliveryLogsByEndpoint[webhook.id] ?? []}
              />
            ))}
          </div>
        )}

        {/* ── Inbound receivers ── */}
        {effectiveTenantId && (
          <ReceiversSection
            receivers={receivers}
            appUrl={appUrl}
            canManage={canManage}
          />
        )}
      </div>
    </div>
  );
}
