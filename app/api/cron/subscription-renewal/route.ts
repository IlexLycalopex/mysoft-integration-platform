import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  // 1. Activate any upcoming subscriptions whose commencement date has arrived
  const { data: activated, error: activateError } = await admin.rpc('activate_upcoming_subscriptions');
  if (activateError) {
    return NextResponse.json({ error: activateError.message }, { status: 500 });
  }

  // 2. Roll over active subscriptions to their next billing period
  const { data: renewed, error: renewError } = await admin.rpc('process_subscription_renewals');
  if (renewError) {
    return NextResponse.json({ error: renewError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activated: activated as number, renewed: renewed as number });
}
