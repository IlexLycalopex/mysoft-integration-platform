import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/cron-auth';

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const admin = createAdminClient();
  let deleted = 0;

  // 1 — fetch all tenants with their retention setting
  const { data: tenants, error: tenantsErr } = await admin
    .from('tenants')
    .select('id, file_retention_days')
    .eq('status', 'active');

  if (tenantsErr || !tenants) {
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }

  for (const tenant of tenants) {
    const retentionDays = tenant.file_retention_days ?? 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    // 2 — find eligible jobs for this tenant
    const { data: jobs } = await admin
      .from('upload_jobs')
      .select('id, storage_path')
      .eq('tenant_id', tenant.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .in('status', ['completed', 'completed_with_errors', 'failed'] as any[])
      .is('file_deleted_at', null)
      .lt('completed_at', cutoff);

    if (!jobs || jobs.length === 0) continue;

    for (const job of jobs) {
      try {
        // 3 — delete the file from storage
        if (job.storage_path) {
          await admin.storage.from('uploads').remove([job.storage_path]);
        }

        // 4 — mark as deleted
        await admin
          .from('upload_jobs')
          .update({ file_deleted_at: new Date().toISOString() })
          .eq('id', job.id);

        deleted++;
      } catch {
        // Non-fatal — continue with other jobs
      }
    }
  }

  // 5 — return result
  return NextResponse.json({ ok: true, deleted });
}
