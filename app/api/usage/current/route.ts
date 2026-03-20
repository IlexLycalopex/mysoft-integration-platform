import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);
  if (!effectiveTenantId) return NextResponse.json({ rowsUsed: 0, rowLimit: null });

  const admin = createAdminClient();
  const yearMonth = currentYearMonth();

  // Get plan limits
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('plan_id')
    .eq('id', effectiveTenantId)
    .single<{ plan_id: string | null }>();

  let rowLimit: number | null = null;

  if (tenantRow?.plan_id) {
    const { data: plan } = await admin
      .from('plans')
      .select('max_rows_per_month')
      .eq('id', tenantRow.plan_id)
      .single<{ max_rows_per_month: number | null }>();
    rowLimit = plan?.max_rows_per_month ?? null;
  }

  // Get current month snapshot
  const { data: snapshot } = await admin
    .from('tenant_usage_monthly')
    .select('rows_processed')
    .eq('tenant_id', effectiveTenantId)
    .eq('year_month', yearMonth)
    .maybeSingle<{ rows_processed: number }>();

  return NextResponse.json({
    rowsUsed: snapshot?.rows_processed ?? 0,
    rowLimit,
    yearMonth,
  });
}
