import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';
import type { UploadJobRow } from '@/lib/actions/uploads';
import { getSourceBadge } from '@/lib/source-labels';
import ProcessJobButton from './ProcessJobButton';
import RetryJobButton from './RetryJobButton';
import CancelJobButton from './CancelJobButton';
import DeleteJobButton from './DeleteJobButton';
import JobsAutoRefresh from './JobsAutoRefresh';
import KillJobButton from './KillJobButton';
import ReprocessButton from '@/components/jobs/ReprocessButton';
import { ApproveButton, RejectButton } from '@/components/jobs/ApprovalButtons';
import { Suspense } from 'react';
import Pagination from '@/components/ui/Pagination';

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  pending:                { bg: '#FFF8E6', text: '#92620A',       border: '#F5D98C' },
  processing:             { bg: '#E6F4FF', text: '#0A4F92',       border: '#A3CFFF' },
  completed:              { bg: '#E6F7ED', text: '#1A6B30',       border: '#A3D9B1' },
  completed_with_errors:  { bg: '#FFF3E0', text: '#8B4513',       border: '#FFCC80' },
  failed:                 { bg: '#FDE8E6', text: '#9B2B1E',       border: '#F5C6C2' },
  cancelled:              { bg: '#F7FAFC', text: 'var(--muted)',  border: 'var(--border)' },
  awaiting_approval:      { bg: '#FFF3CD', text: '#856404',       border: '#FFECB5' },
};

const STATUS_LABELS: Record<string, string> = {
  pending:                'Pending',
  processing:             'Processing',
  completed:              'Completed',
  completed_with_errors:  'Completed with errors',
  failed:                 'Failed',
  cancelled:              'Cancelled',
  awaiting_approval:      'Awaiting Approval',
};

interface MappingOption { id: string; name: string; transaction_type: string }

const VALID_PAGE_SIZES = [10, 25, 50];

export default async function JobHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const filterStatus = params.status ?? '';
  const filterFrom = params.from ?? '';
  const filterTo = params.to ?? '';
  const filterTenant = params.tenant ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = VALID_PAGE_SIZES.includes(parseInt(params.pageSize ?? '25', 10))
    ? parseInt(params.pageSize ?? '25', 10)
    : 25;
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  let jobsQuery = admin
    .from('upload_jobs')
    .select('id, tenant_id, filename, file_size, status, row_count, processed_count, error_count, error_message, created_at, completed_at, started_at, created_by, mapping_id, source_type, watcher_config_id, intacct_record_nos, requires_approval, approved_by, approved_at, rejected_at, rejection_note, entity_id_override, entity_id_used', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filterStatus) jobsQuery = (jobsQuery as typeof jobsQuery).eq('status', filterStatus as 'pending');
  if (filterFrom) jobsQuery = jobsQuery.gte('created_at', filterFrom);
  if (filterTo) jobsQuery = jobsQuery.lte('created_at', filterTo + 'T23:59:59');

  let mappingsQuery = admin
    .from('field_mappings')
    .select('id, name, transaction_type')
    .order('name');

  if (!isPlatformAdmin) {
    if (!effectiveTenantId) redirect('/dashboard');
    jobsQuery = jobsQuery.eq('tenant_id', effectiveTenantId);
    mappingsQuery = mappingsQuery.eq('tenant_id', effectiveTenantId);
  } else if (filterTenant) {
    jobsQuery = jobsQuery.eq('tenant_id', filterTenant);
  }

  jobsQuery = jobsQuery.range(offset, offset + pageSize - 1);

  let watchersQuery = admin
    .from('watcher_configs')
    .select('id, name');

  if (!isPlatformAdmin && effectiveTenantId) {
    watchersQuery = watchersQuery.eq('tenant_id', effectiveTenantId);
  }

  const tenantsForFilter = isPlatformAdmin
    ? await admin.from('tenants').select('id, name').order('name')
    : null;
  const allTenantsForFilter = (tenantsForFilter as { data: { id: string; name: string }[] | null } | null)?.data ?? [];
  const tenantNameMap = Object.fromEntries(allTenantsForFilter.map((t) => [t.id, t.name]));

  const [r1, r2, r3] = await Promise.all([jobsQuery, mappingsQuery, watchersQuery]);
  const jobs     = (r1 as { data: (UploadJobRow & { tenant_id: string; mapping_id: string | null; source_type: string | null; watcher_config_id: string | null; intacct_record_nos: string[] | null })[] | null; count: number | null }).data;
  const totalJobs = (r1 as { count: number | null }).count ?? 0;
  const mappings = (r2 as { data: MappingOption[] | null }).data;
  const watcherMap = Object.fromEntries(((r3 as { data: { id: string; name: string }[] | null }).data ?? []).map((w) => [w.id, w.name]));

  const total = jobs?.length ?? 0;
  const completed = jobs?.filter((j) => j.status === 'completed').length ?? 0;
  const completedWithErrors = jobs?.filter((j) => (j.status as string) === 'completed_with_errors').length ?? 0;
  const failed = jobs?.filter((j) => j.status === 'failed').length ?? 0;
  const pending = jobs?.filter((j) => j.status === 'pending' || j.status === 'processing' || (j.status as string) === 'awaiting_approval').length ?? 0;

  const canProcess = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'].includes(profile.role);
  const hasActiveJobs = jobs?.some((j) => j.status === 'pending' || j.status === 'processing') ?? false;

  return (
    <div style={{ padding: 24 }}>
      <JobsAutoRefresh hasActiveJobs={hasActiveJobs} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>Job History</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>All file processing jobs for your workspace</p>
        </div>
        <Link href="/uploads" style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
          + New upload
        </Link>
      </div>

      {/* Filter bar */}
      <form method="GET" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, background: 'var(--surface)' }}>
        {isPlatformAdmin && allTenantsForFilter.length > 0 && (
          <select
            name="tenant"
            defaultValue={filterTenant}
            style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: '#fff', color: 'var(--navy)' }}
          >
            <option value="">All Tenants</option>
            {allTenantsForFilter.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select
          name="status"
          defaultValue={filterStatus}
          style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: '#fff', color: 'var(--navy)' }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="awaiting_approval">Awaiting Approval</option>
          <option value="completed">Completed</option>
          <option value="completed_with_errors">Completed with errors</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          From
          <input
            type="date"
            name="from"
            defaultValue={filterFrom}
            style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: '#fff', color: 'var(--navy)' }}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          To
          <input
            type="date"
            name="to"
            defaultValue={filterTo}
            style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: '#fff', color: 'var(--navy)' }}
          />
        </label>
        <button
          type="submit"
          style={{ fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer' }}
        >
          Filter
        </button>
        <Link href="/jobs" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Clear</Link>
      </form>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Jobs',       value: total,               colour: 'var(--navy)' },
          { label: 'Completed',        value: completed,           colour: 'var(--green)' },
          { label: 'With Errors',      value: completedWithErrors, colour: 'var(--warn)' },
          { label: 'Failed',           value: failed,              colour: 'var(--error)' },
          { label: 'In Progress',      value: pending,             colour: 'var(--blue)' },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.colour, letterSpacing: -0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label={`Job History — page ${page}`}>
          <thead>
            <tr>
              {[...(isPlatformAdmin ? ['Tenant'] : []), 'File', 'Entity', 'Source', 'Status', 'Progress', 'Intacct Ref', 'Duration', 'Started', ...(canProcess ? ['Action'] : [])].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!jobs?.length ? (
              <tr>
                <td colSpan={canProcess ? (isPlatformAdmin ? 10 : 9) : (isPlatformAdmin ? 9 : 8)} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No jobs yet.{' '}
                  <Link href="/uploads" style={{ color: 'var(--blue)' }}>Upload a file</Link> to get started.
                </td>
              </tr>
            ) : jobs.map((job) => {
              const colours = STATUS_COLOURS[job.status as string] ?? STATUS_COLOURS.pending;
              const duration = job.completed_at && job.started_at
                ? formatDuration(new Date(job.started_at), new Date(job.completed_at))
                : null;
              // Progress bar: include both successful and errored rows in width so bar is never misleadingly empty
              const touchedRows = (job.processed_count ?? 0) + (job.error_count ?? 0);
              const pct = job.row_count ? Math.round((touchedRows / job.row_count) * 100) : null;
              const jobWithSource = job as typeof job & { tenant_id: string; source_type: string | null; watcher_config_id: string | null; entity_id_override: string | null; entity_id_used: string | null };
              const sourceType = jobWithSource.source_type;
              const watcherName = jobWithSource.watcher_config_id ? watcherMap[jobWithSource.watcher_config_id] : null;
              const jobTenantName = tenantNameMap[jobWithSource.tenant_id] ?? jobWithSource.tenant_id?.slice(0, 8) + '…';
              const entityDisplay = jobWithSource.entity_id_used ?? jobWithSource.entity_id_override ?? null;

              return (
                <tr key={job.id}>
                  {isPlatformAdmin && (
                    <td style={tdStyle}>
                      <Link href={`/platform/tenants/${jobWithSource.tenant_id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {jobTenantName}
                      </Link>
                    </td>
                  )}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--navy)' }}>{job.filename}</div>
                    {job.error_message && (
                      <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>{job.error_message}</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {entityDisplay ? (
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: '#0A4F92', background: '#E6F4FF', border: '1px solid #A3CFFF', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        {entityDisplay}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }} title="Using credential-level default entity">default</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {(() => {
                      const src = getSourceBadge(sourceType);
                      return (
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: src.colour, background: src.bg, border: `1px solid ${src.border}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                            {src.label}
                          </span>
                          {watcherName && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{watcherName}</div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colours.text, background: colours.bg, border: `1px solid ${colours.border}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      {STATUS_LABELS[job.status as string] ?? job.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {job.row_count != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: '#E5EFF5', borderRadius: 2, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ height: '100%', background: job.error_count > 0 ? 'var(--error)' : 'var(--green)', width: `${pct ?? 0}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {job.processed_count}/{job.row_count}
                          {job.error_count > 0 && <span style={{ color: 'var(--error)' }}> · {job.error_count} err</span>}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {job.intacct_record_nos?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {job.intacct_record_nos.map((rn) => (
                          <span key={rn} style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            #{rn}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{duration ?? '—'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(job.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  {canProcess && (
                    <td style={{ ...tdStyle, minWidth: 280 }}>
                      {(job.status as string) === 'awaiting_approval' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <ApproveButton jobId={job.id} />
                          <RejectButton jobId={job.id} />
                        </div>
                      ) : job.status === 'pending' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <ProcessJobButton
                            jobId={job.id}
                            currentMappingId={(job as { mapping_id: string | null }).mapping_id}
                            mappings={mappings ?? []}
                          />
                          <CancelJobButton jobId={job.id} />
                        </div>
                      ) : job.status === 'failed' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <Link href={`/jobs/${job.id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View log</Link>
                          <RetryJobButton jobId={job.id} />
                          <ReprocessButton jobId={job.id} currentStatus={job.status} size="sm" />
                          <DeleteJobButton jobId={job.id} filename={job.filename} />
                        </div>
                      ) : job.status === 'completed' || (job.status as string) === 'completed_with_errors' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <Link href={`/jobs/${job.id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View log</Link>
                          <ReprocessButton jobId={job.id} currentStatus={job.status} size="sm" />
                          <DeleteJobButton jobId={job.id} filename={job.filename} />
                        </div>
                      ) : job.status === 'cancelled' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Link href={`/jobs/${job.id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>View log</Link>
                          <DeleteJobButton jobId={job.id} filename={job.filename} />
                        </div>
                      ) : job.status === 'processing' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Processing…</span>
                          <KillJobButton jobId={job.id} />
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <Suspense>
          <Pagination total={totalJobs} page={page} pageSize={pageSize} />
        </Suspense>
      </div>
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
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
