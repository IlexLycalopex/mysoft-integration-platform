/**
 * GET /api/jobs/[id]/events
 * Returns append-only job audit trail.
 * Query params: ?severity=error&limit=100&since=ISO_TIMESTAMP
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import type { JobEvent } from '@/lib/jobs/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { searchParams } = new URL(req.url);
  const severityFilter = searchParams.get('severity');
  const since          = searchParams.get('since');
  const limit          = Math.min(parseInt(searchParams.get('limit') ?? '200'), 1000);

  const supabase = await createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);

  const { data: job } = await admin
    .from('upload_jobs')
    .select('id, tenant_id')
    .eq('id', jobId)
    .single<{ id: string; tenant_id: string }>();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!isPlatformAdmin && job.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = (admin as any).from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (severityFilter) query = query.eq('severity', severityFilter);
  if (since)          query = query.gt('created_at', since);

  const { data: events, error } = await query.returns();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: events ?? [] });
}
