'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export interface PlatformSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

/** Fetch all platform settings as a key→value map */
export async function getPlatformSettings(): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('platform_settings')
    .select('key, value');
  if (error) {
    console.error('[platform-settings] fetch error', error);
    return {};
  }
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
}

/** Update a single setting. Returns null on success or an error string. */
export async function updatePlatformSetting(
  key: string,
  value: unknown,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not authenticated';

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();
  if (profile?.role !== 'platform_super_admin') return 'Forbidden';

  const admin = createAdminClient();
  const { error } = await admin
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user.id });

  if (error) {
    console.error('[platform-settings] update error', error);
    return error.message;
  }
  return null;
}

/** Update multiple settings at once */
export async function updatePlatformSettings(
  updates: Record<string, unknown>,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not authenticated';

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();
  if (profile?.role !== 'platform_super_admin') return 'Forbidden';

  const admin = createAdminClient();
  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }));

  const { error } = await admin
    .from('platform_settings')
    .upsert(rows);

  if (error) {
    console.error('[platform-settings] bulk update error', error);
    return error.message;
  }
  return null;
}
