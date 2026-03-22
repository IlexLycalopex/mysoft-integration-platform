/**
 * Source Sync Engine
 *
 * Orchestrates: authenticate → refresh token if needed → fetch records (paged)
 * → write as JSONL to Supabase Storage → create upload_job → return job ID.
 *
 * The uploaded JSONL feeds into the existing field-mapping + Intacct pipeline
 * unchanged. Each line is a JSON object (flat string map) identical to a CSV row.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt }  from '@/lib/crypto';
import { getSourceConnector } from '@/lib/connectors/source-registry';
import type { OAuthTokens }   from '@/lib/connectors/source.interface';

interface SyncOptions {
  tenantId:         string;
  connectorId:      string;   // endpoint_connectors UUID
  connectorKey:     string;   // e.g. 'xero'
  objectType:       string;   // e.g. 'xero_invoice'
  mappingId:        string;   // field_mappings UUID for the target mapping
  syncId?:          string;   // source_syncs UUID (if this is a saved sync)
  sinceOverride?:   Date;     // Override delta cutoff
  dryRun?:          boolean;  // Fetch + store without creating job
}

interface SyncResult {
  jobId?:          string;
  recordCount:     number;
  storageKey?:     string;
  error?:          string;
}

export async function runSourceSync(opts: SyncOptions): Promise<SyncResult> {
  const admin = createAdminClient();
  const connector = getSourceConnector(opts.connectorKey);

  if (!connector) {
    return { error: `No source connector registered for key "${opts.connectorKey}"`, recordCount: 0 };
  }

  // ── 1. Load + decrypt credentials ─────────────────────────────────────────
  const { data: credRow } = await admin
    .from('source_credentials')
    .select('encrypted_data, iv, auth_tag, token_expires_at, extra_data, refresh_token_hint')
    .eq('tenant_id', opts.tenantId)
    .eq('connector_id', opts.connectorId)
    .single<{
      encrypted_data: string; iv: string; auth_tag: string;
      token_expires_at: string | null; extra_data: Record<string, string> | null;
      refresh_token_hint: string | null;
    }>();

  if (!credRow) {
    return { error: 'No credentials found. Connect this source account first.', recordCount: 0 };
  }

  let tokens: OAuthTokens;
  try {
    const plain = decrypt({ ciphertext: credRow.encrypted_data, iv: credRow.iv, authTag: credRow.auth_tag });
    tokens = JSON.parse(plain) as OAuthTokens;
    tokens.extraData = credRow.extra_data ?? undefined;
    tokens.expiresAt = credRow.token_expires_at ? new Date(credRow.token_expires_at) : undefined;
  } catch {
    return { error: 'Failed to decrypt source credentials.', recordCount: 0 };
  }

  // ── 2. Refresh token if expired ────────────────────────────────────────────
  const BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
  if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() < BUFFER_MS) {
    if (!tokens.refreshToken) {
      return { error: 'Access token expired and no refresh token available. Reconnect the account.', recordCount: 0 };
    }
    try {
      const refreshed = await connector.refreshAccessToken(tokens.refreshToken);
      refreshed.extraData = tokens.extraData;
      tokens = refreshed;

      // Persist refreshed tokens
      const blob = encrypt(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
      await admin.from('source_credentials').update({
        encrypted_data:   blob.ciphertext,
        iv:               blob.iv,
        auth_tag:         blob.authTag,
        token_expires_at: tokens.expiresAt?.toISOString() ?? null,
        refreshed_at:     new Date().toISOString(),
      }).eq('tenant_id', opts.tenantId).eq('connector_id', opts.connectorId);
    } catch (err) {
      return { error: `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`, recordCount: 0 };
    }
  }

  // ── 3. Determine delta cutoff ──────────────────────────────────────────────
  let since: Date | undefined = opts.sinceOverride;
  if (!since && opts.syncId) {
    const { data: syncRow } = await admin
      .from('source_syncs')
      .select('sync_since, last_synced_at')
      .eq('id', opts.syncId)
      .single<{ sync_since: string | null; last_synced_at: string | null }>();
    if (syncRow?.last_synced_at) since = new Date(syncRow.last_synced_at);
    else if (syncRow?.sync_since) since = new Date(syncRow.sync_since);
  }

  // ── 4. Fetch all pages ─────────────────────────────────────────────────────
  const allLines: string[] = [];
  let pageToken: string | undefined = '1';
  let hasMore = true;

  while (hasMore) {
    const result = await connector.fetchRecords({
      objectType: opts.objectType,
      credentials: tokens,
      since,
      pageToken,
    });

    for (const record of result.records) {
      allLines.push(JSON.stringify(record.fields));
    }

    hasMore = result.hasMore;
    pageToken = result.nextPageToken;

    if (!hasMore || !pageToken) break;
  }

  if (!allLines.length) {
    // Update last_synced_at even on empty result
    if (opts.syncId) {
      await admin.from('source_syncs').update({
        last_synced_at: new Date().toISOString(),
        last_sync_count: 0,
      }).eq('id', opts.syncId);
    }
    return { recordCount: 0 };
  }

  if (opts.dryRun) {
    return { recordCount: allLines.length };
  }

  // ── 5. Upload JSONL to Supabase Storage ────────────────────────────────────
  const ts = Date.now();
  const storageKey = `${opts.tenantId}/source-sync/${opts.connectorKey}/${opts.objectType}/${ts}.jsonl`;
  const fileContent = allLines.join('\n');

  const { error: uploadErr } = await admin.storage
    .from('uploads')
    .upload(storageKey, Buffer.from(fileContent, 'utf8'), {
      contentType: 'application/jsonl',
      upsert: false,
    });

  if (uploadErr) {
    return { error: `Storage upload failed: ${uploadErr.message}`, recordCount: allLines.length };
  }

  // ── 6. Create upload_job ───────────────────────────────────────────────────
  const { data: job, error: jobErr } = await admin
    .from('upload_jobs')
    .insert({
      tenant_id:           opts.tenantId,
      mapping_id:          opts.mappingId,
      status:              'pending',
      source_path:         storageKey,
      filename:            `${opts.connectorKey}_${opts.objectType}_${ts}.jsonl`,
      storage_path:        storageKey,
      source_connector_id: opts.connectorId,
      source_object_key:   opts.objectType,
      source_sync_id:      opts.syncId ?? null,
      row_count:           allLines.length,
    })
    .select('id')
    .single<{ id: string }>();

  if (jobErr || !job) {
    return { error: `Failed to create upload job: ${jobErr?.message}`, recordCount: allLines.length, storageKey };
  }

  // ── 7. Update source_syncs metadata ───────────────────────────────────────
  if (opts.syncId) {
    await admin.from('source_syncs').update({
      last_synced_at:  new Date().toISOString(),
      last_sync_count: allLines.length,
    }).eq('id', opts.syncId);
  }

  return {
    jobId:       job.id,
    recordCount: allLines.length,
    storageKey,
  };
}
