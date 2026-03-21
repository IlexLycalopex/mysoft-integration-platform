import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import EditConnectorForm from './EditConnectorForm';

interface ConnectorDetail {
  id: string;
  connector_key: string;
  display_name: string;
  description: string | null;
  default_price_gbp_monthly: number | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export default async function ConnectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: connector } = await (admin as any)
    .from('endpoint_connectors')
    .select('id, connector_key, display_name, description, default_price_gbp_monthly, is_system, is_active, sort_order, created_at')
    .eq('id', id)
    .single() as { data: ConnectorDetail | null };

  if (!connector) notFound();

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/platform/connectors" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Connectors
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            {connector.display_name}
          </h1>
          {connector.is_system && (
            <span style={{ fontSize: 11, fontWeight: 500, background: '#E8F0FE', color: '#1967D2', borderRadius: 4, padding: '2px 6px' }}>
              System
            </span>
          )}
          {!connector.is_active && (
            <span style={{ fontSize: 11, fontWeight: 500, background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', borderRadius: 4, padding: '2px 6px' }}>
              Inactive
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-dm-mono)' }}>
          {connector.connector_key}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <Link href={`/platform/connectors/${id}/object-types`} style={{
          fontSize: 12, fontWeight: 500, color: 'var(--navy)',
          padding: '6px 14px', borderRadius: 5, border: '1px solid var(--border)',
          textDecoration: 'none', background: 'var(--surface)',
        }}>
          Object types →
        </Link>
      </div>

      {canEdit && !connector.is_system ? (
        <EditConnectorForm connector={connector} />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Display Name</div>
              <div style={{ fontSize: 14, color: 'var(--navy)' }}>{connector.display_name}</div>
            </div>
            {connector.description && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 13, color: 'var(--navy)' }}>{connector.description}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Default Price</div>
              <div style={{ fontSize: 13, color: 'var(--navy)' }}>
                {connector.default_price_gbp_monthly != null ? `£${connector.default_price_gbp_monthly.toFixed(2)}/mo` : 'Not set'}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 20 }}>System connectors are read-only.</p>
        </div>
      )}
    </div>
  );
}
