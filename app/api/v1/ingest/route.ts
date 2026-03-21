import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUsageLimits } from '@/lib/actions/usage'

export async function POST(req: NextRequest) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const filename = formData.get('filename') as string | null
  const sha256 = formData.get('sha256') as string | null
  const mappingId = formData.get('mappingId') as string | null
  const watcherConfigId = formData.get('watcherConfigId') as string | null
  const sourceTypeRaw = (formData.get('sourceType') as string | null) ?? 'agent'

  if (!file || !filename || !sha256) {
    return NextResponse.json({ error: 'file, filename, and sha256 are required' }, { status: 400 })
  }

  if (!['agent', 'sftp_poll'].includes(sourceTypeRaw)) {
    return NextResponse.json({ error: 'sourceType must be agent or sftp_poll' }, { status: 400 })
  }

  const sourceType = sourceTypeRaw as 'agent' | 'sftp_poll'

  // Usage overage check before accepting the file
  const usageCheck = await checkUsageLimits(ctx.tenantId)
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 402 })
  }

  const supabase = createAdminClient()

  // Duplicate check: same sha256 + tenant
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
      { error: 'Duplicate file', jobId: existing.id, status: existing.status },
      { status: 409 }
    )
  }

  // Determine auto_process from watcher config if provided
  let autoProcess = false
  let resolvedMappingId = mappingId ?? null

  if (watcherConfigId) {
    const { data: watcher } = await supabase
      .from('watcher_configs')
      .select('auto_process, mapping_id')
      .eq('id', watcherConfigId)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (watcher) {
      autoProcess = watcher.auto_process
      // Use watcher's mapping_id as fallback if none explicitly supplied
      if (!resolvedMappingId && watcher.mapping_id) {
        resolvedMappingId = watcher.mapping_id
      }
    }
  }

  // Upload file to Supabase Storage
  const storagePath = `${ctx.tenantId}/${filename}`
  const fileBuffer = await file.arrayBuffer()

  const { error: storageError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'text/csv',
      upsert: false,
    })

  if (storageError) {
    return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 })
  }

  // Insert upload_jobs row
  const { data: job, error: insertError } = await supabase
    .from('upload_jobs')
    .insert({
      tenant_id: ctx.tenantId,
      filename,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'text/csv',
      status: 'pending',
      sha256,
      source_type: sourceType,
      watcher_config_id: watcherConfigId ?? null,
      mapping_id: resolvedMappingId,
      auto_process: autoProcess,
    })
    .select('id')
    .single()

  if (insertError || !job) {
    // Clean up storage on insert failure
    await supabase.storage.from('uploads').remove([storagePath])
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create job' }, { status: 500 })
  }

  // Auto-process immediately if a mappingId was supplied (agent simulation mode)
  // or if the watcher config has auto_process: true.
  // We kick off processing as a SEPARATE serverless function invocation so that:
  // (a) this response is returned immediately, and
  // (b) the process call gets its own full timeout budget (Intacct API can be slow).
  // waitUntil keeps the Vercel function alive after the response is sent, ensuring
  // the fire-and-forget fetch is not cancelled on function return.
  if (autoProcess || resolvedMappingId) {
    const cronSecret = process.env.CRON_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
    waitUntil(
      fetch(`${baseUrl}/api/jobs/${job.id}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Prefer CRON_SECRET (same auth used by push route and sftp-poll);
          // fall back to the caller's API key so the process endpoint can validate it.
          Authorization: cronSecret
            ? `Bearer ${cronSecret}`
            : (req.headers.get('authorization') ?? ''),
        },
      }).catch(() => {})
    )
    return NextResponse.json({ jobId: job.id, status: 'processing', autoProcess: true })
  }

  return NextResponse.json({ jobId: job.id, status: 'pending', autoProcess })
}
