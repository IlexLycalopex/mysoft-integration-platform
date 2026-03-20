import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const ctx = await validateApiKey(req.headers.get('authorization'))
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: watchers } = await supabase
    .from('watcher_configs')
    .select('id, name, source_type, folder_path, sftp_host, sftp_port, sftp_username, sftp_remote_path, file_pattern, mapping_id, archive_action, archive_folder, poll_interval, auto_process, entity_id_override')
    .eq('tenant_id', ctx.tenantId)
    .eq('enabled', true)

  return NextResponse.json({
    watchers: (watchers ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sourceType: w.source_type,
      folderPath: w.folder_path,
      sftpHost: w.sftp_host,
      sftpPort: w.sftp_port,
      sftpUsername: w.sftp_username,
      sftpRemotePath: w.sftp_remote_path,
      filePattern: w.file_pattern,
      mappingId: w.mapping_id,
      archiveAction: w.archive_action,
      archiveFolder: w.archive_folder,
      pollInterval: w.poll_interval,
      autoProcess: w.auto_process,
      entityIdOverride: w.entity_id_override ?? null,
    })),
  })
}
