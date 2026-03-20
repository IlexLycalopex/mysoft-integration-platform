import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole, TransactionType, ColumnMappingEntry } from '@/types/database';
import { TRANSACTION_TYPE_LABELS } from '@/lib/intacct-fields';
import EditMappingForm from './EditMappingForm';
import CloneMappingButton from '../CloneMappingButton';

interface MappingFull {
  id: string;
  name: string;
  description: string | null;
  transaction_type: TransactionType;
  is_default: boolean;
  is_template: boolean;
  column_mappings: ColumnMappingEntry[];
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '9px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };

export default async function EditMappingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/mappings');

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  // Platform admins manage templates from their own area
  if (isPlatformAdmin) redirect(`/platform/mappings/${id}`);

  const canManage = ['tenant_admin', 'tenant_operator'].includes(profile.role);

  const admin = createAdminClient();
  const { data: mapping } = await admin
    .from('field_mappings')
    .select('id, name, description, transaction_type, is_default, is_template, column_mappings, tenant_id, created_at, updated_at')
    .eq('id', id)
    .single<MappingFull>();

  if (!mapping) notFound();

  // Non-platform admins can only view their own tenant's mappings or system templates
  if (!isPlatformAdmin) {
    if (!mapping.is_template && mapping.tenant_id !== profile.tenant_id) notFound();
  }

  const isReadOnly = mapping.is_template || !canManage;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/mappings" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Mappings
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '8px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
              {mapping.name}
            </h1>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{TRANSACTION_TYPE_LABELS[mapping.transaction_type]}</span>
          </div>
          {mapping.is_template && (
            <span style={{ fontSize: 11, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
              System template · Read-only
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-dm-mono)' }}>
          {mapping.id} · updated {new Date(mapping.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Template clone CTA */}
      {mapping.is_template && canManage && (
        <div style={{ background: '#F0F7FF', border: '1px solid #C3DCFF', borderRadius: 8, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>This is a system template</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Clone it to create an editable copy you can customise for your tenant.</div>
          </div>
          <CloneMappingButton mappingId={mapping.id} label="Clone &amp; edit" />
        </div>
      )}

      {/* Non-template: clone button alongside */}
      {!mapping.is_template && canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <CloneMappingButton
            mappingId={mapping.id}
            label="Clone"
            style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', padding: '5px 12px', fontSize: 12 }}
          />
        </div>
      )}

      {isReadOnly ? (
        /* Read-only field table */
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Source column', 'Intacct field', 'Transform', 'Required'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mapping.column_mappings.map((row) => (
                <tr key={row.id}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-dm-mono)' }}>{row.source_column || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-dm-mono)' }}>{row.target_field || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--muted)' }}>{row.transform}</td>
                  <td style={tdStyle}>{row.required ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EditMappingForm
          mappingId={mapping.id}
          initialName={mapping.name}
          initialDescription={mapping.description}
          initialTransactionType={mapping.transaction_type}
          initialIsDefault={mapping.is_default}
          initialColumnMappings={mapping.column_mappings}
        />
      )}
    </div>
  );
}
