/**
 * /platform/jobs — Platform-level job queue management
 *
 * Shows live queue status across all tenants and surfaces the
 * dead-letter queue (DLQ) with one-click retry capability.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import DlqRetryButton from './DlqRetryButton';

const STATUS_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  pending:            { label: 'Pending',          colour: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
  queued:             { label: 'Queued',            colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  processing:         { label: 'Processing',        colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  awaiting_retry:     { label: 'Awaiting Retry',    colour: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  completed:          { label: 'Completed',         colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  completed_with_errors: { label: 'With Errors',   colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  failed:             { label: 'Failed',            colour: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
  dead_letter:        { label: 'Dead Letter',       colour: '#7F1D1D', bg: '#FEF2F2', border: '#FCA5A5' },
  cancelled:          { label: 'Cancelled',         colour: '#94A3B8', bg: '#F1F5F9', border: '#E2E8F0' },
};

const ERROR_CAT_META: Record<string, { label: string; colour: string }> = {
  transient:     { label: 'Transient',     colour: '#92620A' },
  data:          { label: 'Data',          colour: '#1E40AF' },
  configuration: { label: 'Config',        colour: '#6B21A8' },
  system:        { label: 'System',        colour: '#DC2626' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, colour: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: m.colour, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)',
  textTransform: 'uppercase', padding: '9px 14px', textAlign: 'left',
  background: '#F7FAFC', borderBottom: '1px solid var(--border)',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 14px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle',
};

export default async function PlatformJobsPage() {
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

  const admin = createAdminClient();

  const [{ data: allJobs }, { data: allTenants }] = await Promise.all([
    (admin as any)
      .from('upload_jobs')
      .select('id, tenant_id, status, filename, attempt_count, max_attempts, error_category, last_error_message, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200),
    (admin as any).from('tenants').select('id, name'),
  ]);

  const jobs = (allJobs ?? []) as {
    id: string; tenant_id: string; status: string; filename: string;
    attempt_count: number; max_attempts: number;
    error_category: string | null; last_error_message: string | null;
    created_at: string; updated_at: string;
  }[];

  const tenantMap = Object.fromEntries(((allTenants ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

  // Queue depth by status
  const byStatus: Record<string, number> = {};
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  }

  // Active (non-terminal) jobs = pending + queued + processing + awaiting_retry
  const activeStatuses = ['pending', 'queued', 'processing', 'awaiting_retry'];
  const activeJobs = jobs.filter((j) => activeStatuses.includes(j.status));
  const dlqJobs = jobs.filter((j) => j.status === 'dead_letter');
  const recentFailed = jobs.filter((j) => j.status === 'failed').slice(0, 20);

  const canRetry = profile.role === 'platform_super_admin';

  const QUEUE_DISPLAY = [
    { key: 'pending',        label: 'Pending' },
    { key: 'queued',         label: 'Queued' },
    { key: 'processing',     label: 'Processing' },
    { key: 'awaiting_retry', label: 'Awaiting Retry' },
    { key: 'dead_letter',    label: 'Dead Letter' },
    { key: 'failed',         label: 'Failed' },
    { key: 'completed_with_errors', label: 'With Errors' },
    { key: 'completed',      label: 'Completed' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 4 }}>
        <Link href="/platform" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← Platform</Link>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px', letterSpacing: -0.3 }}>
        Job Queue
      </h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }}>
        Live queue status across all tenants — last 200 jobs by activity.
      </p>

      {/* Queue status cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {QUEUE_DISPLAY.map(({ key, label }) => {
          const count = byStatus[key] ?? 0;
          const m = STATUS_META[key];
          const isDlq = key === 'dead_letter';
          return (
            <div key={key} style={{
              background: isDlq && count > 0 ? '#FEF2F2' : 'var(--surface)',
              border: `1px solid ${isDlq && count > 0 ? '#FCA5A5' : 'var(--border)'}`,
              borderRadius: 8, padding: '14px 20px', minWidth: 110,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: count > 0 ? m.colour : 'var(--muted)', lineHeight: 1 }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* DLQ section */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${dlqJobs.length > 0 ? '#FCA5A5' : 'var(--border)'}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: dlqJobs.length > 0 ? '#FEF2F2' : '#F7FAFC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: dlqJobs.length > 0 ? '#7F1D1D' : 'var(--navy)' }}>
              Dead Letter Queue {dlqJobs.length > 0 && `— ${dlqJobs.length} job${dlqJobs.length !== 1 ? 's' : ''}`}
            </span>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
              Jobs that exhausted all retry attempts. Review and retry or dismiss.
            </p>
          </div>
        </div>

        {dlqJobs.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#1A6B30', fontSize: 13 }}>
            ✓ Dead letter queue is empty
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'File', 'Error', 'Category', 'Attempts', 'Last Updated', ''].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dlqJobs.map((job) => {
                const cat = job.error_category ? (ERROR_CAT_META[job.error_category] ?? { label: job.error_category, colour: 'var(--muted)' }) : null;
                return (
                  <tr key={job.id} style={{ background: '#FFFAFA' }}>
                    <td style={tdStyle}>
                      <Link href={`/platform/tenants/${job.tenant_id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {tenantMap[job.tenant_id] ?? job.tenant_id.slice(0, 8) + '…'}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-dm-mono)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' }}>
                        {job.filename}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 280 }}>
                      <span style={{ fontSize: 12, color: '#DC2626', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.last_error_message ?? '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {cat ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: cat.colour }}>{cat.label}</span>
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {job.attempt_count} / {job.max_attempts}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDate(job.updated_at)}</span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Link href={`/jobs/${job.id}`} style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>
                          View →
                        </Link>
                        {canRetry && <DlqRetryButton jobId={job.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Active Jobs ({activeJobs.length})</span>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>Currently in pipeline</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'File', 'Status', 'Attempts', 'Started'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((job) => (
                <tr key={job.id}>
                  <td style={tdStyle}>
                    <Link href={`/platform/tenants/${job.tenant_id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                      {tenantMap[job.tenant_id] ?? job.tenant_id.slice(0, 8) + '…'}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-dm-mono)' }}>
                      {job.filename}
                    </span>
                  </td>
                  <td style={tdStyle}><StatusBadge status={job.status} /></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{job.attempt_count} / {job.max_attempts}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDate(job.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent failures */}
      {recentFailed.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Recent Failures ({recentFailed.length})</span>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>Jobs that reached terminal failure state</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'File', 'Error', 'Category', 'Failed At', ''].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentFailed.map((job) => {
                const cat = job.error_category ? (ERROR_CAT_META[job.error_category] ?? { label: job.error_category, colour: 'var(--muted)' }) : null;
                return (
                  <tr key={job.id}>
                    <td style={tdStyle}>
                      <Link href={`/platform/tenants/${job.tenant_id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {tenantMap[job.tenant_id] ?? job.tenant_id.slice(0, 8) + '…'}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-dm-mono)' }}>{job.filename}</span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 280 }}>
                      <span style={{ fontSize: 12, color: '#DC2626', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.last_error_message ?? '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {cat ? <span style={{ fontSize: 11, fontWeight: 600, color: cat.colour }}>{cat.label}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDate(job.updated_at)}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/jobs/${job.id}`} style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>View →</Link>
                        {canRetry && <DlqRetryButton jobId={job.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
