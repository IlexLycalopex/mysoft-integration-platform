import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import FileUploader from './FileUploader';
import type { UserRole } from '@/types/database';
import type { UploadJobRow } from '@/lib/actions/uploads';
import { getSourceBadge } from '@/lib/source-labels';
import { checkUsageLimits } from '@/lib/actions/usage';

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  pending:    { bg: '#FFF8E6', text: '#92620A', border: '#F5D98C' },
  processing: { bg: '#E6F4FF', text: '#0A4F92', border: '#A3CFFF' },
  completed:  { bg: '#E6F7ED', text: '#1A6B30', border: '#A3D9B1' },
  failed:     { bg: '#FDE8E6', text: '#9B2B1E', border: '#F5C6C2' },
  cancelled:  { bg: '#F7FAFC', text: 'var(--muted)', border: 'var(--border)' },
};

export default async function UploadsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const canUpload = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'].includes(profile.role);

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  const admin = createAdminClient();

  const [{ data: mappings }, usageCheck] = await Promise.all([
    admin
      .from('field_mappings')
      .select('id, name, transaction_type')
      .eq('tenant_id', effectiveTenantId ?? '')
      .order('name'),
    effectiveTenantId ? checkUsageLimits(effectiveTenantId) : Promise.resolve({ allowed: true as const }),
  ]);

  let query = admin
    .from('upload_jobs')
    .select('id, filename, file_size, status, source_type, row_count, processed_count, error_count, error_message, created_at, completed_at, created_by')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    if (!effectiveTenantId) redirect('/dashboard');
    query = query.eq('tenant_id', effectiveTenantId);
  }

  const { data: jobs } = await query as { data: UploadJobRow[] | null };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Uploads
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Upload CSV or Excel files to process into Sage Intacct
        </p>
      </div>

      {canUpload && effectiveTenantId && !usageCheck.allowed ? (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 8, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: '#FBBFBC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9B2B1E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9B2B1E', marginBottom: 4 }}>Module not available</div>
            <div style={{ fontSize: 12, color: '#9B2B1E', marginBottom: 6 }}>
              Reason: <strong>Limit reached</strong>
              {usageCheck.metric && (
                <> — {usageCheck.metric.replace(/_/g, ' ')} limit exceeded
                  {usageCheck.limit != null && usageCheck.used != null && (
                    <> ({usageCheck.used.toLocaleString()} / {usageCheck.limit.toLocaleString()})</>
                  )}
                </>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#9B2B1E', opacity: 0.85 }}>
              Contact your account manager to upgrade your plan and unlock this feature.
            </div>
          </div>
        </div>
      ) : canUpload && effectiveTenantId ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 12, marginTop: 0 }}>
            New Upload
          </p>
          <FileUploader tenantId={effectiveTenantId} mappings={(mappings ?? []).filter(m => m.transaction_type != null) as { id: string; name: string; transaction_type: string }[]} />
        </div>
      ) : canUpload && !effectiveTenantId ? (
        <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: '#92620A' }}>
          Platform admins are not associated with a tenant. Log in as a tenant user (e.g. <strong>admin@acme-financials.com</strong>) to upload files.
        </div>
      ) : null}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Recent Uploads</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{jobs?.length ?? 0} file{jobs?.length !== 1 ? 's' : ''}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['File', 'Size', 'Source', 'Status', 'Rows', 'Uploaded'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!jobs?.length ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No uploads yet. Drop a file above to get started.
                </td>
              </tr>
            ) : jobs.map((job) => {
              const colours = STATUS_COLOURS[job.status] ?? STATUS_COLOURS.pending;
              return (
                <tr key={job.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>{job.filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>{job.id.slice(0, 8)}…</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {job.file_size ? formatBytes(job.file_size) : '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {(() => {
                      const src = getSourceBadge(job.source_type);
                      return (
                        <span style={{ fontSize: 11, fontWeight: 600, color: src.colour, background: src.bg, border: `1px solid ${src.border}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                          {src.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colours.text, background: colours.bg, border: `1px solid ${colours.border}`, borderRadius: 4, padding: '2px 7px' }}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12 }}>
                      {job.row_count != null ? (
                        <>
                          <span style={{ color: 'var(--navy)', fontWeight: 500 }}>{job.processed_count}</span>
                          <span style={{ color: 'var(--muted)' }}>/{job.row_count}</span>
                          {job.error_count > 0 && (
                            <span style={{ color: 'var(--error)', marginLeft: 4 }}>({job.error_count} err)</span>
                          )}
                        </>
                      ) : '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {new Date(job.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
