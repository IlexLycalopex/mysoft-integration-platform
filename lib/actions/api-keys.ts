'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveTenantId } from '@/lib/tenant-context'
import { createHash, randomBytes } from 'crypto'
import type { UserRole } from '@/types/database'

export type ApiKeyFormState = {
  success: boolean
  error?: string
  rawKey?: string  // only returned on create — shown once
  keyId?: string
}

export async function createApiKey(
  _prev: ApiKeyFormState,
  formData: FormData
): Promise<ApiKeyFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>()

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin']
  if (!profile || !allowed.includes(profile.role)) {
    return { success: false, error: 'You do not have permission to manage API keys' }
  }
  if (!profile.tenant_id) return { success: false, error: 'No tenant associated with your account' }

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id)
  if (!effectiveTenantId) return { success: false, error: 'No tenant context' }

  const name = formData.get('name') as string
  const expiresAt = formData.get('expires_at') as string | null

  if (!name?.trim()) return { success: false, error: 'Name is required' }

  // Generate key: mip_ + 40 random base64url chars
  const rawKey = 'mip_' + randomBytes(30).toString('base64url').slice(0, 40)
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 8)  // "mip_XXXX"

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_keys')
    .insert({
      tenant_id: effectiveTenantId,
      name: name.trim(),
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: user.id,
      expires_at: expiresAt || null,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to create key' }

  revalidatePath('/settings/api-keys')
  return { success: true, rawKey, keyId: data.id }
}

export async function revokeApiKey(keyId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>()

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin']
  if (!profile || !allowed.includes(profile.role)) {
    return { success: false, error: 'You do not have permission to revoke API keys' }
  }
  if (!profile.tenant_id) return { success: false, error: 'No tenant associated with your account' }

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id)
  if (!effectiveTenantId) return { success: false, error: 'No tenant context' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('tenant_id', effectiveTenantId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/api-keys')
  return { success: true }
}
