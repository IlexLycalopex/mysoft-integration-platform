import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUsageLimits } from '@/lib/actions/usage'
import { createHash } from 'crypto'

// POST /api/v1/push/:token
// Accepts: multipart/form-data  { file: File, filename?: string, entity_id_override?: string }
// Auth:    push_token in URL (identifies the watcher config)
// Returns: { jobId, status, autoProcess, isDuplicate? }
//
// Entity resolution order (most specific wins):
//   1. entity_id_override in request body  — per-file override sent by the pushing system
//   2. entity_id_override on watcher config — watcher-level default set by tenant admin
//   3. null (credential default)            — uses the entity on the Intacct credential

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Missing push token' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Resolve watcher by push_token
  const { data: watcher } = await supabase
    .from('watcher_configs')
    .select('id, tenant_id, name, file_pattern, mapping_id, auto_process, enabled, entity_id_override')
    .eq('push_token', token)
    .single()

  if (!watcher) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 404 })
  }
  if (!watcher.enabled) {
    return NextResponse.json({ error: 'Watcher is disabled' }, { status: 403 })
  }

  // Parse multipart body
  let file: File | null = null
  let filename: string | null = null
  let requestEntityOverride: string | null = null
  try {
    const formData = await req.formData()
    file = formData.get('file') as File | null
    filename = (formData.get('filename') as string | null) ?? file?.name ?? null
    requestEntityOverride = (formData.get('entity_id_override') as string | null)?.trim() || null
  } catch {
    return NextResponse.json({ error: 'Multipart/form-data body required' }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 })
  }
  if (!filename) {
    filename = `upload_${Date.now()}.csv`
  }

  // Validate filename against watcher's file pattern
  if (watcher.file_pattern && watcher.file_pattern !== '*') {
    if (!matchesGlob(filename, watcher.file_pattern)) {
      return NextResponse.json(
        { error: `Filename does not match required pattern: ${watcher.file_pattern}` },
        { status: 422 }
      )
    }
  }

  // Usage overage check
  const usageCheck = await checkUsageLimits(watcher.tenant_id)
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 402 })
  }

  // Read file and compute SHA-256
  const fileBuffer = await file.arrayBuffer()
  const sha256 = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')

  // Duplicate check
  const { data: existing } = await supabase
    .from('upload_jobs')
    .select('id, status')
    .eq('sha256', sha256)
    .eq('tenant_id', watcher.tenant_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json(
      { isDuplicate: true, jobId: existing.id, status: existing.status },
      { status: 409 }
    )
  }

  // Upload to Supabase Storage — timestamp prefix to avoid collisions
  const timestamp = Date.now()
  const storagePath = `${watcher.tenant_id}/push_${timestamp}_${filename}`

  const { error: storageError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'text/csv',
      upsert: false,
    })

  if (storageError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${storageError.message}` },
      { status: 500 }
    )
  }

  // Create upload_jobs row
  const { data: job, error: insertError } = await supabase
    .from('upload_jobs')
    .insert({
      tenant_id: watcher.tenant_id,
      filename,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'text/csv',
      status: 'pending',
      sha256,
      source_type: 'http_push',
      watcher_config_id: watcher.id,
      mapping_id: watcher.mapping_id,
      auto_process: watcher.auto_process,
      entity_id_override: requestEntityOverride ?? watcher.entity_id_override ?? null,
    })
    .select('id')
    .single()

  if (insertError || !job) {
    await supabase.storage.from('uploads').remove([storagePath])
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to create job' },
      { status: 500 }
    )
  }

  // Auto-process: use waitUntil so Vercel keeps the function alive after responding
  if (watcher.auto_process && watcher.mapping_id) {
    const cronSecret = process.env.CRON_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
    waitUntil(
      fetch(`${baseUrl}/api/jobs/${job.id}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
        },
      }).catch(() => {})
    )
    return NextResponse.json({ jobId: job.id, status: 'processing', autoProcess: true })
  }

  return NextResponse.json({ jobId: job.id, status: 'pending', autoProcess: false })
}

/** Simple glob matcher supporting * and ? wildcards (case-insensitive). */
function matchesGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'i'
  )
  return regex.test(filename)
}
