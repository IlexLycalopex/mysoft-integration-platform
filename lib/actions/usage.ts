'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  max_jobs_per_month: number | null;
  max_rows_per_month: number | null;
  max_storage_mb: number | null;
  max_watchers: number | null;
  max_api_keys: number | null;
  max_users: number | null;
  price_gbp_monthly: number | null;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface UsageSnapshot {
  id: string;
  tenant_id: string;
  year_month: string;
  jobs_count: number;
  rows_processed: number;
  storage_bytes: number;
  computed_at: string;
}

export interface TenantUsageData {
  snapshot: UsageSnapshot | null;
  plan: PlanRow | null;
  history: UsageSnapshot[];
}

export type UsageActionState = {
  error?: string;
  success?: boolean;
};

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Get current month usage + plan limits for a tenant.
 * Uses RLS client — caller must be platform admin or member of the tenant.
 */
export async function getUsageForTenant(tenantId: string): Promise<TenantUsageData> {
  const supabase = await createClient();
  const yearMonth = currentYearMonth();

  // Fetch tenant's plan_id
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('plan_id')
    .eq('id', tenantId)
    .single<{ plan_id: string | null }>();

  const planId = tenantRow?.plan_id ?? 'free';

  // Fetch plan details (plans are public read — no RLS needed, use admin for simplicity)
  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single<PlanRow>();

  // Fetch current month snapshot
  const { data: snapshot } = await supabase
    .from('tenant_usage_monthly')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('year_month', yearMonth)
    .maybeSingle<UsageSnapshot>();

  // Fetch last 6 months history
  const { data: historyRows } = await supabase
    .from('tenant_usage_monthly')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year_month', { ascending: false })
    .limit(6);

  return {
    snapshot: snapshot ?? null,
    plan: plan ?? null,
    history: (historyRows as UsageSnapshot[] | null) ?? [],
  };
}

/**
 * Platform admin only — changes a tenant's plan.
 */
export async function updateTenantPlan(
  tenantId: string,
  _prev: UsageActionState,
  formData: FormData
): Promise<UsageActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { error: 'Platform admin access required' };
  }

  const planId = formData.get('plan_id') as string;
  if (!planId) return { error: 'plan_id is required' };

  const admin = createAdminClient();

  // Verify plan exists
  const { data: plan } = await admin
    .from('plans')
    .select('id')
    .eq('id', planId)
    .single<{ id: string }>();

  if (!plan) return { error: `Plan '${planId}' does not exist` };

  const { error } = await admin
    .from('tenants')
    .update({
      plan_id: planId,
      plan_assigned_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/usage`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}

/**
 * Recomputes and upserts the current month usage row for a tenant.
 * Safe to call from cron — uses admin client, no auth required.
 */
export async function refreshUsageSnapshot(tenantId: string): Promise<UsageSnapshot | null> {
  const admin = createAdminClient();
  const yearMonth = currentYearMonth();

  const monthStart = `${yearMonth}-01`;
  // First day of next month
  const [y, m] = yearMonth.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  // Count jobs for this tenant in current month
  const { data: jobRows } = await admin
    .from('upload_jobs')
    .select('row_count, file_size, status')
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart)
    .lt('created_at', nextMonth);

  const jobs = jobRows ?? [];
  const jobs_count = jobs.length;
  const rows_processed = jobs
    .filter((j) => j.status === 'completed' || j.status === 'completed_with_errors')
    .reduce((sum, j) => sum + (j.row_count ?? 0), 0);
  const storage_bytes = jobs.reduce((sum, j) => sum + (j.file_size ?? 0), 0);

  const { data: upserted, error } = await admin
    .from('tenant_usage_monthly')
    .upsert(
      {
        tenant_id: tenantId,
        year_month: yearMonth,
        jobs_count,
        rows_processed,
        storage_bytes,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,year_month' }
    )
    .select('*')
    .single<UsageSnapshot>();

  if (error) {
    console.error('[refreshUsageSnapshot] error', error);
    return null;
  }

  return upserted;
}

/**
 * Returns all active plans (for the change-plan dropdown).
 */
export async function listPlans(): Promise<PlanRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return (data as PlanRow[] | null) ?? [];
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  metric?: string;
  used?: number;
  limit?: number;
}

/**
 * Check whether a tenant is within their plan limits before processing a job.
 * Returns { allowed: true } if OK, or { allowed: false, reason, metric } if over.
 */
export async function checkUsageLimits(tenantId: string): Promise<UsageCheckResult> {
  const admin = createAdminClient();
  const yearMonth = currentYearMonth();

  // Get plan limits
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('plan_id')
    .eq('id', tenantId)
    .single<{ plan_id: string | null }>();

  const planId = tenantRow?.plan_id ?? 'free';

  const { data: plan } = await admin
    .from('plans')
    .select('max_jobs_per_month, max_rows_per_month, max_storage_mb')
    .eq('id', planId)
    .single<{ max_jobs_per_month: number | null; max_rows_per_month: number | null; max_storage_mb: number | null }>();

  if (!plan) return { allowed: true }; // no plan data = allow

  // All null limits = unlimited
  if (!plan.max_jobs_per_month && !plan.max_rows_per_month && !plan.max_storage_mb) {
    return { allowed: true };
  }

  // Get current month snapshot (or compute inline)
  const { data: snapshot } = await admin
    .from('tenant_usage_monthly')
    .select('jobs_count, rows_processed, storage_bytes')
    .eq('tenant_id', tenantId)
    .eq('year_month', yearMonth)
    .maybeSingle<{ jobs_count: number; rows_processed: number; storage_bytes: number }>();

  const jobsUsed = snapshot?.jobs_count ?? 0;
  const storageUsedMb = Math.round((snapshot?.storage_bytes ?? 0) / (1024 * 1024));

  if (plan.max_jobs_per_month && jobsUsed >= plan.max_jobs_per_month) {
    return {
      allowed: false,
      reason: `Monthly job limit reached (${jobsUsed}/${plan.max_jobs_per_month} jobs used this month). Please contact support to upgrade your plan.`,
      metric: 'jobs',
      used: jobsUsed,
      limit: plan.max_jobs_per_month,
    };
  }

  if (plan.max_storage_mb && storageUsedMb >= plan.max_storage_mb) {
    return {
      allowed: false,
      reason: `Monthly storage limit reached (${storageUsedMb}/${plan.max_storage_mb} MB used this month). Please contact support to upgrade your plan.`,
      metric: 'storage',
      used: storageUsedMb,
      limit: plan.max_storage_mb,
    };
  }

  return { allowed: true };
}

/**
 * Fetch the feature flags array for a tenant's current plan.
 * Returns an empty array if the tenant has no plan or the plan has no features.
 */
export async function getTenantPlanFeatures(tenantId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('plan_id')
    .eq('id', tenantId)
    .single<{ plan_id: string | null }>();

  if (!tenantRow?.plan_id) return [];

  const { data: plan } = await admin
    .from('plans')
    .select('features')
    .eq('id', tenantRow.plan_id)
    .single<{ features: string[] | null }>();

  return plan?.features ?? [];
}
