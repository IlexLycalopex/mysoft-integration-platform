/**
 * GET /api/jobs/[id]/steps
 * Returns all job_steps for a job — used for the timeline/progress UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import type { JobStep } from '@/lib/jobs/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
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

  // Verify job ownership
  const { data: job } = await admin
    .from('upload_jobs')
    .select('id, tenant_id')
    .eq('id', jobId)
    .single<{ id: string; tenant_id: string }>();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (!isPlatformAdmin && job.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: steps, error } = await admin
    .from('job_steps')
    .select('*')
    .eq('job_id', jobId)
    .order('sequence', { ascending: true })
    .returns<JobStep[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ steps: steps ?? [] });
}
