import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import DeleteObjectTypeButton from './DeleteObjectTypeButton';
import ConnectorTabNav from '@/components/platform/ConnectorTabNav';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ObjectTypesPage({ params }: PageProps) {
  const { id: connectorId } = await params;

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
    .select('id, connector_key, display_name, is_system')
    .eq('id', connectorId)
    .single();

  if (!connector) notFound();

  const { data: objectTypes } = await (admin as any)
    .from('endpoint_object_types')
    .select('id, object_key, display_name, description, is_system, is_active, api_object_name, field_schema, created_at')
    .eq('connector_id', connectorId)
    .order('sort_order', { ascending: true });

  const rows = objectTypes ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 4 }}>
        <Link href="/platform/connectors" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Connectors
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 2px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          {connector.display_name}
        </h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 20px', fontFamily: 'var(--font-dm-mono)' }}>
        {connector.connector_key}
      </p>

      <ConnectorTabNav connectorId={connectorId} active="object-types" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          {rows.length} object type{rows.length !== 1 ? 's' : ''}
        </p>
        {canEdit && (
          <Link href={`/platform/connectors/${connectorId}/object-types/new`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 500,
            padding: '8px 16px', borderRadius: 6, textDecoration: 'none',
          }}>
            + Add object type
          </Link>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
              {['Name', 'Key', 'Description', 'Fields', 'Status', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((ot: any, i: number) => (
              <tr key={ot.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ot.display_name}
                  </div>
                  {ot.is_system && (
                    <span style={{ fontSize: 10, fontWeight: 500, background: '#E8F0FE', color: '#1967D2', borderRadius: 3, padding: '1px 5px', marginTop: 2, display: 'inline-block' }}>
                      System
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>{ot.object_key}</code>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ot.description ?? '—'}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>
                  {ot.field_schema?.fields?.length ?? 0}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '2px 7px',
                    background: ot.is_active ? '#E6F7ED' : '#F3F4F6',
                    color: ot.is_active ? '#1A6B30' : 'var(--muted)',
                  }}>
                    {ot.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && !ot.is_system && (
                      <>
                        <Link href={`/platform/connectors/${connectorId}/object-types/${ot.id}/edit`} style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'none' }}>
                          Edit
                        </Link>
                        <DeleteObjectTypeButton objectTypeId={ot.id} connectorId={connectorId} displayName={ot.display_name} />
                      </>
                    )}
                    {ot.is_system && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>View only</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '32px 14px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                  No object types defined yet.{canEdit && ' Add one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
