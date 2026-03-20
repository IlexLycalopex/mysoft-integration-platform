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
    .select('id, connector_key, display_name, description, is_system, is_active, capabilities, created_at')
    .order('sort_order', { ascending: true }) as { data: ConnectorRow[] | null };

  const rows = connectors ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            Endpoint Connectors
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {rows.length} connector{rows.length !== 1 ? 's' : ''} — define and manage ERP/API endpoint types
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((c) => (
          <div key={c.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: 'var(--surface-raised)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                🔌
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>
                    {c.display_name}
                  </span>
                  {c.is_system && (
                    <span style={{ fontSize: 11, fontWeight: 500, background: '#E8F0FE', color: '#1967D2', borderRadius: 4, padding: '2px 6px' }}>
                      System
                    </span>
                  )}
                  {!c.is_active && (
                    <span style={{ fontSize: 11, fontWeight: 500, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '2px 6px' }}>
                      Inactive
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Key: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.connector_key}</code>
                  {c.description && <> · {c.description}</>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Link href={`/platform/connectors/${c.id}/object-types`} style={{
                fontSize: 12, fontWeight: 500, color: 'var(--navy)',
                padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
                textDecoration: 'none', background: 'var(--surface)',
              }}>
                Object types
              </Link>
              {canEdit && !c.is_system && (
                <Link href={`/platform/connectors/${c.id}`} style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--muted)',
                  padding: '6px 12px', borderRadius: 5, border: '1px solid var(--border)',
                  textDecoration: 'none', background: 'var(--surface)',
                }}>
                  Edit
                </Link>
              )}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: '40px 0' }}>
            No connectors yet.{canEdit && ' Add the first one above.'}
          </div>
        )}
      </div>
    </div>
  );
}
