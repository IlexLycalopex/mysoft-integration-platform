'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import { EMULATION_COOKIE, type EmulationContext } from '@/lib/emulation';

/**
 * Platform super admin only — starts an emulation session as the given tenant user.
 * Sets an httpOnly cookie and redirects to /dashboard in the tenant's context.
 */
export async function startEmulation(targetUserId: string, tenantId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') redirect('/platform');

  const admin = createAdminClient();

  const [profileResult, tenantResult] = await Promise.all([
    admin.from('user_profiles').select('first_name, last_name, role').eq('id', targetUserId).single<{ first_name: string | null; last_name: string | null; role: string }>(),
    admin.from('tenants').select('name').eq('id', tenantId).single<{ name: string }>(),
  ]);

  const p = profileResult.data;
  const t = tenantResult.data;

  const userName = p?.first_name && p?.last_name
    ? `${p.first_name} ${p.last_name}`
    : targetUserId.slice(0, 8) + '…';

  const ctx: EmulationContext = {
    tenant_id: tenantId,
    user_id: targetUserId,
    user_name: userName,
    user_role: p?.role ?? 'tenant_operator',
    tenant_name: t?.name ?? tenantId,
    started_at: new Date().toISOString(),
    started_by: user.id,
  };

  const cookieStore = await cookies();
  cookieStore.set(EMULATION_COOKIE, JSON.stringify(ctx), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });

  await logAudit({
    userId: user.id,
    tenantId,
    operation: 'emulation_started',
    resourceType: 'user',
    resourceId: targetUserId,
    newValues: { emulated_user: userName, tenant_id: tenantId, tenant_name: t?.name ?? tenantId },
  });

  redirect('/dashboard');
}

/**
 * Ends the current emulation session — clears the cookie and redirects back
 * to the tenant detail page on the platform admin side.
 */
export async function stopEmulationAction(tenantId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  cookieStore.delete(EMULATION_COOKIE);

  if (user) {
    await logAudit({
      userId: user.id,
      tenantId,
      operation: 'emulation_stopped',
      resourceType: 'tenant',
      resourceId: tenantId,
      newValues: { tenant_id: tenantId },
    });
  }

  redirect(`/platform/tenants/${tenantId}`);
}
