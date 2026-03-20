'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { PlanRow } from './usage';

export type PlanActionState = {
  error?: string;
  success?: boolean;
};

async function requireSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();
  return profile?.role === 'platform_super_admin';
}

export async function listAllPlans(): Promise<PlanRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plans')
    .select('*')
    .order('sort_order');
  return (data as PlanRow[] | null) ?? [];
}

export async function createPlan(
  _prev: PlanActionState,
  formData: FormData
): Promise<PlanActionState> {
  if (!(await requireSuperAdmin())) return { error: 'Super admin access required' };

  const id = (formData.get('id') as string ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const name = (formData.get('name') as string ?? '').trim();
  if (!id || !name) return { error: 'ID and Name are required' };

  const admin = createAdminClient();
  const toNum = (key: string) => { const v = formData.get(key); return v && String(v).trim() !== '' ? Number(v) : null; };
  const { error } = await admin.from('plans').insert({
    id,
    name,
    description: (formData.get('description') as string) || null,
    max_jobs_per_month: toNum('max_jobs'),
    max_rows_per_month: toNum('max_rows'),
    max_storage_mb: toNum('max_storage_mb'),
    max_watchers: toNum('max_watchers'),
    max_api_keys: toNum('max_api_keys'),
    max_users: toNum('max_users'),
    price_gbp_monthly: toNum('price'),
    features: formData.getAll('features').map(v => String(v).trim()).filter(Boolean),
    is_active: formData.get('is_active') === 'true',
    sort_order: Number(formData.get('sort_order') ?? 99),
  });

  if (error) return { error: error.message };
  revalidatePath('/platform/plans');
  return { success: true };
}

export async function updatePlan(
  planId: string,
  _prev: PlanActionState,
  formData: FormData
): Promise<PlanActionState> {
  if (!(await requireSuperAdmin())) return { error: 'Super admin access required' };

  const admin = createAdminClient();
  const toNum = (key: string) => { const v = formData.get(key); return v && String(v).trim() !== '' ? Number(v) : null; };
  const { error } = await admin.from('plans').update({
    name: (formData.get('name') as string ?? '').trim(),
    description: (formData.get('description') as string) || null,
    max_jobs_per_month: toNum('max_jobs'),
    max_rows_per_month: toNum('max_rows'),
    max_storage_mb: toNum('max_storage_mb'),
    max_watchers: toNum('max_watchers'),
    max_api_keys: toNum('max_api_keys'),
    max_users: toNum('max_users'),
    price_gbp_monthly: toNum('price'),
    features: formData.getAll('features').map(v => String(v).trim()).filter(Boolean),
    is_active: formData.get('is_active') === 'true',
    sort_order: Number(formData.get('sort_order') ?? 99),
  }).eq('id', planId);

  if (error) return { error: error.message };
  revalidatePath('/platform/plans');
  revalidatePath(`/platform/plans/${planId}/edit`);
  return { success: true };
}
