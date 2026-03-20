import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  // Session auth only (not API key)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canReprocess: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !canReprocess.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  // Fetch original job
  const { data: originalJob, error: jobErr } = await admin
    .from('upload_jobs')
    .select('id, tenant_id, storage_path, mapping_id, filename, file_size, source_type, status')
    .eq('id', jobId)
    .single<{
      id: string;
      tenant_id: string;
      storage_path: string;
      mapping_id: string | null;
      filename: string;
      file_size: number | null;
      source_type: 'manual' | 'agent' | 'sftp_poll' | null;
      status: string;
    }>();

  if (jobErr || !originalJob) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Verify tenant ownership
  if (!isPlatformAdmin && originalJob.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Cannot reprocess a currently running job
  if (originalJob.status === 'processing') {
    return NextResponse.json({ error: 'Cannot reprocess a job that is currently processing' }, { status: 409 });
  }

  // Read dryRun from query param
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  // Create new job row
  const { data: newJob, error: insertError } = await admin
    .from('upload_jobs')
    .insert({
      tenant_id: originalJob.tenant_id,
      storage_path: originalJob.storage_path,
      mapping_id: originalJob.mapping_id,
      filename: originalJob.filename,
      file_size: originalJob.file_size,
      source_type: originalJob.source_type,
      status: 'pending',
      created_by: user.id,
      auto_process: true,
      dry_run: dryRun,
      sha256: null,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError || !newJob) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create reprocess job' }, { status: 500 });
  }

  // Trigger processing as a separate serverless function invocation (fire-and-forget)
  const processUrl = new URL(`/api/jobs/${newJob.id}/process`, req.url);
  fetch(processUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Forward the session cookie header so the process endpoint can validate the user
      'Cookie': req.headers.get('cookie') ?? '',
    },
  }).catch(() => {}); // fire-and-forget

  return NextResponse.json({ jobId: newJob.id });
}
