import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import type { EncryptedBlob } from '@/lib/crypto'
import { checkUsageLimits } from '@/lib/actions/usage'
import { verifyCronSecret } from '@/lib/cron-auth'
import { createHash } from 'crypto'
import SftpClient from 'ssh2-sftp-client'

// GET /api/cron/sftp-poll
// Called by Vercel Cron every 5 minutes.
// Polls all enabled SFTP watcher configs, ingesting new files.

type SftpWatcherRow = {
  id: string
  tenant_id: string
  name: string
  sftp_host: string | null
  sftp_port: number | null
  sftp_username: string | null
  sftp_password_enc: string | null
  sftp_remote_path: string | null
  file_pattern: string
  mapping_id: string | null
  archive_action: string
  archive_folder: string | null
  poll_interval: number
  auto_process: boolean
  entity_id_override: string | null
  last_polled_at: string | null
}

type WatcherResult = {
  watcherId: string
  name: string
  filesFound: number
  filesIngested: number
  filesSkipped: number
  errors: string[]
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const admin = createAdminClient()
  const now = new Date()
  const results: WatcherResult[] = []

  // Fetch all enabled SFTP watchers with explicit return type
  const { data: watchersRaw, error: watchersErr } = await admin
    .from('watcher_configs')
    .select(
      'id, tenant_id, name, sftp_host, sftp_port, sftp_username, sftp_password_enc, ' +
      'sftp_remote_path, file_pattern, mapping_id, archive_action, archive_folder, ' +
      'poll_interval, auto_process, entity_id_override, last_polled_at'
    )
    .eq('source_type', 'sftp')
    .eq('enabled', true)
    .returns<SftpWatcherRow[]>()

  if (watchersErr || !watchersRaw) {
    return NextResponse.json({ error: 'Failed to fetch SFTP watchers' }, { status: 500 })
  }

  const watchers = watchersRaw as SftpWatcherRow[]

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host') ?? 'localhost'}`

  for (const watcher of watchers) {
    const result: WatcherResult = {
      watcherId: watcher.id,
      name: watcher.name,
      filesFound: 0,
      filesIngested: 0,
      filesSkipped: 0,
      errors: [],
    }

    // Respect per-watcher poll_interval — skip if not enough time has elapsed
    if (watcher.last_polled_at) {
      const elapsedSeconds =
        (now.getTime() - new Date(watcher.last_polled_at).getTime()) / 1000
      const intervalSeconds = watcher.poll_interval ?? 300
      if (elapsedSeconds < intervalSeconds) {
        results.push(result) // silently skip — not an error
        continue
      }
    }

    // Validate required SFTP fields
    if (!watcher.sftp_host || !watcher.sftp_username || !watcher.sftp_remote_path) {
      result.errors.push('Skipped: SFTP watcher missing host, username, or remote path')
      results.push(result)
      continue
    }

    // Decrypt SFTP password
    let password: string | undefined
    if (watcher.sftp_password_enc) {
      try {
        const blob = JSON.parse(watcher.sftp_password_enc) as EncryptedBlob
        password = decrypt(blob)
      } catch {
        result.errors.push('Failed to decrypt SFTP password — check CREDENTIAL_ENCRYPTION_KEY')
        results.push(result)
        continue
      }
    }

    // Usage limits for this tenant
    const usageCheck = await checkUsageLimits(watcher.tenant_id)
    if (!usageCheck.allowed) {
      result.errors.push(`Usage limit reached: ${usageCheck.reason}`)
      results.push(result)
      continue
    }

    // SFTP connection
    const sftp = new SftpClient(`mip-sftp-poll-${watcher.id.slice(0, 8)}`)
    try {
      await sftp.connect({
        host: watcher.sftp_host,
        port: watcher.sftp_port ?? 22,
        username: watcher.sftp_username,
        password,
        readyTimeout: 15000,
        retries: 1,
        retry_factor: 1,
        retry_minTimeout: 2000,
      })

      // List remote directory
      const remoteDir = watcher.sftp_remote_path
      const fileList = await sftp.list(remoteDir)
      const pattern = watcher.file_pattern ?? '*.csv'
      const matching = fileList.filter(
        (entry) => entry.type === '-' && matchesGlob(entry.name, pattern)
      )
      result.filesFound = matching.length

      for (const remoteEntry of matching) {
        const remotePath = `${remoteDir.replace(/\/$/, '')}/${remoteEntry.name}`

        try {
          // Download file as Buffer
          const fileBuffer = (await sftp.get(remotePath)) as Buffer

          // SHA-256 for deduplication
          const sha256 = createHash('sha256').update(fileBuffer).digest('hex')

          // Duplicate check
          const { data: existing } = await admin
            .from('upload_jobs')
            .select('id')
            .eq('sha256', sha256)
            .eq('tenant_id', watcher.tenant_id)
            .limit(1)
            .single()

          if (existing) {
            result.filesSkipped++
            // Still archive the duplicate so it doesn't keep reappearing
            await archiveFile(sftp, remotePath, watcher.archive_action, watcher.archive_folder)
            continue
          }

          // Upload to Supabase Storage
          const timestamp = Date.now()
          const storagePath = `${watcher.tenant_id}/sftp_${timestamp}_${remoteEntry.name}`

          const { error: storageErr } = await admin.storage
            .from('uploads')
            .upload(storagePath, fileBuffer, {
              contentType: 'text/csv',
              upsert: false,
            })

          if (storageErr) {
            result.errors.push(
              `Storage upload failed for ${remoteEntry.name}: ${storageErr.message}`
            )
            continue
          }

          // Insert upload_jobs row
          const { data: job, error: insertErr } = await admin
            .from('upload_jobs')
            .insert({
              tenant_id: watcher.tenant_id,
              filename: remoteEntry.name,
              storage_path: storagePath,
              file_size: fileBuffer.length,
              mime_type: 'text/csv',
              status: 'pending' as const,
              sha256,
              source_type: 'sftp_poll' as const,
              watcher_config_id: watcher.id,
              mapping_id: watcher.mapping_id,
              auto_process: watcher.auto_process,
              entity_id_override: watcher.entity_id_override ?? null,
            })
            .select('id')
            .single()

          if (insertErr || !job) {
            // Roll back storage upload on insert failure
            await admin.storage.from('uploads').remove([storagePath])
            result.errors.push(
              `Job insert failed for ${remoteEntry.name}: ${insertErr?.message ?? 'unknown'}`
            )
            continue
          }

          result.filesIngested++

          // Auto-process: waitUntil keeps the function alive after response is sent
          if (watcher.auto_process && watcher.mapping_id) {
            waitUntil(
              fetch(`${baseUrl}/api/jobs/${job.id}/process`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
                },
              }).catch(() => {})
            )
          }

          // Archive / delete processed file on SFTP
          await archiveFile(sftp, remotePath, watcher.archive_action, watcher.archive_folder)
        } catch (fileErr) {
          result.errors.push(
            `Error processing ${remoteEntry.name}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`
          )
        }
      }
    } catch (connectErr) {
      result.errors.push(
        `SFTP connection failed: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`
      )
    } finally {
      try { await sftp.end() } catch { /* ignore */ }
    }

    // Update last_polled_at regardless of errors (prevents rapid retry storms)
    await admin
      .from('watcher_configs')
      .update({ last_polled_at: now.toISOString() })
      .eq('id', watcher.id)

    results.push(result)
  }

  const totalIngested = results.reduce((s, r) => s + r.filesIngested, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)

  return NextResponse.json({
    ok: true,
    polledAt: now.toISOString(),
    watchersChecked: watchers.length,
    filesIngested: totalIngested,
    errors: totalErrors,
    results,
  })
}

/** Archive or delete a file on the SFTP server after successful ingestion. */
async function archiveFile(
  sftp: SftpClient,
  remotePath: string,
  archiveAction: string | null,
  archiveFolder: string | null
): Promise<void> {
  if (!archiveAction || archiveAction === 'leave') return
  try {
    if (archiveAction === 'delete') {
      await sftp.delete(remotePath)
    } else if (archiveAction === 'move' && archiveFolder) {
      const filename = remotePath.split('/').pop()!
      const dest = `${archiveFolder.replace(/\/$/, '')}/${filename}`
      await sftp.rename(remotePath, dest)
    }
  } catch {
    // Archive failure is non-fatal — file was already ingested successfully
  }
}

/** Simple glob matcher: supports * (any sequence) and ? (any single char). */
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
