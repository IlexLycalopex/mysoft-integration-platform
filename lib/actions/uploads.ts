'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import type { UserRole } from '@/types/database';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'awaiting_approval';

export type SourceType = 'manual' | 'agent' | 'sftp_poll';

export interface UploadJobRow {
  id: string;
  filename: string;
  storage_path: string;
  file_size: number | null;
  status: JobStatus;
  source_type: SourceType;
  row_count: number | null;
  processed_count: number;
  error_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
}

export type CreateJobState = { error?: string; jobId?: string };

/**
 * Called after the browser has finished uploading a file to Supabase Storage.
 * Creates the upload_jobs record and returns the job ID.
 */
export async function createUploadJob(
  _prev: CreateJobState,
  formData: FormData
): Promise<CreateJobState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id, allowed_entity_ids')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null; allowed_entity_ids: string[] | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !allowed.includes(profile.role)) {
    return { error: 'You do not have permission to upload files' };
  }
  if (!profile.tenant_id) return { error: 'No tenant associated with your account' };

  const storagePath = formData.get('storagePath') as string;
  const filename = formData.get('filename') as string;
  const fileSize = Number(formData.get('fileSize') ?? 0) || null;
  const mimeType = (formData.get('mimeType') as string) || null;
  const entityIdOverride = (formData.get('entityIdOverride') as string | null)?.trim() || null;

  // Optional supporting document (attachment)
  const attachmentStoragePath = (formData.get('attachmentStoragePath') as string | null) || null;
  const attachmentFilename    = (formData.get('attachmentFilename') as string | null) || null;
  const attachmentMimeType    = (formData.get('attachmentMimeType') as string | null) || null;
  const attachmentFileSize    = Number(formData.get('attachmentFileSize') ?? 0) || null;
  const supdocFolderName      = (formData.get('supdocFolderName') as string | null)?.trim() || 'Mysoft Imports';

  if (!storagePath || !filename) return { error: 'Missing file information' };

  // Per-user entity restriction — check BEFORE creating the job
  if (profile.allowed_entity_ids && profile.allowed_entity_ids.length > 0) {
    if (!entityIdOverride) {
      return {
        error: 'Your account is restricted to specific Intacct entities. Please select an entity before uploading.',
      };
    }
    if (!profile.allowed_entity_ids.includes(entityIdOverride)) {
      return {
        error: `Your account is not permitted to upload to entity "${entityIdOverride}". Contact your administrator.`,
      };
    }
  }

  const admin = createAdminClient();

  // Check if this tenant requires approval for uploads
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', profile.tenant_id)
    .single<{ settings: Record<string, unknown> }>();
  const requiresApproval = tenantRow?.settings?.approval_required === 'true';

  const { data: job, error } = await admin
    .from('upload_jobs')
    .insert({
      tenant_id: profile.tenant_id,
      created_by: user.id,
      filename,
      storage_path: storagePath,
      file_size: fileSize,
      mime_type: mimeType,
      status: 'pending',
      requires_approval: requiresApproval,
      ...(entityIdOverride         ? { entity_id_override: entityIdOverride }                 : {}),
      ...(attachmentStoragePath    ? { attachment_storage_path: attachmentStoragePath }        : {}),
      ...(attachmentFilename       ? { attachment_filename: attachmentFilename }               : {}),
      ...(attachmentMimeType       ? { attachment_mime_type: attachmentMimeType }              : {}),
      ...(attachmentFileSize       ? { attachment_file_size: attachmentFileSize }              : {}),
      supdoc_folder_name: supdocFolderName,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: profile.tenant_id,
    operation: 'create_upload_job',
    resourceType: 'upload_job',
    resourceId: job.id,
    newValues: { filename, file_size: fileSize },
  });

  revalidatePath('/uploads');
  revalidatePath('/jobs');
  return { jobId: job.id };
}

export async function retryJob(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !allowed.includes(profile.role)) return { error: 'Permission denied' };

  const admin = createAdminClient();
  let query = admin
    .from('upload_jobs')
    .update({ status: 'pending', error_message: null, started_at: null, completed_at: null, processed_count: 0, error_count: 0 })
    .eq('id', jobId)
    .eq('status', 'failed');

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    query = query.eq('tenant_id', profile.tenant_id ?? '');
  }

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath('/jobs');
  return {};
}

export async function cancelJob(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !allowed.includes(profile.role)) return { error: 'Permission denied' };

  const admin = createAdminClient();
  let query = admin
    .from('upload_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .eq('status', 'pending');

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    query = query.eq('tenant_id', profile.tenant_id ?? '');
  }

  const { error } = await query;
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: profile.tenant_id,
    operation: 'cancel_upload_job',
    resourceType: 'upload_job',
    resourceId: jobId,
  });

  revalidatePath('/jobs');
  return {};
}

export async function forceKillJob(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) return { error: 'Permission denied' };

  const admin = createAdminClient();
  let query = admin
    .from('upload_jobs')
    .update({
      status: 'failed',
      error_message: 'Force-cancelled — job was stuck in processing',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing'); // safety: only resets genuinely stuck jobs

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    query = query.eq('tenant_id', profile.tenant_id ?? '');
  }

  const { error } = await query;
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: profile.tenant_id,
    operation: 'force_kill_job',
    resourceType: 'upload_job',
    resourceId: jobId,
  });

  revalidatePath('/jobs');
  return {};
}

export async function deleteJob(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !allowed.includes(profile.role)) return { error: 'Permission denied' };

  const admin = createAdminClient();

  // Fetch the job to get storage_path — also enforces tenant scoping
  let fetchQuery = admin
    .from('upload_jobs')
    .select('id, storage_path, filename, status')
    .eq('id', jobId)
    .in('status', ['completed', 'failed', 'cancelled']);

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    fetchQuery = fetchQuery.eq('tenant_id', profile.tenant_id ?? '');
  }

  const { data: job, error: fetchErr } = await fetchQuery.single<{ id: string; storage_path: string; filename: string; status: string }>();
  if (fetchErr || !job) return { error: 'Job not found or cannot be deleted while active' };

  // Delete storage file
  await admin.storage.from('uploads').remove([job.storage_path]);

  // Delete child errors then the job itself
  await admin.from('job_errors').delete().eq('job_id', jobId);
  const { error: delErr } = await admin.from('upload_jobs').delete().eq('id', jobId);
  if (delErr) return { error: delErr.message };

  await logAudit({
    userId: user.id,
    tenantId: profile.tenant_id,
    operation: 'delete_upload_job',
    resourceType: 'upload_job',
    resourceId: jobId,
    newValues: { filename: job.filename, status: job.status },
  });

  revalidatePath('/jobs');
  revalidatePath('/uploads');
  return {};
}
