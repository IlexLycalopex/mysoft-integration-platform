/**
 * sftp-poll Edge Function
 *
 * Scheduled cron function — runs every 5 minutes via Supabase Scheduler.
 * Polls all enabled SFTP watcher configs, downloads new files, and creates
 * upload_jobs rows for downstream processing.
 *
 * Environment variables required:
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (bypasses RLS)
 *   ENCRYPTION_KEY            - 64-char hex string (32 bytes) for AES-256-GCM decryption
 *
 * Sprint 2 / Sprint 3 boundary:
 *   The scaffold and all non-SFTP logic is fully implemented.
 *   Actual SSH/SFTP connection is marked with TODO comments.
 *   When a suitable Deno SFTP library is available (see TODO below),
 *   replace the stub section with real connection + file listing + download.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatcherConfig {
  id: string;
  tenant_id: string;
  name: string;
  source_type: 'sftp';
  sftp_host: string;
  sftp_port: number;
  sftp_username: string;
  sftp_password_enc: string | null;   // hex-encoded encrypted password
  sftp_remote_path: string;
  file_pattern: string;
  mapping_id: string | null;
  auto_process: boolean;
  enabled: boolean;
  poll_interval: number;
}

interface UploadJobInsert {
  tenant_id: string;
  filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  status: 'pending';
  sha256: string;
  source_type: 'sftp_poll';
  watcher_config_id: string;
  mapping_id: string | null;
  auto_process: boolean;
}

interface ConfigProcessResult {
  configId: string;
  configName: string;
  status: 'success' | 'error' | 'skipped';
  filesFound?: number;
  filesDownloaded?: number;
  jobsCreated?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// AES-256-GCM decryption via Web Crypto API (Deno-compatible)
// Mirrors the encrypt/decrypt logic in lib/crypto.ts
// The encrypted_data column stores: ciphertext (hex), iv (hex), auth_tag (hex)
// in the watcher_configs.sftp_password_enc field as a JSON blob:
//   { "ciphertext": "...", "iv": "...", "authTag": "..." }
// ---------------------------------------------------------------------------

interface EncryptedBlob {
  ciphertext: string;  // hex
  iv: string;          // hex, 24 chars (12 bytes)
  authTag: string;     // hex, 32 chars (16 bytes)
}

async function decryptAesGcm(blob: EncryptedBlob, encryptionKeyHex: string): Promise<string> {
  const keyBytes = hexToBytes(encryptionKeyHex);
  const iv = hexToBytes(blob.iv);
  const authTag = hexToBytes(blob.authTag);
  const ciphertext = hexToBytes(blob.ciphertext);

  // Web Crypto AES-GCM expects ciphertext + authTag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    cryptoKey,
    ciphertextWithTag
  );

  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`Invalid hex string length: ${hex.length}`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// SHA-256 hashing via Web Crypto API
// ---------------------------------------------------------------------------

async function computeSha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Glob pattern matching (simple * and ? wildcard support)
// Used to filter filenames against watcher_config.file_pattern
// ---------------------------------------------------------------------------

function matchesPattern(filename: string, pattern: string): boolean {
  // Convert glob pattern to a regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex specials except * and ?
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(filename);
}

// ---------------------------------------------------------------------------
// Duplicate detection via upload_jobs.sha256
// ---------------------------------------------------------------------------

async function isDuplicate(supabase: SupabaseClient, sha256: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('upload_jobs')
    .select('id')
    .eq('sha256', sha256)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`sftp-poll: error checking duplicate sha256 ${sha256}:`, error.message);
    return false; // Fail open — attempt to process rather than silently skip
  }
  return data !== null;
}

// ---------------------------------------------------------------------------
// Process a single SFTP watcher config
// ---------------------------------------------------------------------------

async function processWatcherConfig(
  supabase: SupabaseClient,
  config: WatcherConfig,
  encryptionKey: string
): Promise<ConfigProcessResult> {

  // Step 2a — Decrypt SFTP password
  let sftpPassword: string | null = null;
  if (config.sftp_password_enc) {
    try {
      const blob: EncryptedBlob = JSON.parse(config.sftp_password_enc);
      sftpPassword = await decryptAesGcm(blob, encryptionKey);
    } catch (err) {
      const message = `Failed to decrypt sftp_password_enc: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`sftp-poll: config ${config.id} (${config.name}): ${message}`);
      return { configId: config.id, configName: config.name, status: 'error', error: message };
    }
  }

  // Step 2b — Log config details
  console.log(`sftp-poll: processing config '${config.name}' (${config.id})`, {
    host: config.sftp_host,
    port: config.sftp_port,
    username: config.sftp_username,
    remotePath: config.sftp_remote_path,
    filePattern: config.file_pattern,
    autoProcess: config.auto_process,
  });

  // Step 2c — TODO: Connect to SFTP, list matching files, download new ones
  //
  // When a suitable Deno-compatible SFTP library is available, replace this
  // entire TODO block with the real implementation. Options to evaluate:
  //
  //   Option A: deno-ssh2 (if/when it becomes available on deno.land/x)
  //             import { Client } from "https://deno.land/x/ssh2/mod.ts";
  //
  //   Option B: A WebAssembly-compiled libssh2 binding for Deno
  //
  //   Option C: Route through a thin sidecar service (e.g. a Supabase Edge
  //             Function calling an internal SSH microservice over HTTP)
  //
  //   Option D: Use the Windows Agent (agent/ directory) which can use
  //             SSH.NET or WinSCP .NET assembly — the agent uploads files
  //             to Storage and creates upload_jobs rows, bypassing this
  //             Edge Function entirely for local/SFTP collection.
  //
  // Pseudocode for when the library is available:
  //
  //   const client = new SftpClient();
  //   await client.connect({
  //     host: config.sftp_host,
  //     port: config.sftp_port,
  //     username: config.sftp_username,
  //     password: sftpPassword ?? undefined,
  //   });
  //
  //   const remoteFiles = await client.list(config.sftp_remote_path);
  //   const matchingFiles = remoteFiles.filter(f => matchesPattern(f.name, config.file_pattern));
  //
  //   for (const remoteFile of matchingFiles) {
  //     const fileBytes = await client.get(`${config.sftp_remote_path}/${remoteFile.name}`);
  //     // ... (see Step 2d below)
  //   }
  //
  //   await client.end();

  // For Sprint 2: return a stub result indicating the config was processed
  // but no files were downloaded (SFTP connection not yet implemented).
  console.log(
    `sftp-poll: config '${config.name}' — SFTP connection not yet implemented (TODO: Sprint 3). ` +
    `Would connect to ${config.sftp_username}@${config.sftp_host}:${config.sftp_port}${config.sftp_remote_path}`
  );

  return {
    configId: config.id,
    configName: config.name,
    status: 'success',
    filesFound: 0,
    filesDownloaded: 0,
    jobsCreated: 0,
  };

  // ---------------------------------------------------------------------------
  // Step 2d — For each downloaded file (Sprint 3 implementation goes here):
  //
  //   const sha256 = await computeSha256(fileBytes);
  //
  //   // Duplicate check
  //   if (await isDuplicate(supabase, sha256)) {
  //     console.log(`sftp-poll: skipping duplicate file ${remoteFile.name} (sha256=${sha256})`);
  //     continue;
  //   }
  //
  //   // Upload to Supabase Storage
  //   const storagePath = `${config.tenant_id}/${config.id}/${Date.now()}_${remoteFile.name}`;
  //   const { error: uploadError } = await supabase.storage
  //     .from('uploads')
  //     .upload(storagePath, fileBytes, {
  //       contentType: 'text/csv',
  //       upsert: false,
  //     });
  //
  //   if (uploadError) {
  //     console.error(`sftp-poll: failed to upload ${remoteFile.name}:`, uploadError.message);
  //     continue;
  //   }
  //
  //   // Insert upload_jobs row
  //   const jobInsert: UploadJobInsert = {
  //     tenant_id: config.tenant_id,
  //     filename: remoteFile.name,
  //     storage_path: storagePath,
  //     file_size: fileBytes.length,
  //     mime_type: 'text/csv',
  //     status: 'pending',
  //     sha256,
  //     source_type: 'sftp_poll',
  //     watcher_config_id: config.id,
  //     mapping_id: config.mapping_id,
  //     auto_process: config.auto_process,
  //   };
  //
  //   const { error: jobError } = await supabase.from('upload_jobs').insert(jobInsert);
  //   if (jobError) {
  //     console.error(`sftp-poll: failed to create upload_job for ${remoteFile.name}:`, jobError.message);
  //   }
  // ---------------------------------------------------------------------------
}

// ---------------------------------------------------------------------------
// Main handler (invoked by Supabase Scheduler — no auth header required)
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('sftp-poll: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Internal Server Error', { status: 500 });
  }

  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('sftp-poll: ENCRYPTION_KEY must be a 64-character hex string');
    return new Response('Internal Server Error', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Step 1 — Fetch all enabled SFTP watcher configs
  const { data: configs, error: configsError } = await supabase
    .from('watcher_configs')
    .select('*')
    .eq('source_type', 'sftp')
    .eq('enabled', true);

  if (configsError) {
    console.error('sftp-poll: failed to fetch watcher_configs:', configsError.message);
    return new Response(
      JSON.stringify({ ok: false, error: configsError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!configs || configs.length === 0) {
    console.log('sftp-poll: no enabled SFTP watcher configs found, nothing to do');
    return new Response(
      JSON.stringify({ ok: true, configsProcessed: 0, results: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`sftp-poll: found ${configs.length} enabled SFTP watcher config(s)`);

  // Step 2 — Process each config
  const results: ConfigProcessResult[] = [];

  for (const config of configs as WatcherConfig[]) {
    const result = await processWatcherConfig(supabase, config, encryptionKey);
    results.push(result);
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const totalJobsCreated = results.reduce((sum, r) => sum + (r.jobsCreated ?? 0), 0);

  console.log(
    `sftp-poll: complete — ${successCount} succeeded, ${errorCount} failed, ${totalJobsCreated} jobs created`
  );

  // Step 3 — Return summary
  return new Response(
    JSON.stringify({
      ok: true,
      configsProcessed: configs.length,
      successCount,
      errorCount,
      totalJobsCreated,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
