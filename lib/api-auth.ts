import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

export type AuthedApiContext = {
  tenantId: string
  keyId: string
}

/**
 * Validates a Bearer API key from the Authorization header.
 * Updates last_used_at on success.
 * Returns null if invalid/revoked/expired.
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<AuthedApiContext | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const rawKey = authHeader.slice(7).trim()
  if (!rawKey.startsWith('mip_')) return null

  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const supabase = createAdminClient()

  const { data: key } = await supabase
    .from('api_keys')
    .select('id, tenant_id, revoked_at, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (!key) return null
  if (key.revoked_at) return null
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null

  // Update last_used_at (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {})

  return { tenantId: key.tenant_id, keyId: key.id }
}
