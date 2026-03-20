import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshUsageSnapshot } from '@/lib/actions/usage';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  const { data: tenants, error } = await admin
    .from('tenants')
    .select('id')
    .eq('status', 'active');

  if (error || !tenants) {
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }

  let updated = 0;

  for (const tenant of tenants) {
    try {
      const result = await refreshUsageSnapshot(tenant.id);
      if (result) updated++;
    } catch {
      // Non-fatal — continue with other tenants
    }
  }

  return NextResponse.json({ ok: true, updated });
}
