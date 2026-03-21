import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole, TenantSubscription } from '@/types/database';
import {
  getActiveSubscription,
  getUpcomingSubscription,
  getSubscriptionHistory,
  createOrChangeSubscription,
  cancelSubscription,
  cancelUpcomingSubscription,
} from '@/lib/actions/subscriptions';
import { listAllPlans } from '@/lib/actions/plans';
import { getTenantConnectorLicences } from '@/lib/actions/connector-licences';
import type { ConnectorLicenceRow } from '@/lib/actions/connector-licences';
import SubscriptionForm from './SubscriptionForm';
import CancelSubscriptionButton from './CancelSubscriptionButton';
import CancelUpcomingButton from './CancelUpcomingButton';
import TenantTabNav from '@/components/platform/TenantTabNav';

interface TenantRow {
  id: string;
  name: string;
  plan_id: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    active:    { color: '#1A6B30', bg: '#EDFAF3', border: '#A8DFBE' },
    trial:     { color: '#0057A3', bg: '#EBF5FF', border: '#90C4E8' },
    cancelled: { color: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
    expired:   { color: '#6B8599', bg: '#EEF2F5', border: '#D8E2EA' },
  };
  const s = styles[status] ?? styles.expired;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '2px 7px' }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)',
  textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left',
  background: '#F7FAFC', borderBottom: '1px solid var(--border)',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle',
};

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
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

  const isSuperAdmin = profile.role === 'platform_super_admin';
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, plan_id')
    .eq('id', id)
    .single<TenantRow>();

  if (!tenant) notFound();

  const [activeSub, upcomingSub, history, plans, connectorLicences] = await Promise.all([
    getActiveSubscription(id),
    getUpcomingSubscription(id),
    getSubscriptionHistory(id),
    listAllPlans(),
    getTenantConnectorLicences(id),
  ]);

  const connectorMrr = connectorLicences
    .filter((l) => l.is_enabled && l.price_gbp_monthly != null && l.price_gbp_monthly > 0)
    .reduce((sum, l) => sum + (l.price_gbp_monthly ?? 0), 0);

  const hasEnabledConnector = connectorLicences.some((l) => l.is_enabled);

  // Bound server actions
  const boundCreate = createOrChangeSubscription.bind(null, id);
  const boundCancel = activeSub
    ? cancelSubscription.bind(null, activeSub.id, id)
    : null;
  const boundCancelUpcoming = upcomingSub
    ? cancelUpcomingSubscription.bind(null, upcomingSub.id, id)
    : null;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          <Link href="/platform/tenants" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Tenants</Link>
          {' › '}
          <Link href={`/platform/tenants/${id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{tenant.name}</Link>
          {' › '}
          <span>Subscription</span>
        </span>
      </div>

      {/* Page heading */}
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px', letterSpacing: -0.3 }}>
        Subscription Management &mdash; {tenant.name}
      </h1>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 24px' }}>
        Manage the active subscription and billing plan for this tenant.
      </p>

      <TenantTabNav tenantId={id} active="subscription" />

      {/* Active subscription card */}
      {activeSub ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{activeSub.plan_name}</span>
                <StatusBadge status={activeSub.status} />
                {activeSub.superseded_by === null && activeSub.status === 'active' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1A6B30', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '1px 6px' }}>
                    CURRENT
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                Period: {formatDate(activeSub.period_start)} &rarr; {formatDate(activeSub.period_end)}
              </p>
            </div>
          </div>

          {/* Price row */}
          <div style={{ marginBottom: 12 }}>
            {activeSub.is_free_of_charge ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1A6B30' }}>Free of charge</span>
            ) : activeSub.discount_pct > 0 ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                £{activeSub.effective_price_gbp?.toFixed(2) ?? '—'}/month
                <span style={{ fontSize: 12, color: '#92620A', marginLeft: 8 }}>({activeSub.discount_pct}% discount)</span>
              </span>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                £{activeSub.effective_price_gbp?.toFixed(2) ?? activeSub.plan_price_gbp?.toFixed(2) ?? '—'}/month
              </span>
            )}
          </div>

          {/* Commitment */}
          <div style={{ marginBottom: activeSub.notes ? 12 : 0 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Minimum period ends {formatDate(activeSub.commitment_end_date)}
            </span>
            {activeSub.in_minimum_period && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px', marginLeft: 8 }}>
                In minimum period
              </span>
            )}
          </div>

          {activeSub.notes && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0', fontStyle: 'italic' }}>
              Notes: {activeSub.notes}
            </p>
          )}

          {/* Actions */}
          {isSuperAdmin && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {boundCancel && (
                <CancelSubscriptionButton
                  subscriptionId={activeSub.id}
                  tenantId={id}
                  inMinimumPeriod={activeSub.in_minimum_period}
                  periodEnd={activeSub.period_end}
                  action={boundCancel}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#EBF5FF', border: '1px solid #90C4E8', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: '#0057A3', margin: 0 }}>
            No active subscription configured for this tenant.
          </p>
        </div>
      )}

      {/* Upcoming subscription card */}
      {upcomingSub && (
        <div style={{ background: '#EBF5FF', border: '1px solid #90C4E8', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0057A3' }}>
                  {plans.find(p => p.id === upcomingSub.plan_id)?.name ?? upcomingSub.plan_id}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#0057A3', background: '#D6ECFF', border: '1px solid #90C4E8', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.3 }}>
                  SCHEDULED
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#0057A3', margin: 0 }}>
                Takes effect <strong>{formatDate(upcomingSub.period_start)}</strong>
                {' — '}
                {upcomingSub.is_free_of_charge
                  ? 'Free of charge'
                  : upcomingSub.plan_price_gbp != null
                  ? `£${Number(upcomingSub.plan_price_gbp).toFixed(2)}/mo`
                  : 'Custom price'}
                {upcomingSub.discount_pct > 0 && ` (${upcomingSub.discount_pct}% discount)`}
              </p>
              {upcomingSub.notes && (
                <p style={{ fontSize: 12, color: '#0057A3', margin: '6px 0 0', fontStyle: 'italic', opacity: 0.8 }}>
                  {upcomingSub.notes}
                </p>
              )}
            </div>
          </div>
          {isSuperAdmin && boundCancelUpcoming && (
            <CancelUpcomingButton action={boundCancelUpcoming} />
          )}
        </div>
      )}

      {/* Subscription form — always visible for super admin */}
      {isSuperAdmin && (
        <div style={{ marginBottom: 24 }}>
          <SubscriptionForm
            plans={plans}
            currentPlanId={activeSub?.plan_id ?? tenant.plan_id}
            currentCustomPrice={activeSub?.plan_price_gbp ?? null}
            action={boundCreate}
            heading={activeSub ? 'Change Plan' : 'Create Subscription'}
            hasEnabledConnector={hasEnabledConnector}
          />
        </div>
      )}

      {/* Connector Licences summary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
              Connector Licences
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                {connectorLicences.filter((l) => l.is_enabled).length} active
              </span>
            </h2>
          </div>
          <Link
            href={`/platform/tenants/${id}/connectors`}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}
          >
            Manage connectors →
          </Link>
        </div>

        {connectorLicences.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No connector licences assigned.{' '}
            <Link href={`/platform/tenants/${id}/connectors`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>
              Add connectors
            </Link>
          </div>
        ) : (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connectorLicences.map((licence) => {
                const LICENCE_COLOURS: Record<string, { colour: string; bg: string; border: string; label: string }> = {
                  included:      { label: 'Included',      colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
                  paid_monthly:  { label: 'Monthly',       colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
                  paid_annual:   { label: 'Annual',        colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
                  trial:         { label: 'Trial',         colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
                  complimentary: { label: 'Complimentary', colour: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
                };
                const lm = LICENCE_COLOURS[licence.licence_type] ?? LICENCE_COLOURS.paid_monthly;
                const trialExpired = licence.trial_ends_at ? new Date(licence.trial_ends_at) < new Date() : false;
                return (
                  <div key={licence.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: licence.is_enabled ? 1 : 0.6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: licence.is_enabled ? 'var(--navy)' : 'var(--muted)', flex: 1 }}>
                      {licence.display_name ?? licence.connector_key}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: lm.colour, background: lm.bg, border: `1px solid ${lm.border}`, borderRadius: 4, padding: '1px 6px' }}>
                      {lm.label}
                    </span>
                    {!licence.is_enabled && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 4, padding: '1px 6px' }}>
                        Suspended
                      </span>
                    )}
                    {trialExpired && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '1px 6px' }}>
                        Expired
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 90, textAlign: 'right' }}>
                      {licence.price_gbp_monthly != null
                        ? licence.price_gbp_monthly === 0 ? '£0 / mo' : `£${licence.price_gbp_monthly.toFixed(2)} / mo`
                        : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            {connectorMrr > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Connector MRR</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>£{connectorMrr.toFixed(2)} / mo</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscription history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
            Subscription History
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {history.length} record{history.length !== 1 ? 's' : ''}
            </span>
          </h2>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No subscription history yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Plan', 'Status', 'Period Start', 'Period End', 'Price/mo', 'Discount', 'Free?', 'Created'].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((sub: TenantSubscription) => {
                const isCurrent = sub.superseded_by === null && sub.status === 'active';
                return (
                  <tr key={sub.id} style={{ opacity: sub.status === 'cancelled' || sub.status === 'expired' ? 0.7 : 1 }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{sub.plan_id}</span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#1A6B30', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '1px 6px', marginLeft: 6 }}>
                          Current
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}><StatusBadge status={sub.status} /></td>
                    <td style={tdStyle}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(sub.period_start)}</span></td>
                    <td style={tdStyle}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(sub.period_end)}</span></td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--navy)' }}>
                        {sub.effective_price_gbp != null
                          ? `£${Number(sub.effective_price_gbp).toFixed(2)}`
                          : sub.plan_price_gbp != null
                          ? `£${Number(sub.plan_price_gbp).toFixed(2)}`
                          : '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: sub.discount_pct > 0 ? '#92620A' : 'var(--muted)' }}>
                        {sub.discount_pct > 0 ? `${sub.discount_pct}%` : '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {sub.is_free_of_charge ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#EDFAF3', borderRadius: 4, padding: '2px 7px' }}>Yes</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(sub.created_at)}</span></td>
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
