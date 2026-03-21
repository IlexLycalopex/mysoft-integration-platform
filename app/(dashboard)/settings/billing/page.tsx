import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveSubscription } from '@/lib/actions/subscriptions';
import { getTenantConnectorLicences } from '@/lib/actions/connector-licences';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import SettingsNav from '@/components/layout/SettingsNav';
import type { UserRole } from '@/types/database';
import type { ConnectorLicenceRow } from '@/lib/actions/connector-licences';

const CONNECTOR_ICONS: Record<string, string> = {
  sage_intacct:      '🟢',
  xero:              '🔵',
  quickbooks_online: '🟣',
  sage_x3:           '🟠',
  shopify:           '🛍️',
  hubspot:           '🧡',
  salesforce:        '☁️',
};

const LICENCE_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  included:      { label: 'Included in plan', colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  paid_monthly:  { label: 'Monthly add-on',   colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  paid_annual:   { label: 'Annual add-on',    colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  trial:         { label: 'Trial',            colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  complimentary: { label: 'Complimentary',    colour: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  if (isPlatformAdmin) redirect('/platform');

  const { tenantId } = await getEffectiveTenantId(profile.tenant_id);
  if (!tenantId) redirect('/dashboard');

  const [activeSub, licences] = await Promise.all([
    getActiveSubscription(tenantId),
    getTenantConnectorLicences(tenantId),
  ]);

  // Only show enabled licences
  const enabledLicences = licences.filter((l) => l.is_enabled);

  // Pricing
  const planPrice = activeSub
    ? activeSub.is_free_of_charge ? 0 : (activeSub.effective_price_gbp ?? activeSub.plan_price_gbp ?? 0)
    : 0;
  const connectorAddOnTotal = enabledLicences
    .filter((l) => l.price_gbp_monthly != null && l.price_gbp_monthly > 0)
    .reduce((sum, l) => sum + (l.price_gbp_monthly ?? 0), 0);
  const monthlyTotal = planPrice + connectorAddOnTotal;

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const panelStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  };
  const panelHeadStyle: React.CSSProperties = {
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: '#F7FAFC',
  };

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Tenant configuration and preferences
        </p>
      </div>

      <SettingsNav role={profile.role} />

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>Billing</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Your monthly subscription and connector costs — {monthLabel}
        </p>
      </div>

      {/* Total monthly card */}
      <div style={{
        background: 'var(--navy)',
        borderRadius: 10,
        padding: '24px 28px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
            Total Monthly Cost
          </div>
          {activeSub?.is_free_of_charge ? (
            <div style={{ fontSize: 38, fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>
              Free of charge
            </div>
          ) : (
            <div style={{ fontSize: 38, fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>
              £{monthlyTotal.toFixed(2)}
              <span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.6)', marginLeft: 6 }}>/month</span>
            </div>
          )}
          {activeSub && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
              Next billing date: {formatDate(activeSub.period_end)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {connectorAddOnTotal > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Base plan</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>£{planPrice.toFixed(2)}/mo</div>
            </div>
          )}
          {connectorAddOnTotal > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Connector add-ons</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>£{connectorAddOnTotal.toFixed(2)}/mo</div>
            </div>
          )}
        </div>
      </div>

      {/* Bill breakdown */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Bill Breakdown</span>
        </div>
        <div style={{ padding: '8px 0' }}>

          {/* Base plan line */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            gap: 12,
          }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                {activeSub ? activeSub.plan_name : 'No plan'}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>Base plan</span>
              </div>
              {activeSub?.in_minimum_period && (
                <div style={{ fontSize: 11, color: '#92620A', marginTop: 2 }}>
                  Minimum commitment until {formatDate(activeSub.commitment_end_date)}
                </div>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', textAlign: 'right', minWidth: 90 }}>
              {!activeSub ? '—' : activeSub.is_free_of_charge ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 8px' }}>
                  Free
                </span>
              ) : activeSub.discount_pct > 0 ? (
                <span>
                  £{planPrice.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
                  <div style={{ fontSize: 11, color: '#92620A', fontWeight: 500 }}>{activeSub.discount_pct}% discount</div>
                </span>
              ) : (
                <>£{planPrice.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>/mo</span></>
              )}
            </div>
          </div>

          {/* Connector lines */}
          {enabledLicences.length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--muted)' }}>
              No connector add-ons active.
            </div>
          ) : (
            enabledLicences.map((licence) => {
              const lm = LICENCE_META[licence.licence_type] ?? LICENCE_META.paid_monthly;
              const icon = CONNECTOR_ICONS[licence.connector_key ?? ''] ?? '🔌';
              const price = licence.price_gbp_monthly ?? 0;
              const trialExpired = licence.trial_ends_at
                ? new Date(licence.trial_ends_at) < new Date()
                : false;
              return (
                <div
                  key={licence.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border)',
                    gap: 12,
                    opacity: trialExpired ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                        {licence.display_name ?? licence.connector_key}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: lm.colour, background: lm.bg, border: `1px solid ${lm.border}`, borderRadius: 4, padding: '1px 6px' }}>
                        {lm.label}
                      </span>
                      {trialExpired && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '1px 6px' }}>
                          Trial expired
                        </span>
                      )}
                    </div>
                    {licence.trial_ends_at && !trialExpired && (
                      <div style={{ fontSize: 11, color: '#92620A', marginTop: 2 }}>
                        Trial ends {formatDate(licence.trial_ends_at)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: price > 0 ? 'var(--navy)' : '#1A6B30', textAlign: 'right', minWidth: 90 }}>
                    {price === 0 ? (
                      <>£0<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>/mo</span></>
                    ) : (
                      <>£{price.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>/mo</span></>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Total row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            background: '#F7FAFC',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Total per month</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
              {activeSub?.is_free_of_charge ? 'Free' : `£${monthlyTotal.toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Contact notice */}
      <div style={{
        background: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: 8,
        padding: '14px 20px',
        fontSize: 13,
        color: '#1E40AF',
        lineHeight: 1.6,
      }}>
        <strong>Want to add or change connectors?</strong>{' '}
        Contact your account manager or email{' '}
        <a href="mailto:support@mysoft.co.uk" style={{ color: '#1E40AF', fontWeight: 600 }}>support@mysoft.co.uk</a>{' '}
        — connector licences are managed by your Mysoft team.
      </div>
    </div>
  );
}
