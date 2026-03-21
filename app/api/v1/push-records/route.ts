import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createHash } from 'crypto'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUsageLimits } from '@/lib/actions/usage'

/**
 * POST /api/v1/push-records
 *
 * Accepts a JSON array of pre-mapped records (column headers → values) and
 * creates an upload job, reusing the full CSV → mapping → Intacct pipeline.
 *
 * Auth: Authorization: Bearer <api-key>
 *
 * Request body (application/json):
 * {
 *   records:           Record<string, string>[],  // required — array of row objects
 *   mappingId?:        string,                    // optional — triggers auto-process
 *   entityIdOverride?: string,                    // optional — target Intacct entity
 *   filename?:         string,                    // optional — used for storage & audit
 *   attachment?: {                                // optional — supporting document
 *     filename:  string,
 *     mimeType:  string,
 *     data:      string,                          // base64-encoded file content
 *   },
 *   supdocFolderName?: string,                   // optional — Intacct attachment folder
 * }
 *
 * Response 200: { jobId, status, rowCount, autoProcess }
 * Response 409: { error, jobId, status }   — duplicate payload (same sha256)
 */

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    records?: unknown
    mappingId?: string
    entityIdOverride?: string
    filename?: string
    attachment?: {
      filename: string
      mimeType: string
      data: string
    }
    supdocFolderName?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const {
    records,
    mappingId       = null,
    entityIdOverride = null,
    filename: rawFilename,
    attachment,
    supdocFolderName = 'Mysoft Imports',
  } = body

  // ── Validate records ──────────────────────────────────────────────────────
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { error: '`records` must be a non-empty array of row objects' },
      { status: 400 }
    )
  }

  // Ensure every element is a plain object
  if (!records.every(r => r !== null && typeof r === 'object' && !Array.isArray(r))) {
    return NextResponse.json(
      { error: 'Each element in `records` must be a plain object (key/value pairs)' },
      { status: 400 }
    )
  }

  // ── Usage check ───────────────────────────────────────────────────────────
  const usageCheck = await checkUsageLimits(ctx.tenantId)
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 402 })
  }

  // ── Serialise records → CSV ───────────────────────────────────────────────
  const csvString = Papa.unparse(records as Record<string, string>[], {
    header: true,
    newline: '\n',
  })

  const csvBytes   = Buffer.from(csvString, 'utf8')
  const sha256     = createHash('sha256').update(csvBytes).digest('hex')
  const timestamp  = Date.now()
  const filename   = sanitiseFilename(rawFilename) ?? `json_push_${timestamp}.csv`

  // ── Duplicate check ───────────────────────────────────────────────────────
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('upload_jobs')
    .select('id, status')
    .eq('sha256', sha256)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Duplicate payload', jobId: existing.id, status: existing.status },
      { status: 409 }
    )
  }

  // ── Upload CSV to Storage ─────────────────────────────────────────────────
  const storagePath = `${ctx.tenantId}/json_push_${timestamp}_${filename}`

  const { error: storageError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, csvBytes, { contentType: 'text/csv', upsert: false })

  if (storageError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${storageError.message}` },
      { status: 500 }
    )
  }

  // ── Optional attachment ───────────────────────────────────────────────────
  let attachmentStoragePath: string | null = null
  let attachmentFilename:    string | null = null
  let attachmentMimeType:    string | null = null
  let attachmentFileSize:    number | null = null

  if (attachment) {
    const { filename: attFn, mimeType: attMime, data: attBase64 } = attachment

    if (!attFn || !attMime || !attBase64) {
      // Clean up already-uploaded CSV
      await supabase.storage.from('uploads').remove([storagePath])
      return NextResponse.json(
        { error: 'attachment must include filename, mimeType, and base64 data' },
        { status: 400 }
      )
    }

    let attBuffer: Buffer
    try {
      attBuffer = Buffer.from(attBase64, 'base64')
    } catch {
      await supabase.storage.from('uploads').remove([storagePath])
      return NextResponse.json(
        { error: 'attachment.data must be a valid base64 string' },
        { status: 400 }
      )
    }

    attachmentStoragePath = `${ctx.tenantId}/json_push_${timestamp}/attachments/${sanitiseFilename(attFn) ?? attFn}`
    attachmentFilename    = attFn
    attachmentMimeType    = attMime
    attachmentFileSize    = attBuffer.byteLength

    const { error: attErr } = await supabase.storage
      .from('uploads')
      .upload(attachmentStoragePath, attBuffer, { contentType: attMime, upsert: false })

    if (attErr) {
      await supabase.storage.from('uploads').remove([storagePath])
      return NextResponse.json(
        { error: `Attachment upload failed: ${attErr.message}` },
        { status: 500 }
      )
    }
  }

  // ── Create upload_jobs row ────────────────────────────────────────────────
  const { data: job, error: insertError } = await supabase
    .from('upload_jobs')
    .insert({
      tenant_id:    ctx.tenantId,
      filename,
      storage_path: storagePath,
      file_size:    csvBytes.byteLength,
      mime_type:    'text/csv',
      status:       'pending',
      sha256,
      source_type:  'json_push',
      mapping_id:   mappingId ?? null,
      auto_process: mappingId != null,
      ...(entityIdOverride?.trim()   ? { entity_id_override:      entityIdOverride.trim() }   : {}),
      ...(attachmentStoragePath      ? { attachment_storage_path: attachmentStoragePath }      : {}),
      ...(attachmentFilename         ? { attachment_filename:      attachmentFilename }         : {}),
      ...(attachmentMimeType         ? { attachment_mime_type:     attachmentMimeType }         : {}),
      ...(attachmentFileSize         ? { attachment_file_size:     attachmentFileSize }         : {}),
      supdoc_folder_name: supdocFolderName,
    })
    .select('id')
    .single()

  if (insertError || !job) {
    await supabase.storage.from('uploads').remove(
      [storagePath, ...(attachmentStoragePath ? [attachmentStoragePath] : [])]
    )
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to create job' },
      { status: 500 }
    )
  }

  // ── Auto-process if mappingId supplied ────────────────────────────────────
  if (mappingId) {
    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
    const cronSecret = process.env.CRON_SECRET
    fetch(`${baseUrl}/api/jobs/${job.id}/process`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
    }).catch(() => {}) // fire-and-forget

    return NextResponse.json({
      jobId:       job.id,
      status:      'processing',
      rowCount:    records.length,
      autoProcess: true,
    })
  }

  return NextResponse.json({
    jobId:       job.id,
    status:      'pending',
    rowCount:    records.length,
    autoProcess: false,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip characters that are unsafe in storage paths / filenames. */
function sanitiseFilename(name: string | undefined | null): string | null {
  if (!name) return null
  return name.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 200)
}
