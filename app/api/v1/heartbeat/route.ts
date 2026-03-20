import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // last_used_at is updated by validateApiKey — that's sufficient for Sprint 1
  return NextResponse.json({ ok: true })
}
