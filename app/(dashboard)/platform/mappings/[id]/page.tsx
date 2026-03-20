import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRANSACTION_TYPE_LABELS } from '@/lib/intacct-fields';
import type { UserRole, TransactionType, ColumnMappingEntry } from '@/types/database';
import EditTemplateForm from './EditTemplateForm';
import TemplateStatusButton from '../TemplateStatusButton';

interface TemplateFull {
  id: string;
  name: string;
  description: string | null;
  transaction_type: TransactionType;
  template_status: 'draft' | 'published';
  column_mappings: ColumnMappingEntry[];
  created_at: string;
  updated_at: string;
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '9px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    redirect('/platform/mappings');
  }

  const canEdit = profile.role === 'platform_super_admin';
  const admin = createAdminClient();

  const { data: template } = await admin
    .from('field_mappings')
    .select('id, name, description, transaction_type, template_status, column_mappings, created_at, updated_at')
    .eq('id', id)
    .eq('is_template', true)
    .single<TemplateFull>();

  if (!template) notFound();

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/platform/mappings" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Templates
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '8px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
              {template.name}
            </h1>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{TRANSACTION_TYPE_LABELS[template.transaction_type]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {template.template_status === 'published' ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '3px 8px' }}>
                Published
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '3px 8px' }}>
                Draft
              </span>
            )}
            {canEdit && (
              <TemplateStatusButton templateId={template.id} currentStatus={template.template_status} />
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-dm-mono)' }}>
          {template.id} · updated {new Date(template.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {canEdit ? (
        <EditTemplateForm
          templateId={template.id}
          initialName={template.name}
          initialDescription={template.description}
          initialTransactionType={template.transaction_type}
          initialColumnMappings={template.column_mappings}
        />
      ) : (
        /* Read-only view for support admin */
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
              {template.column_mappings.map((row) => (
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
      )}
    </div>
  );
}
