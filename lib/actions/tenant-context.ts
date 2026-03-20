'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { TENANT_CTX_COOKIE } from '@/lib/tenant-context';

export async function switchTenantContext(
  targetTenantId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single<{ tenant_id: string | null }>();

  if (!profile?.tenant_id) return { error: 'No tenant associated with account' };

  const cookieStore = await cookies();

  // Switching back to production
  if (targetTenantId === profile.tenant_id) {
    cookieStore.delete(TENANT_CTX_COOKIE);
    return {};
  }

  // Switching to sandbox — validate the target is a linked sandbox
  const { data: sandbox } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', targetTenantId)
    .eq('sandbox_of', profile.tenant_id)
    .eq('is_sandbox', true)
    .maybeSingle();

  if (!sandbox) return { error: 'Invalid context: not a linked sandbox tenant' };

  cookieStore.set(TENANT_CTX_COOKIE, targetTenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return {};
}
