import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUsageLimits } from '@/lib/actions/usage'

export async function POST(req: NextRequest) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { sha256, filename } = body
  if (!sha256 || !filename) {
    return NextResponse.json({ error: 'sha256 and filename are required' }, { status: 400 })
  }

  // Usage overage check — inform the agent before it uploads
  const usageCheck = await checkUsageLimits(ctx.tenantId)
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason, overLimit: true }, { status: 402 })
  }

  const supabase = createAdminClient()
  const { data: job } = await supabase
    .from('upload_jobs')
    .select('id, status, updated_at')
    .eq('sha256', sha256)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) {
    return NextResponse.json({ exists: false })
  }

  return NextResponse.json({
    exists: true,
    jobId: job.id,
    status: job.status,
    processedAt: job.updated_at,
  })
}
