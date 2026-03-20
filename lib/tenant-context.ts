import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getEmulationContext } from '@/lib/emulation';

export const TENANT_CTX_COOKIE = 'mip-tenant-ctx';

/**
 * Returns the effective tenant ID for the current request.
 * If the user has switched to their sandbox context (via cookie), returns the
 * sandbox tenant ID. Falls back to the production tenant ID from their profile.
 *
 * For platform admins (no tenant of their own): if an emulation session is active,
 * returns the emulated tenant's ID with isEmulating=true.
 */
export async function getEffectiveTenantId(
  profileTenantId: string | null,
  userRole?: string | null
): Promise<{ tenantId: string | null; isSandbox: boolean; isEmulating: boolean }> {
  if (!profileTenantId) {
    // Platform admins may have an active emulation session
    if (userRole && ['platform_super_admin', 'mysoft_support_admin'].includes(userRole)) {
      const emulationCtx = await getEmulationContext();
      if (emulationCtx) {
        return { tenantId: emulationCtx.tenant_id, isSandbox: false, isEmulating: true };
      }
    }
    return { tenantId: null, isSandbox: false, isEmulating: false };
  }

  const cookieStore = await cookies();
  const override = cookieStore.get(TENANT_CTX_COOKIE)?.value;

  if (!override || override === profileTenantId) {
    return { tenantId: profileTenantId, isSandbox: false, isEmulating: false };
  }

  // Validate the override is a sandbox tenant linked to this production tenant
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', override)
    .eq('sandbox_of', profileTenantId)
    .eq('is_sandbox', true)
    .maybeSingle();

  if (data) return { tenantId: override, isSandbox: true, isEmulating: false };

  // Cookie is stale/invalid — silently fall back to production
  return { tenantId: profileTenantId, isSandbox: false, isEmulating: false };
}
