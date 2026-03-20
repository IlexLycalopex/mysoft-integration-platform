import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const supabase = createAdminClient()
  const { data: job } = await supabase
    .from('upload_jobs')
    .select('id, status, processed_count, error_count, created_at, updated_at')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .single()

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    rowsProcessed: job.processed_count ?? 0,
    rowsErrored: job.error_count ?? 0,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  })
}
