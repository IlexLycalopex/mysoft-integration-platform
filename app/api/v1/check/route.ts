import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/v1/check
// Body: { sha256: string, filename: string }
// Auth: Bearer <api_key>
// Returns: { isDuplicate: boolean, existingJobId?: string }
export async function POST(req: NextRequest) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let sha256: string | undefined
  let filename: string | undefined

  try {
    const body = await req.json()
    sha256 = body?.sha256
    filename = body?.filename
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!sha256 || typeof sha256 !== 'string') {
    return NextResponse.json({ error: 'sha256 is required' }, { status: 400 })
  }

  if (!filename || typeof filename !== 'string') {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from('upload_jobs')
    .select('id')
    .eq('sha256', sha256)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (job) {
    return NextResponse.json({ isDuplicate: true, existingJobId: job.id })
  }

  return NextResponse.json({ isDuplicate: false })
}
