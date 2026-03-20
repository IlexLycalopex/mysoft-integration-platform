import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole, TransactionType } from '@/types/database';
import { TRANSACTION_TYPE_LABELS } from '@/lib/intacct-fields';
import CloneMappingButton from './CloneMappingButton';
import DownloadTemplateButton from './DownloadTemplateButton';

interface MappingRow {
  id: string;
  name: string;
  description: string | null;
  transaction_type: TransactionType;
  is_default: boolean;
  is_template: boolean;
  column_mappings: unknown[];
  sync_status: 'up_to_date' | 'update_available' | 'conflict' | 'diverged' | null;
  inheritance_mode: 'standalone' | 'linked' | 'inherit';
  created_at: string;
  updated_at: string;
}

export default async function MappingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  // Platform admins manage templates from their own dedicated page
  if (['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) redirect('/platform/mappings');

  const canManage = ['tenant_admin', 'tenant_operator'].includes(profile.role);

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  const admin = createAdminClient();

  // Tenant mappings
  if (!effectiveTenantId) redirect('/dashboard');

  const tenantQuery = admin
    .from('field_mappings')
    .select('id, name, description, transaction_type, is_default, is_template, column_mappings, sync_status, inheritance_mode, created_at, updated_at')
    .eq('is_template', false)
    .eq('tenant_id', effectiveTenantId)
    .order('transaction_type')
    .order('name');

  // System templates — only published ones visible to tenant users
  const templatesQuery = admin
    .from('field_mappings')
    .select('id, name, description, transaction_type, is_default, is_template, column_mappings, created_at, updated_at')
    .eq('is_template', true)
    .eq('template_status', 'published')
    .order('transaction_type')
    .order('name');

  const jobCountQuery = admin
    .from('upload_jobs')
    .select('mapping_id')
    .eq('tenant_id', effectiveTenantId)
    .not('mapping_id', 'is', null);

  const [r1, r2, r3] = await Promise.all([tenantQuery, templatesQuery, jobCountQuery]);
  const mappings  = (r1 as { data: MappingRow[] | null }).data ?? [];
  const templates = (r2 as { data: MappingRow[] | null }).data ?? [];
  const jobRows   = (r3 as { data: { mapping_id: string }[] | null }).data ?? [];

  // Build mapping_id → job count lookup
  const jobCountMap: Record<string, number> = {};
  for (const row of jobRows) {
    if (row.mapping_id) {
      jobCountMap[row.mapping_id] = (jobCountMap[row.mapping_id] ?? 0) + 1;
    }
  }

  const grouped = mappings.reduce<Record<string, MappingRow[]>>((acc, m) => {
    (acc[m.transaction_type] ??= []).push(m);
    return acc;
  }, {});

  const groupedTemplates = templates.reduce<Record<string, MappingRow[]>>((acc, m) => {
    (acc[m.transaction_type] ??= []).push(m);
    return acc;
  }, {});

  const updatesAvailable = mappings.filter((m) => m.sync_status === 'update_available').length;
  const conflictsCount   = mappings.filter((m) => m.sync_status === 'conflict').length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
            Field Mappings
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Map source CSV columns to Sage Intacct API fields
          </p>
        </div>
        {canManage && (
          <Link href="/mappings/new" style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
            + New mapping
          </Link>
        )}
      </div>

      {/* Sync notification strip */}
      {(updatesAvailable > 0 || conflictsCount > 0) && (
        <div style={{
          background: conflictsCount > 0 ? '#FEF3C7' : '#EFF6FF',
          border: `1px solid ${conflictsCount > 0 ? '#FCD34D' : '#BFDBFE'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: conflictsCount > 0 ? '#92400E' : '#1E40AF' }}>
            {conflictsCount > 0
              ? `⚠ ${conflictsCount} mapping${conflictsCount !== 1 ? 's have' : ' has'} conflicts requiring resolution`
              : `⚡ ${updatesAvailable} mapping${updatesAvailable !== 1 ? 's have' : ' has'} updates available from platform templates`}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Open each mapping to review</span>
        </div>
      )}

      {/* System Templates */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>System Templates</h2>
            <span style={{ fontSize: 11, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px' }}>
              Read-only · Clone to customise
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([type, label]) => {
              const group = groupedTemplates[type];
              if (!group?.length) return null;
              return (
                <div key={type}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>{label}</h3>
                  <div style={{ background: 'var(--surface)', border: '1px solid #D8E2EA', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Name', 'Fields', '', ...(canManage ? [''] : [])].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((m) => (
                          <tr key={m.id}>
                            <td style={tdStyle}>
                              <Link href={`/mappings/${m.id}`} style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)', textDecoration: 'none' }}>
                                {m.name}
                              </Link>
                              {m.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.description}</div>}
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {Array.isArray(m.column_mappings) ? m.column_mappings.length : 0} fields
                              </span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <DownloadTemplateButton
                                mappingName={m.name}
                                columnMappings={Array.isArray(m.column_mappings) ? m.column_mappings as { source_column: string }[] : []}
                              />
                            </td>
                            {canManage && (
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                <CloneMappingButton mappingId={m.id} isTemplate label="Clone" />
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
        </div>
      )}

      {/* Tenant mappings */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', margin: '0 0 12px' }}>Your Mappings</h2>
        {!mappings.length ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 16px' }}>
              No custom mappings yet. Clone a template above or create one from scratch.
            </p>
            {canManage && (
              <Link href="/mappings/new" style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 500 }}>
                Create mapping
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([type, label]) => {
              const group = grouped[type];
              if (!group?.length) return null;
              return (
                <div key={type}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 6px' }}>{label}</h3>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Name', 'Fields', 'Jobs', 'Default', 'Last updated', '', ...(canManage ? [''] : [])].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((m) => (
                          <tr key={m.id}>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                <Link href={`/mappings/${m.id}`} style={{ fontWeight: 500, fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
                                  {m.name}
                                </Link>
                                {m.sync_status === 'update_available' && (
                                  <span style={{ fontSize: 10, fontWeight: 600, background: '#DBEAFE', color: '#1E40AF', borderRadius: 4, padding: '1px 6px' }}>⚡ Update</span>
                                )}
                                {m.sync_status === 'conflict' && (
                                  <span style={{ fontSize: 10, fontWeight: 600, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 6px' }}>⚠ Conflict</span>
                                )}
                                {m.sync_status === 'up_to_date' && m.inheritance_mode !== 'standalone' && (
                                  <span style={{ fontSize: 10, fontWeight: 600, background: '#E6F7ED', color: '#1A6B30', borderRadius: 4, padding: '1px 6px' }}>✓ Synced</span>
                                )}
                              </div>
                              {m.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.description}</div>}
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {Array.isArray(m.column_mappings) ? m.column_mappings.length : 0} field{Array.isArray(m.column_mappings) && m.column_mappings.length !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              {(jobCountMap[m.id] ?? 0) > 0 ? (
                                <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 500 }}>
                                  {jobCountMap[m.id]}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={tdStyle}>
                              {m.is_default ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 7px' }}>Default</span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                {new Date(m.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <DownloadTemplateButton
                                mappingName={m.name}
                                columnMappings={Array.isArray(m.column_mappings) ? m.column_mappings as { source_column: string }[] : []}
                              />
                            </td>
                            {canManage && (
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                <CloneMappingButton mappingId={m.id} label="Clone" style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', padding: '5px 10px', fontSize: 12 }} />
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
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
