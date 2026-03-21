'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import { getEffectiveTenantId } from '@/lib/tenant-context'
import { getAuthContext } from '@/lib/actions/auth-context'
import { logAudit } from '@/lib/actions/audit'

export type WatcherFormState = {
  success: boolean
  error?: string
  watcherId?: string
}

export type WatcherConfig = {
  id: string
  tenant_id: string
  name: string
  source_type: 'local_folder' | 'sftp' | 'http_push'
  folder_path: string | null
  sftp_host: string | null
  sftp_port: number | null
  sftp_username: string | null
  sftp_password_enc: string | null
  sftp_remote_path: string | null
  push_token: string | null
  last_polled_at: string | null
  file_pattern: string
  mapping_id: string | null
  archive_action: 'move' | 'delete' | 'leave'
  archive_folder: string | null
  poll_interval: number
  auto_process: boolean
  enabled: boolean
  entity_id_override: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

async function getWatcherAuthContext(): Promise<
  | { ok: true; effectiveTenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const ctx = await getAuthContext(['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'])
  if (!ctx) return { ok: false, error: 'You do not have permission to manage watchers' }
  if (!ctx.tenantId) return { ok: false, error: 'No tenant associated with your account' }

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(ctx.tenantId)
  if (!effectiveTenantId) return { ok: false, error: 'No tenant context' }

  return { ok: true, effectiveTenantId, userId: ctx.userId }
}

function parseWatcherFormData(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const source_type = formData.get('source_type') as 'local_folder' | 'sftp' | 'http_push'
  const folder_path = (formData.get('folder_path') as string | null)?.trim() || null
  const sftp_host = (formData.get('sftp_host') as string | null)?.trim() || null
  const sftp_port_raw = formData.get('sftp_port') as string | null
  const sftp_port = sftp_port_raw ? parseInt(sftp_port_raw, 10) : null
  const sftp_username = (formData.get('sftp_username') as string | null)?.trim() || null
  const sftp_password = formData.get('sftp_password') as string | null
  const sftp_remote_path = (formData.get('sftp_remote_path') as string | null)?.trim() || null
  const file_pattern = (formData.get('file_pattern') as string)?.trim() || '*.csv'
  const mapping_id = (formData.get('mapping_id') as string | null)?.trim() || null
  const archive_action = (formData.get('archive_action') as 'move' | 'delete' | 'leave') || 'leave'
  const archive_folder = (formData.get('archive_folder') as string | null)?.trim() || null
  const poll_interval_raw = formData.get('poll_interval') as string | null
  const poll_interval = poll_interval_raw ? parseInt(poll_interval_raw, 10) : 300
  const auto_process = formData.get('auto_process') === 'on' || formData.get('auto_process') === 'true'
  const entity_id_override = (formData.get('entity_id_override') as string | null)?.trim() || null

  return {
    name, source_type, folder_path, sftp_host, sftp_port, sftp_username,
    sftp_password, sftp_remote_path, file_pattern, mapping_id,
    archive_action, archive_folder, poll_interval, auto_process, entity_id_override,
  }
}

function validateWatcherFields(fields: ReturnType<typeof parseWatcherFormData>): string | null {
  if (!fields.name) return 'Name is required'
  if (!fields.source_type) return 'Source type is required'
  if (fields.source_type === 'local_folder' && !fields.folder_path) return 'Folder path is required for local folder watchers'
  if (fields.source_type === 'sftp') {
    if (!fields.sftp_host) return 'SFTP host is required'
    if (!fields.sftp_username) return 'SFTP username is required'
    if (!fields.sftp_remote_path) return 'SFTP remote path is required'
  }
  if (fields.source_type === 'local_folder' && fields.archive_action === 'move' && !fields.archive_folder) {
    return 'Archive folder is required when archive action is Move'
  }
  return null
}

export async function createWatcher(
  _prev: WatcherFormState,
  formData: FormData
): Promise<WatcherFormState> {
  const auth = await getWatcherAuthContext()
  if (!auth.ok) return { success: false, error: auth.error }

  const fields = parseWatcherFormData(formData)
  const validationError = validateWatcherFields(fields)
  if (validationError) return { success: false, error: validationError }

  let sftp_password_enc: string | null = null
  if (fields.source_type === 'sftp' && fields.sftp_password) {
    try {
      const blob = encrypt(fields.sftp_password)
      sftp_password_enc = JSON.stringify(blob)
    } catch {
      return { success: false, error: 'Encryption key is not configured. Contact your administrator.' }
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('watcher_configs')
    .insert({
      tenant_id: auth.effectiveTenantId,
      name: fields.name,
      source_type: fields.source_type,
      folder_path: fields.folder_path,
      sftp_host: fields.sftp_host,
      sftp_port: fields.sftp_port,
      sftp_username: fields.sftp_username,
      sftp_password_enc,
      sftp_remote_path: fields.sftp_remote_path,
      file_pattern: fields.file_pattern,
      mapping_id: fields.mapping_id,
      archive_action: fields.archive_action,
      archive_folder: fields.archive_folder,
      poll_interval: fields.poll_interval,
      auto_process: fields.auto_process,
      entity_id_override: fields.entity_id_override,
      enabled: true,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create watcher' }

  await logAudit({
    userId: auth.userId,
    tenantId: auth.effectiveTenantId,
    operation: 'create_watcher',
    resourceType: 'watcher_config',
    resourceId: data.id,
    newValues: { name: fields.name, source_type: fields.source_type },
  })

  revalidatePath('/settings/watchers')
  // Redirect to edit page for HTTP push so the push URL is immediately visible;
  // otherwise return to the watchers list.
  if (fields.source_type === 'http_push') {
    redirect(`/settings/watchers/${data.id}/edit`)
  }
  redirect('/settings/watchers')
}

export async function updateWatcher(
  watcherId: string,
  _prev: WatcherFormState,
  formData: FormData
): Promise<WatcherFormState> {
  const auth = await getWatcherAuthContext()
  if (!auth.ok) return { success: false, error: auth.error }

  const fields = parseWatcherFormData(formData)
  const validationError = validateWatcherFields(fields)
  if (validationError) return { success: false, error: validationError }

  const admin = createAdminClient()

  // Verify ownership
  const { data: existing } = await admin
    .from('watcher_configs')
    .select('id, sftp_password_enc')
    .eq('id', watcherId)
    .eq('tenant_id', auth.effectiveTenantId)
    .single<{ id: string; sftp_password_enc: string | null }>()

  if (!existing) return { success: false, error: 'Watcher not found or access denied' }

  // For SFTP password: only re-encrypt if a new password was submitted
  let sftp_password_enc: string | null = existing.sftp_password_enc
  if (fields.source_type === 'sftp' && fields.sftp_password) {
    try {
      const blob = encrypt(fields.sftp_password)
      sftp_password_enc = JSON.stringify(blob)
    } catch {
      return { success: false, error: 'Encryption key is not configured. Contact your administrator.' }
    }
  } else if (fields.source_type !== 'sftp') {
    sftp_password_enc = null
  }

  const { error } = await admin
    .from('watcher_configs')
    .update({
      name: fields.name,
      source_type: fields.source_type,
      folder_path: fields.folder_path,
      sftp_host: fields.sftp_host,
      sftp_port: fields.sftp_port,
      sftp_username: fields.sftp_username,
      sftp_password_enc,
      sftp_remote_path: fields.sftp_remote_path,
      file_pattern: fields.file_pattern,
      mapping_id: fields.mapping_id,
      archive_action: fields.archive_action,
      archive_folder: fields.archive_folder,
      poll_interval: fields.poll_interval,
      auto_process: fields.auto_process,
      entity_id_override: fields.entity_id_override,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watcherId)
    .eq('tenant_id', auth.effectiveTenantId)

  if (error) return { success: false, error: error.message }

  await logAudit({
    userId: auth.userId,
    tenantId: auth.effectiveTenantId,
    operation: 'update_watcher',
    resourceType: 'watcher_config',
    resourceId: watcherId,
    newValues: { name: fields.name, source_type: fields.source_type },
  })

  revalidatePath('/settings/watchers')
  redirect('/settings/watchers')
}

export async function deleteWatcher(watcherId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await getWatcherAuthContext()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = createAdminClient()

  // Soft-delete: set archived_at + disable rather than hard-delete.
  // Hard-delete fails when upload_jobs reference this watcher via FK.
  // Archived watchers are hidden from the UI but preserved for audit/FK integrity.
  const { error } = await admin
    .from('watcher_configs')
    .update({
      archived_at: new Date().toISOString(),
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watcherId)
    .eq('tenant_id', auth.effectiveTenantId)
    .is('archived_at', null) // idempotency guard — don't re-archive

  if (error) return { success: false, error: error.message }

  await logAudit({
    userId: auth.userId,
    tenantId: auth.effectiveTenantId,
    operation: 'archive_watcher',
    resourceType: 'watcher_config',
    resourceId: watcherId,
  })

  revalidatePath('/settings/watchers')
  return { success: true }
}

export async function toggleWatcher(
  watcherId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await getWatcherAuthContext()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from('watcher_configs')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', watcherId)
    .eq('tenant_id', auth.effectiveTenantId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/watchers')
  return { success: true }
}
