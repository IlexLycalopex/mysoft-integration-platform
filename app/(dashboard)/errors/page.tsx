import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import Pagination from '@/components/ui/Pagination';

interface ErrorRow {
  id: string;
  job_id: string;
  row_number: number | null;
  field_name: string | null;
  error_code: string | null;
  error_message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

interface JobMeta {
  id: string;
  filename: string;
}

const VALID_PAGE_SIZES = [10, 25, 50];

export default async function ErrorQueuePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const filterCode = params.code ?? '';
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

  const canView = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'].includes(profile.role);
  if (!canView) redirect('/dashboard');

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  let errorQuery = admin
    .from('job_errors')
    .select('id, job_id, tenant_id, row_number, field_name, error_code, error_message, raw_data, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filterCode) errorQuery = errorQuery.ilike('error_code', '%' + filterCode + '%');
  if (filterFrom) errorQuery = errorQuery.gte('created_at', filterFrom);
  if (filterTo) errorQuery = errorQuery.lte('created_at', filterTo + 'T23:59:59');

  if (!isPlatformAdmin) {
    if (!profile.tenant_id) redirect('/dashboard');
    errorQuery = errorQuery.eq('tenant_id', profile.tenant_id);
  } else if (filterTenant) {
    errorQuery = errorQuery.eq('tenant_id', filterTenant);
  }

  errorQuery = errorQuery.range(offset, offset + pageSize - 1);

  const { data: errors, count: totalErrors } = await errorQuery as { data: (ErrorRow & { tenant_id: string })[] | null; count: number | null };

  // Fetch tenant list for platform admin filter dropdown
  const allTenantsForFilter = isPlatformAdmin
    ? ((await admin.from('tenants').select('id, name').order('name')) as { data: { id: string; name: string }[] | null }).data ?? []
    : [];
  const tenantNameMap = Object.fromEntries(allTenantsForFilter.map((t) => [t.id, t.name]));

  // Fetch job filenames for display
  const jobIds = [...new Set((errors ?? []).map((e) => e.job_id))];
  let jobMap: Record<string, string> = {};
  if (jobIds.length) {
    const { data: jobs } = await admin
      .from('upload_jobs')
      .select('id, filename')
      .in('id', jobIds) as { data: JobMeta[] | null };
    jobMap = Object.fromEntries((jobs ?? []).map((j) => [j.id, j.filename]));
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Error Queue
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Row-level processing errors requiring attention
        </p>
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
        <input
          type="text"
          name="code"
          defaultValue={filterCode}
          placeholder="Error Code"
          style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: '#fff', color: 'var(--navy)', minWidth: 140 }}
        />
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
        <Link href="/errors" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Clear</Link>
      </form>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Open Errors</span>
          <span style={{ fontSize: 12, color: (totalErrors ?? 0) > 0 ? 'var(--error)' : 'var(--muted)' }}>
            {totalErrors ?? 0} error{(totalErrors ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[...(isPlatformAdmin ? ['Tenant'] : []), 'File', 'Row', 'Field', 'Error', 'When'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!errors?.length ? (
              <tr>
                <td colSpan={isPlatformAdmin ? 6 : 5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No errors.{' '}
                  <Link href="/uploads" style={{ color: 'var(--blue)' }}>Upload a file</Link> to process data.
                </td>
              </tr>
            ) : errors.map((err) => (
              <tr key={err.id}>
                {isPlatformAdmin && (
                  <td style={tdStyle}>
                    <Link href={`/platform/tenants/${(err as typeof err & { tenant_id: string }).tenant_id}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                      {tenantNameMap[(err as typeof err & { tenant_id: string }).tenant_id] ?? (err as typeof err & { tenant_id: string }).tenant_id?.slice(0, 8) + '…'}
                    </Link>
                  </td>
                )}
                <td style={tdStyle}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>
                    {jobMap[err.job_id] ?? 'Unknown file'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)' }}>
                    {err.job_id.slice(0, 8)}…
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', color: 'var(--muted)' }}>
                    {err.row_number != null ? `#${err.row_number}` : '—'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', color: 'var(--navy)' }}>
                    {err.field_name ?? '—'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontSize: 13, color: 'var(--error)' }}>{err.error_message}</div>
                  {err.error_code && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'var(--muted)', marginTop: 2 }}>{err.error_code}</div>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(err.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Suspense>
          <Pagination total={totalErrors ?? 0} page={page} pageSize={pageSize} />
        </Suspense>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle' };
