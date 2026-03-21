import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRANSACTION_TYPE_LABELS } from '@/lib/intacct-fields';
import type { UserRole, TransactionType } from '@/types/database';
import { getAllObjectTypes } from '@/lib/connectors/registry';
import TemplateStatusButton from './TemplateStatusButton';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  transaction_type: TransactionType;
  template_status: 'draft' | 'published';
  column_mappings: unknown[];
  created_at: string;
  updated_at: string;
}

export default async function PlatformMappingsPage() {
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

  const { data: templates } = await admin
    .from('field_mappings')
    .select('id, name, description, transaction_type, template_status, column_mappings, created_at, updated_at')
    .eq('is_template', true)
    .order('transaction_type')
    .order('name') as { data: TemplateRow[] | null };

  const grouped = (templates ?? []).reduce<Record<string, TemplateRow[]>>((acc, t) => {
    (acc[t.transaction_type] ??= []).push(t);
    return acc;
  }, {});

  const objectTypes = await getAllObjectTypes();
  // Build a display-name map: DB types take priority, built-in labels as fallback
  const typeLabels: Record<string, string> = { ...TRANSACTION_TYPE_LABELS };
  for (const ot of objectTypes) { typeLabels[ot.key] = ot.displayName; }

  const totalPublished = (templates ?? []).filter((t) => t.template_status === 'published').length;
  const totalDraft = (templates ?? []).filter((t) => t.template_status === 'draft').length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{
        background: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        color: '#1E40AF',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Mapping templates are now managed within each connector.{' '}
          <Link href="/platform/connectors" style={{ color: '#1E40AF', fontWeight: 600 }}>
            Go to Connectors →
          </Link>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            Mapping Templates
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {(templates ?? []).length} template{(templates ?? []).length !== 1 ? 's' : ''}
            {totalPublished > 0 && ` · ${totalPublished} published`}
            {totalDraft > 0 && ` · ${totalDraft} draft`}
          </p>
        </div>
        {canEdit && (
          <Link
            href="/platform/mappings/new"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New template
          </Link>
        )}
      </div>

      {!(templates ?? []).length ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 16px' }}>No templates yet.</p>
          {canEdit && (
            <Link href="/platform/mappings/new" style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 500 }}>
              Create first template
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.keys(grouped).sort((a, b) => {
            const ai = objectTypes.findIndex(t => t.key === a);
            const bi = objectTypes.findIndex(t => t.key === b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          }).map((type) => {
            const label = typeLabels[type] ?? type;
            const group = grouped[type];
            if (!group?.length) return null;
            return (
              <div key={type}>
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>{label}</h3>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Name', 'Fields', 'Status', 'Updated', ...(canEdit ? [''] : [])].map((h, i) => (
                          <th key={i} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((t) => (
                        <tr key={t.id}>
                          <td style={tdStyle}>
                            <Link href={`/platform/mappings/${t.id}`} style={{ fontWeight: 500, fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
                              {t.name}
                            </Link>
                            {t.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.description}</div>}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                              {Array.isArray(t.column_mappings) ? t.column_mappings.length : 0} field{Array.isArray(t.column_mappings) && t.column_mappings.length !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {t.template_status === 'published' ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 7px' }}>
                                Published
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px' }}>
                                Draft
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {new Date(t.updated_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                            </span>
                          </td>
                          {canEdit && (
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Link
                                  href={`/platform/mappings/${t.id}`}
                                  style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }}
                                >
                                  Edit
                                </Link>
                                <TemplateStatusButton templateId={t.id} currentStatus={t.template_status} />
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
