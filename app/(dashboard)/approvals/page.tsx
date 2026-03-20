import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';
import { ApproveButton, RejectButton } from '@/components/jobs/ApprovalButtons';

interface ApprovalJob {
  id: string;
  filename: string;
  storage_path: string;
  row_count: number | null;
  created_at: string;
  created_by: string | null;
  mapping_id: string | null;
  tenant_id: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowedRoles: UserRole[] = ['tenant_admin', 'platform_super_admin', 'mysoft_support_admin'];
  if (!profile || !allowedRoles.includes(profile.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);

  if (!isPlatformAdmin && !effectiveTenantId) redirect('/dashboard');

  let jobsQuery = admin
    .from('upload_jobs')
    .select('id, filename, storage_path, row_count, created_at, created_by, mapping_id, tenant_id')
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: true });

  if (!isPlatformAdmin) {
    jobsQuery = jobsQuery.eq('tenant_id', effectiveTenantId!);
  }

  const { data: jobs } = await jobsQuery as { data: ApprovalJob[] | null };

  // Build mapping name lookup
  const mappingIds = [...new Set((jobs ?? []).map((j) => j.mapping_id).filter(Boolean) as string[])];
  const mappingNames: Record<string, string> = {};
  if (mappingIds.length) {
    const { data: mappings } = await admin
      .from('field_mappings')
      .select('id, name')
      .in('id', mappingIds);
    for (const m of mappings ?? []) {
      mappingNames[m.id] = m.name;
    }
  }

  // Build user email lookup for submitted-by
  const userIds = [...new Set((jobs ?? []).map((j) => j.created_by).filter(Boolean) as string[])];
  const userEmails: Record<string, string> = {};
  for (const uid of userIds) {
    try {
      const { data: { user: u } } = await admin.auth.admin.getUserById(uid);
      if (u?.email) userEmails[uid] = u.email;
    } catch { /* ignore */ }
  }

  // Generate signed URLs for each job file
  const signedUrls: Record<string, string> = {};
  for (const job of jobs ?? []) {
    const { data: signedUrl } = await admin.storage
      .from('uploads')
      .createSignedUrl(job.storage_path, 3600);
    if (signedUrl?.signedUrl) signedUrls[job.id] = signedUrl.signedUrl;
  }

  const count = jobs?.length ?? 0;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Approval Queue
        </h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: count > 0 ? '#856404' : '#1A6B30', background: count > 0 ? '#FFF3CD' : '#E6F7ED', border: `1px solid ${count > 0 ? '#FFECB5' : '#A3D9B1'}`, borderRadius: 20, padding: '2px 10px' }}>
          {count}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -16, marginBottom: 24 }}>
        Jobs waiting for admin approval before submission to Intacct
      </p>

      {count === 0 ? (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 8, padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A6B30', marginBottom: 4 }}>No jobs waiting for approval</div>
          <div style={{ fontSize: 13, color: '#6B8599' }}>All uploaded jobs have been reviewed.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs!.map((job) => (
            <div key={job.id} style={{ background: 'var(--surface)', border: '1px solid #FFECB5', borderRadius: 8, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <Link href={`/jobs/${job.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', textDecoration: 'none' }}>
                      {job.filename}
                    </Link>
                    {signedUrls[job.id] && (
                      <a
                        href={signedUrls[job.id]}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px' }}
                      >
                        Download
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Uploaded by <strong style={{ color: 'var(--navy)' }}>{job.created_by ? (userEmails[job.created_by] ?? job.created_by) : 'unknown'}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {relativeTime(job.created_at)}
                    </span>
                    {job.mapping_id && mappingNames[job.mapping_id] && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Mapping: <strong style={{ color: 'var(--navy)' }}>{mappingNames[job.mapping_id]}</strong>
                      </span>
                    )}
                    {job.row_count != null && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {job.row_count} row{job.row_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <ApproveButton jobId={job.id} />
                  <RejectButton jobId={job.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
