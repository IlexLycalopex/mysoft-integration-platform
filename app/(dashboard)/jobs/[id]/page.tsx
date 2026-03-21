import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';
import type { ProcessingLogEntry } from '@/lib/intacct/log-types';
import ReprocessButton, { ReprocessDryRunButton } from '@/components/jobs/ReprocessButton';
import { ApproveButton, RejectButton } from '@/components/jobs/ApprovalButtons';

const LEVEL_STYLE: Record<string, { colour: string; bg: string; border: string; icon: string }> = {
  info:    { colour: '#0A4F92', bg: '#E6F4FF', border: '#A3CFFF', icon: 'ℹ' },
  success: { colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1', icon: '✓' },
  warn:    { colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C', icon: '⚠' },
  error:   { colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2', icon: '✕' },
};

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  pending:            { bg: '#FFF8E6', text: '#92620A', border: '#F5D98C' },
  processing:         { bg: '#E6F4FF', text: '#0A4F92', border: '#A3CFFF' },
  completed:          { bg: '#E6F7ED', text: '#1A6B30', border: '#A3D9B1' },
  failed:             { bg: '#FDE8E6', text: '#9B2B1E', border: '#F5C6C2' },
  cancelled:          { bg: '#F7FAFC', text: 'var(--muted)', border: 'var(--border)' },
  awaiting_approval:  { bg: '#FFF3CD', text: '#856404', border: '#FFECB5' },
};

interface JobDetail {
  id: string;
  filename: string;
  status: string;
  row_count: number | null;
  processed_count: number;
  error_count: number;
  error_message: string | null;
  mapping_id: string | null;
  source_type: string | null;
  entity_id_override: string | null;
  entity_id_used: string | null;
  intacct_record_nos: string[] | null;
  processing_log: ProcessingLogEntry[] | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  file_deleted_at: string | null;
  tenant_id: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_note: string | null;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  let baseQuery = admin
    .from('upload_jobs')
    .select('id, filename, status, row_count, processed_count, error_count, error_message, mapping_id, source_type, entity_id_override, entity_id_used, intacct_record_nos, processing_log, created_at, started_at, completed_at, file_deleted_at, tenant_id, approved_by, approved_at, rejected_by, rejected_at, rejection_note')
    .eq('id', id);

  if (!isPlatformAdmin) {
    if (!effectiveTenantId) redirect('/dashboard');
    baseQuery = baseQuery.eq('tenant_id', effectiveTenantId);
  }

  const { data: job } = await baseQuery.single<JobDetail>();
  if (!job) notFound();

  // Load job events from the audit trail (new logging system)
  const { data: jobEvents } = await admin
    .from('job_events')
    .select('id, event_type, severity, message, metadata_json, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: true })
    .limit(500)
    .returns<{ id: string; event_type: string; severity: string; message: string; metadata_json: Record<string, unknown> | null; created_at: string }[]>();

  // Load job errors
  const { data: jobErrors } = await admin
    .from('job_errors')
    .select('id, row_number, field_name, error_code, error_message, raw_data, created_at')
    .eq('job_id', id)
    .order('row_number');

  // Load mapping name
  let mappingName = '—';
  if (job.mapping_id) {
    const { data: m } = await admin
      .from('field_mappings')
      .select('name')
      .eq('id', job.mapping_id)
      .single<{ name: string }>();
    if (m) mappingName = m.name;
  }

  const colours = STATUS_COLOURS[job.status] ?? STATUS_COLOURS.pending;
  const duration = job.completed_at && job.started_at
    ? formatDuration(new Date(job.started_at), new Date(job.completed_at))
    : null;

  const canReprocess = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'].includes(profile.role);
  const reprocessStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
  const showReprocess = canReprocess && reprocessStatuses.includes(job.status);

  const canApprove = ['tenant_admin', 'platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  // Resolve approval/rejection user emails for display
  let approvedByEmail: string | null = null;
  let rejectedByEmail: string | null = null;
  if (job.approved_by) {
    try {
      const { data: { user: approver } } = await admin.auth.admin.getUserById(job.approved_by);
      approvedByEmail = approver?.email ?? job.approved_by;
    } catch { approvedByEmail = job.approved_by; }
  }
  if (job.rejected_by) {
    try {
      const { data: { user: rejecter } } = await admin.auth.admin.getUserById(job.rejected_by);
      rejectedByEmail = rejecter?.email ?? job.rejected_by;
    } catch { rejectedByEmail = job.rejected_by; }
  }

  // Build the processing log: prefer job_events (new system), fall back to legacy processing_log column
  const log: ProcessingLogEntry[] = jobEvents && jobEvents.length > 0
    ? jobEvents.map(e => ({
        t: e.created_at,
        level: (e.severity as ProcessingLogEntry['level']) ?? 'info',
        msg: e.message,
        data: e.metadata_json ?? undefined,
      }))
    : Array.isArray(job.processing_log)
      ? job.processing_log as ProcessingLogEntry[]
      : [];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/jobs" style={{ color: 'var(--blue)', fontSize: 13, textDecoration: 'none' }}>← Jobs</Link>
        <span style={{ color: 'var(--muted)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.filename}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>{job.filename}</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Job ID: <code style={{ fontSize: 11 }}>{job.id}</code></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {showReprocess && (
            <>
              <ReprocessDryRunButton jobId={job.id} currentStatus={job.status} size="sm" />
              <ReprocessButton jobId={job.id} currentStatus={job.status} size="sm" />
            </>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: colours.text, background: colours.bg, border: `1px solid ${colours.border}`, borderRadius: 6, padding: '5px 12px' }}>
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Awaiting approval banner */}
      {job.status === 'awaiting_approval' && (
        <div style={{ background: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 8, padding: '14px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#856404', marginBottom: 2 }}>Awaiting Admin Approval</div>
            <div style={{ fontSize: 13, color: '#92620A' }}>This job is waiting for admin approval before it is submitted to Intacct.</div>
          </div>
          {canApprove && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ApproveButton jobId={job.id} />
              <RejectButton jobId={job.id} />
            </div>
          )}
        </div>
      )}

      {/* Approval confirmation */}
      {job.approved_at && (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#1A6B30' }}>
            Approved by {approvedByEmail} on {new Date(job.approved_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Rejection info */}
      {job.rejected_at && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#9B2B1E' }}>
            Rejected by {rejectedByEmail} on {new Date(job.rejected_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {job.rejection_note && ` — Note: ${job.rejection_note}`}
          </span>
        </div>
      )}

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Mapping',    value: mappingName },
          { label: 'Rows',       value: job.row_count != null ? `${job.processed_count} / ${job.row_count}` : '—' },
          { label: 'Errors',     value: String(job.error_count), colour: job.error_count > 0 ? 'var(--error)' : undefined },
          { label: 'Duration',   value: duration ?? '—' },
        ].map((item) => (
          <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: item.colour ?? 'var(--navy)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Intacct entity */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Intacct Entity</div>
          {job.entity_id_used ? (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 8px' }}>
              {job.entity_id_used} <span style={{ fontSize: 11, fontWeight: 400, color: '#2E7D32' }}>(used)</span>
            </span>
          ) : job.entity_id_override ? (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#0A4F92', background: '#E6F4FF', border: '1px solid #A3CFFF', borderRadius: 4, padding: '2px 8px' }}>
              {job.entity_id_override} <span style={{ fontSize: 11, fontWeight: 400, color: '#0A4F92' }}>(override — not yet processed)</span>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Credential default</span>
          )}
        </div>
        {job.entity_id_used && job.entity_id_override && job.entity_id_used !== job.entity_id_override && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Override requested: <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{job.entity_id_override}</code>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {[
          { label: 'Created',   value: job.created_at },
          { label: 'Started',   value: job.started_at },
          { label: 'Completed', value: job.completed_at },
        ].map(ts => (
          <div key={ts.label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ts.label}</div>
            <div style={{ fontSize: 13, color: 'var(--navy)', marginTop: 2 }}>
              {ts.value ? new Date(ts.value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* File retention notice */}
      {job.file_deleted_at && (
        <div style={{ background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            File deleted (retention policy) — {new Date(job.file_deleted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Intacct RECORDNOs */}
      {job.intacct_record_nos?.length ? (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Intacct Record Numbers</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {job.intacct_record_nos.map(rn => (
              <span key={rn} style={{ fontSize: 13, fontWeight: 700, color: '#1A6B30', fontFamily: 'monospace', background: '#fff', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 8px' }}>
                #{rn}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Error message */}
      {job.error_message && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9B2B1E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Job Error</div>
          <div style={{ fontSize: 13, color: '#9B2B1E' }}>{job.error_message}</div>
        </div>
      )}

      {/* Processing Log */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Processing Log</h2>
        {log.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No processing log available. This job may have been processed before logging was enabled — retry it to generate a full log.
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {log.map((entry, idx) => {
              const s = LEVEL_STYLE[entry.level] ?? LEVEL_STYLE.info;
              return (
                <div key={idx} style={{ padding: '10px 16px', borderBottom: idx < log.length - 1 ? '1px solid #EEF2F5' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.colour, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {s.icon} {entry.level.toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--navy)' }}>{entry.msg}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(entry.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {entry.data && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer', userSelect: 'none' }}>Details</summary>
                        <pre style={{ fontSize: 11, background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px', marginTop: 4, overflow: 'auto', maxHeight: 300, color: 'var(--navy)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(entry.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Row Errors */}
      {jobErrors && jobErrors.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Row Errors ({jobErrors.length})</h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Row', 'Error', 'Raw Data'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobErrors.map(e => (
                  <tr key={e.id}>
                    <td style={{ ...tdStyle, width: 60 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>#{e.row_number ?? '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, color: 'var(--error)' }}>{e.error_message}</span>
                    </td>
                    <td style={tdStyle}>
                      {e.raw_data ? (
                        <details>
                          <summary style={{ fontSize: 11, color: 'var(--blue)', cursor: 'pointer' }}>View</summary>
                          <pre style={{ fontSize: 10, marginTop: 4, overflow: 'auto', maxHeight: 150, color: 'var(--navy)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(e.raw_data, null, 2)}
                          </pre>
                        </details>
                      ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'top' };
