'use server';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

/**
 * Resolved auth context for the current request.
 * Returned by getAuthContext() when authentication and role checks pass.
 */
export interface AuthContext {
  userId: string;
  userEmail: string | null;
  role: UserRole;
  tenantId: string | null;
}

/**
 * Resolves the current user's session and profile in a single call.
 *
 * Returns null if:
 *   - The session is missing or invalid
 *   - No matching user_profile row exists
 *   - The user's role is not in `allowedRoles` (when provided)
 *
 * Usage:
 *   const ctx = await getAuthContext(['platform_super_admin']);
 *   if (!ctx) return { error: 'Access denied' };
 *
 *   // ctx.userId, ctx.userEmail, ctx.role, ctx.tenantId are all available
 */
export async function getAuthContext(
  allowedRoles?: UserRole[],
): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) return null;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return null;

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    role: profile.role,
    tenantId: profile.tenant_id,
  };
}
