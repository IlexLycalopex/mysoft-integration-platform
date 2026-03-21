import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import TenantTabNav from '@/components/platform/TenantTabNav';
import type { UserRole } from '@/types/database';
import { getTenantConnectorLicences } from '@/lib/actions/connector-licences';
import type { ConnectorLicenceRow } from '@/lib/actions/connector-licences';
import ConnectorLicenceActions from './ConnectorLicenceActions';

interface ConnectorRow {
  id: string;
  connector_key: string;
  display_name: string;
  description: string | null;
  connector_type: string | null;
  is_active: boolean;
  is_system: boolean;
  default_price_gbp_monthly?: number | null;
}

const LICENCE_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  included:      { label: 'Included',     colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  paid_monthly:  { label: 'Monthly',      colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  paid_annual:   { label: 'Annual',       colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  trial:         { label: 'Trial',        colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  complimentary: { label: 'Complimentary',colour: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
};

const TYPE_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  source: { label: 'Source',        colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  target: { label: 'Target',        colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  both:   { label: 'Source+Target', colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
};

const CONNECTOR_ICONS: Record<string, string> = {
  sage_intacct:      '🟢',
  xero:              '🔵',
  quickbooks_online: '🟣',
  sage_x3:           '🟠',
  shopify:           '🛍️',
  hubspot:           '🧡',
  salesforce:        '☁️',
};

export default async function TenantConnectorsPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Tenant info
  const { data: tenant } = await (admin as any)
    .from('tenants')
    .select('id, name, status')
    .eq('id', id)
    .single() as { data: { id: string; name: string; status: string } | null };

  if (!tenant) redirect('/platform/tenants');

  // All active connectors
  const { data: allConnectors } = await (admin as any)
    .from('endpoint_connectors')
    .select('id, connector_key, display_name, description, connector_type, is_active, is_system, default_price_gbp_monthly')
    .order('sort_order', { ascending: true }) as { data: ConnectorRow[] | null };

  const connectors: ConnectorRow[] = allConnectors ?? [];

  // Existing licences for this tenant
  const licences: ConnectorLicenceRow[] = await getTenantConnectorLicences(id);
  const licencedIds = new Set(licences.map((l) => l.connector_id));

  // Separate licenced vs unlicenced connectors
  const licencedConnectors = connectors.filter((c) => licencedIds.has(c.id));
  const unlicencedConnectors = connectors.filter((c) => !licencedIds.has(c.id));

  // Calculate monthly recurring revenue for this tenant from connector licences
  const monthlyRevenue = licences
    .filter((l) => l.is_enabled && l.price_gbp_monthly != null && l.price_gbp_monthly > 0)
    .reduce((sum, l) => sum + (l.price_gbp_monthly ?? 0), 0);

  // eslint-disable-next-line react-hooks/purity -- server component; Date.now() is safe per-request
  const now = Date.now();

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          {tenant.name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)} tenant
        </p>
      </div>

      <TenantTabNav tenantId={id} active="connectors" />

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            LICENCED CONNECTORS
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>
            {licences.filter((l) => l.is_enabled).length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {licences.filter((l) => !l.is_enabled).length} suspended
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            CONNECTOR MRR
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>
            £{monthlyRevenue.toFixed(0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            /month from paid licences
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            TRIAL EXPIRIES
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: licences.filter((l) => l.licence_type === 'trial').length > 0 ? '#92620A' : 'var(--navy)', marginTop: 4 }}>
            {licences.filter((l) => l.licence_type === 'trial').length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            active trial{licences.filter((l) => l.licence_type === 'trial').length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Licenced connectors section */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>
            Licenced ({licences.length})
          </h2>
        </div>

        {licences.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No connectors licenced yet. Add one below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {licences.map((licence) => {
              const lm = LICENCE_META[licence.licence_type] ?? LICENCE_META.paid_monthly;
              const tm = licence.connector_type ? TYPE_META[licence.connector_type] : null;
              const trialExpired = licence.trial_ends_at ? new Date(licence.trial_ends_at) < new Date() : false;
              const trialExpiringSoon = licence.trial_ends_at && !trialExpired
                ? (new Date(licence.trial_ends_at).getTime() - now) < 14 * 86400 * 1000
                : false;

              return (
                <div key={licence.id} style={{
                  background: licence.is_enabled ? 'var(--surface)' : '#FAFBFC',
                  border: `1px solid ${trialExpired ? '#FCA5A5' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  opacity: licence.is_enabled ? 1 : 0.7,
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 7, flexShrink: 0,
                    background: 'var(--surface-raised)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {CONNECTOR_ICONS[licence.connector_key ?? ''] ?? '🔌'}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: licence.is_enabled ? 'var(--navy)' : 'var(--muted)' }}>
                        {licence.display_name ?? licence.connector_key}
                      </span>
                      {tm && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: tm.colour, background: tm.bg, border: `1px solid ${tm.border}`, borderRadius: 4, padding: '1px 6px' }}>
                          {tm.label}
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, color: lm.colour, background: lm.bg, border: `1px solid ${lm.border}`, borderRadius: 4, padding: '1px 6px' }}>
                        {lm.label}
                      </span>
                      {!licence.is_enabled && (
                        <span style={{ fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: 4, padding: '1px 6px' }}>
                          Suspended
                        </span>
                      )}
                      {trialExpired && (
                        <span style={{ fontSize: 11, fontWeight: 600, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', borderRadius: 4, padding: '1px 6px' }}>
                          Trial Expired
                        </span>
                      )}
                      {trialExpiringSoon && !trialExpired && (
                        <span style={{ fontSize: 11, fontWeight: 600, background: '#FFF8E6', color: '#92620A', border: '1px solid #F5D98C', borderRadius: 4, padding: '1px 6px' }}>
                          Expiring Soon
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {licence.price_gbp_monthly != null
                          ? licence.price_gbp_monthly === 0
                            ? '£0 / month'
                            : `£${licence.price_gbp_monthly.toFixed(2)} / month`
                          : 'No price set'}
                      </span>
                      {licence.trial_ends_at && (
                        <span style={{ fontSize: 12, color: trialExpired ? '#DC2626' : '#92620A' }}>
                          Trial ends {new Date(licence.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {licence.notes && (
                        <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                          {licence.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <ConnectorLicenceActions
                      mode="edit"
                      tenantId={id}
                      licence={licence}
                      allConnectors={connectors}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unlicenced / available connectors */}
      {unlicencedConnectors.length > 0 && (
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px' }}>
            Available — Not Licenced ({unlicencedConnectors.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unlicencedConnectors.map((c) => {
              const tm = c.connector_type ? TYPE_META[c.connector_type] : null;
              return (
                <div key={c.id} style={{
                  background: '#FAFBFC', border: '1px solid #E2E8F0',
                  borderRadius: 8, padding: '12px 18px',
                  display: 'flex', alignItems: 'center', gap: 14, opacity: 0.75,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 7, flexShrink: 0,
                    background: '#F0F4F8', border: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {CONNECTOR_ICONS[c.connector_key] ?? '🔌'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500, fontSize: 14, color: '#64748B' }}>{c.display_name}</span>
                      {tm && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: tm.colour, background: tm.bg, border: `1px solid ${tm.border}`, borderRadius: 4, padding: '1px 6px' }}>
                          {tm.label}
                        </span>
                      )}
                      {!c.is_active && (
                        <span style={{ fontSize: 11, fontWeight: 500, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: 4, padding: '1px 6px' }}>
                          Coming Soon
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{c.description}</div>
                    )}
                  </div>
                  {canEdit && (
                    <ConnectorLicenceActions
                      mode="add"
                      tenantId={id}
                      connector={c}
                      allConnectors={connectors}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
