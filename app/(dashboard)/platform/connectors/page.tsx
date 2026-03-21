import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';

interface ConnectorRow {
  id: string;
  connector_key: string;
  display_name: string;
  description: string | null;
  connector_type: string | null;
  is_system: boolean;
  is_active: boolean;
  capabilities: Record<string, unknown>;
  created_at: string;
}

export default async function PlatformConnectorsPage() {
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

  const { data: connectors } = await (admin as any)
    .from('endpoint_connectors')
    .select('id, connector_key, display_name, description, connector_type, is_system, is_active, capabilities, created_at')
    .order('sort_order', { ascending: true }) as { data: ConnectorRow[] | null };

  const rows = connectors ?? [];

  const CONNECTOR_ICONS: Record<string, string> = {
    sage_intacct:      '🟢',
    xero:              '🔵',
    quickbooks_online: '🟣',
    sage_x3:           '🟠',
    shopify:           '🛍️',
    hubspot:           '🧡',
    salesforce:        '☁️',
  };

  const TYPE_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
    source: { label: 'Source',       colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
    target: { label: 'Target',       colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
    both:   { label: 'Source+Target',colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  };

  const activeRows   = rows.filter((c) => c.is_active);
  const inactiveRows = rows.filter((c) => !c.is_active);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            Endpoint Connectors
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {activeRows.length} active · {inactiveRows.length} coming soon
          </p>
        </div>
        {canEdit && (
          <Link href="/platform/connectors/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 500,
            padding: '8px 16px', borderRadius: 6, textDecoration: 'none',
          }}>
            + Add connector
          </Link>
        )}
      </div>

      {/* Active connectors */}
      {activeRows.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>
            Active
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeRows.map((c) => <ConnectorCard key={c.id} c={c} canEdit={canEdit} icon={CONNECTOR_ICONS[c.connector_key] ?? '🔌'} typeMeta={TYPE_META} />)}
          </div>
        </div>
      )}

      {/* Coming soon connectors */}
      {(inactiveRows.length > 0 || true) && (
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px' }}>
            Coming Soon
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inactiveRows.map((c) => <ConnectorCard key={c.id} c={c} canEdit={canEdit} icon={CONNECTOR_ICONS[c.connector_key] ?? '🔌'} typeMeta={TYPE_META} comingSoon />)}

            {/* Platform feature cards — static, not DB-backed */}
            <StaticComingSoonCard
              icon="🤖"
              name="Offline Agent"
              description="On-premise binary for connecting firewalled Sage X3, local SFTP, or isolated networks. Outbound-only HTTPS, no VPN required."
              typeBadge={{ label: 'On-Premise', colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' }}
              docLink="/docs/offline-agent-roadmap.md"
            />
            <StaticComingSoonCard
              icon="⚡"
              name="Power Automate Connector"
              description="Certified Microsoft Power Automate connector with triggers for job events and actions for submitting data. Bridges Microsoft 365, Dynamics 365, and Sage."
              typeBadge={{ label: 'iPaaS', colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' }}
              docLink="/docs/power-automate-connector.md"
            />
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: '40px 0' }}>
          No connectors yet.{canEdit && ' Add the first one above.'}
        </div>
      )}
    </div>
  );
}

// ── ConnectorCard sub-component ───────────────────────────────────────────────

function ConnectorCard({
  c, canEdit, icon, typeMeta, comingSoon = false,
}: {
  c: ConnectorRow;
  canEdit: boolean;
  icon: string;
  typeMeta: Record<string, { label: string; colour: string; bg: string; border: string }>;
  comingSoon?: boolean;
}) {
  const tm = c.connector_type ? typeMeta[c.connector_type] : null;

  return (
    <div style={{
      background: comingSoon ? '#FAFBFC' : 'var(--surface)',
      border: `1px solid ${comingSoon ? '#E2E8F0' : 'var(--border)'}`,
      borderRadius: 8, padding: '14px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      opacity: comingSoon ? 0.82 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: comingSoon ? '#F0F4F8' : 'var(--surface-raised)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          {icon}
        </div>

        {/* Text */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: comingSoon ? '#64748B' : 'var(--navy)' }}>
              {c.display_name}
            </span>
            {c.is_system && (
              <span style={{ fontSize: 11, fontWeight: 500, background: '#E8F0FE', color: '#1967D2', borderRadius: 4, padding: '2px 6px' }}>
                System
              </span>
            )}
            {tm && (
              <span style={{ fontSize: 11, fontWeight: 500, color: tm.colour, background: tm.bg, border: `1px solid ${tm.border}`, borderRadius: 4, padding: '2px 6px' }}>
                {tm.label}
              </span>
            )}
            {comingSoon && (
              <span style={{ fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: 4, padding: '2px 7px' }}>
                Coming Soon
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.connector_key}</code>
            {c.description && <> · {c.description}</>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!comingSoon && (
          <Link href={`/platform/connectors/${c.id}/object-types`} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--navy)',
            padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
            textDecoration: 'none', background: 'var(--surface)',
          }}>
            Object types
          </Link>
        )}
        {comingSoon && (
          <Link href={`/platform/connectors/${c.id}/object-types`} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--muted)',
            padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
            textDecoration: 'none', background: 'transparent',
          }}>
            Preview schema
          </Link>
        )}
        {canEdit && !c.is_system && (
          <Link href={`/platform/connectors/${c.id}`} style={{
            fontSize: 12, fontWeight: 500, color: 'var(--muted)',
            padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
            textDecoration: 'none', background: 'transparent',
          }}>
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}

// ── StaticComingSoonCard — for platform features not backed by DB connector rows ──

function StaticComingSoonCard({
  icon, name, description, typeBadge, docLink,
}: {
  icon: string;
  name: string;
  description: string;
  typeBadge: { label: string; colour: string; bg: string; border: string };
  docLink?: string;
}) {
  return (
    <div style={{
      background: '#FAFBFC', border: '1px solid #E2E8F0',
      borderRadius: 8, padding: '14px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      opacity: 0.82,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: '#F0F4F8', border: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#64748B' }}>{name}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: typeBadge.colour, background: typeBadge.bg, border: `1px solid ${typeBadge.border}`, borderRadius: 4, padding: '2px 6px' }}>
              {typeBadge.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: 4, padding: '2px 7px' }}>
              Coming Soon
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
        </div>
      </div>

      {docLink && (
        <div style={{ flexShrink: 0 }}>
          <span style={{
            fontSize: 12, fontWeight: 500, color: 'var(--muted)',
            padding: '6px 12px', borderRadius: 5, border: '1px solid #E2E8F0',
            background: 'transparent', whiteSpace: 'nowrap',
          }}>
            Roadmap docs
          </span>
        </div>
      )}
    </div>
  );
}
