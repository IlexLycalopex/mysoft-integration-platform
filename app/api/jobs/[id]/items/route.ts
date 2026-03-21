/**
 * GET /api/jobs/[id]/items
 * Returns all job_items for a job — row-level results, errors, record IDs.
 * Query params: ?status=failed&limit=100&offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import type { JobItem } from '@/lib/jobs/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const { searchParams } = new URL(req.url);
  const statusFilter  = searchParams.get('status');
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);
  const offset        = parseInt(searchParams.get('offset') ?? '0');

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

  let query = admin.from('job_items')
    .select('*', { count: 'exact' })
    .eq('job_id', jobId)
    .order('item_sequence', { ascending: true })
    .range(offset, offset + limit - 1);

  if (statusFilter) {
    query = query.eq('status', statusFilter as 'pending' | 'parsed' | 'validated' | 'transformed' | 'submitted' | 'posted' | 'failed' | 'reprocessable' | 'skipped');
  }

  const { data: items, error, count } = await query.returns();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items:  items ?? [],
    total:  count ?? 0,
    limit,
    offset,
  });
}
