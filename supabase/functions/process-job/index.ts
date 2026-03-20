/**
 * process-job Edge Function
 *
 * Triggered by a Supabase Database Webhook on INSERT to upload_jobs
 * where auto_process = true.
 *
 * Environment variables required:
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (bypasses RLS)
 *   ENCRYPTION_KEY            - 64-char hex string (32 bytes) for AES-256-GCM decryption
 *   WEBHOOK_SECRET            - Shared secret validated against x-webhook-secret header
 *   INTACCT_SENDER_ID         - Sage Intacct sender ID
 *   INTACCT_SENDER_PASSWORD   - Sage Intacct sender password
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: UploadJobRecord;
  old_record: UploadJobRecord | null;
}

interface UploadJobRecord {
  id: string;
  tenant_id: string;
  filename: string;
  storage_path: string;   // path within the 'uploads' bucket
  file_path?: string;     // alias — some webhook versions use file_path
  status: string;
  auto_process: boolean;
  mapping_id: string | null;
  watcher_config_id: string | null;
  source_type: string;
  row_count: number | null;
  processed_count: number;
  error_count: number;
  created_at: string;
}

interface ColumnMapping {
  id?: string;
  source_column: string;
  target_field: string;
  required?: boolean;
  default_value?: string;
  transform?: string;
}

interface FieldMapping {
  id: string;
  tenant_id: string;
  name: string;
  transaction_type: 'journal_entry' | 'ar_invoice' | 'ap_bill' | 'expense_report';
  column_mappings: ColumnMapping[];
}

interface TenantCredential {
  id: string;
  tenant_id: string;
  provider: string;
  encrypted_data: string;  // hex-encoded ciphertext
  iv: string;              // hex-encoded 96-bit IV
  auth_tag: string;        // hex-encoded 128-bit GCM auth tag
}

interface IntacctCredentials {
  companyId: string;
  userId: string;
  userPassword: string;
  senderId: string;
  senderPassword: string;
}

interface MappedRow {
  rowNumber: number;
  data: Record<string, string>;
}

interface RowError {
  rowNumber: number;
  field?: string;
  errorCode: string;
  message: string;
  rawData: Record<string, string>;
}

// ---------------------------------------------------------------------------
// AES-256-GCM decryption via Web Crypto API (Deno-compatible)
// Mirrors the encrypt/decrypt logic in lib/crypto.ts
// ---------------------------------------------------------------------------

async function decryptCredentials(
  encryptedData: string,
  ivHex: string,
  authTagHex: string,
  encryptionKeyHex: string
): Promise<string> {
  const keyBytes = hexToBytes(encryptionKeyHex);
  const iv = hexToBytes(ivHex);
  const authTag = hexToBytes(authTagHex);
  const ciphertext = hexToBytes(encryptedData);

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
// CSV parsing (Sprint 2 — XLSX is a TODO)
// ---------------------------------------------------------------------------

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

/** RFC 4180-compliant single-line CSV parser */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  result.push(current.trim());
  return result;
}

// ---------------------------------------------------------------------------
// Field mapping application
// ---------------------------------------------------------------------------

function applyMapping(
  rows: Record<string, string>[],
  columnMappings: ColumnMapping[]
): { mappedRows: MappedRow[]; rowErrors: RowError[] } {
  const mappedRows: MappedRow[] = [];
  const rowErrors: RowError[] = [];

  rows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2; // 1-based, +1 for header
    const mapped: Record<string, string> = {};
    let rowHasError = false;

    for (const cm of columnMappings) {
      let value = rawRow[cm.source_column];

      // Fall back to default_value if the source column is empty/missing
      if ((value === undefined || value === '') && cm.default_value !== undefined) {
        value = cm.default_value;
      }

      if (cm.required && (value === undefined || value === '')) {
        rowErrors.push({
          rowNumber,
          field: cm.target_field,
          errorCode: 'REQUIRED_FIELD_MISSING',
          message: `Required field '${cm.target_field}' (source column '${cm.source_column}') is empty`,
          rawData: rawRow,
        });
        rowHasError = true;
        continue;
      }

      mapped[cm.target_field] = value ?? '';
    }

    if (!rowHasError) {
      mappedRows.push({ rowNumber, data: mapped });
    }
  });

  return { mappedRows, rowErrors };
}

// ---------------------------------------------------------------------------
// Sage Intacct XML Gateway client (Deno-compatible, no Node.js modules)
// ---------------------------------------------------------------------------

const INTACCT_API_URL = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildIntacctRequest(
  creds: IntacctCredentials,
  controlId: string,
  functionXml: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${xmlEsc(creds.senderId)}</senderid>
    <password>${xmlEsc(creds.senderPassword)}</password>
    <controlid>${xmlEsc(controlId)}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation transaction="false">
    <authentication>
      <login>
        <userid>${xmlEsc(creds.userId)}</userid>
        <companyid>${xmlEsc(creds.companyId)}</companyid>
        <password>${xmlEsc(creds.userPassword)}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${xmlEsc(controlId)}">
        ${functionXml}
      </function>
    </content>
  </operation>
</request>`;
}

interface IntacctPostResult {
  success: boolean;
  errors?: string[];
}

async function postToIntacct(xml: string): Promise<IntacctPostResult> {
  const res = await fetch(INTACCT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
    body: xml,
  });

  if (!res.ok) {
    return { success: false, errors: [`HTTP ${res.status}: ${res.statusText}`] };
  }

  const text = await res.text();

  // Minimal XML parsing — check for <status>success</status> or <status>failure</status>
  const operationStatusMatch = text.match(/<operation[^>]*>[\s\S]*?<authentication>[\s\S]*?<\/authentication>[\s\S]*?<result>[\s\S]*?<status>([^<]+)<\/status>/);
  const controlStatusMatch = text.match(/<control>[\s\S]*?<status>([^<]+)<\/status>/);

  // Check control-level failures first
  if (controlStatusMatch && controlStatusMatch[1].trim() === 'failure') {
    const errMatch = text.match(/<errormessage>([\s\S]*?)<\/errormessage>/);
    return { success: false, errors: [errMatch ? errMatch[1] : 'Control-level failure'] };
  }

  if (operationStatusMatch && operationStatusMatch[1].trim() === 'success') {
    return { success: true };
  }

  // Fall back to searching for any result status
  const resultStatusMatch = text.match(/<result>[\s\S]*?<status>([^<]+)<\/status>/);
  if (resultStatusMatch) {
    const status = resultStatusMatch[1].trim();
    if (status === 'success') return { success: true };
    const errMatch = text.match(/<errormessage>([\s\S]*?)<\/errormessage>/);
    return { success: false, errors: [errMatch ? errMatch[1] : `Result status: ${status}`] };
  }

  return { success: false, errors: ['Could not parse Intacct response'] };
}

/**
 * Submit a single mapped row as a GLBATCH (journal entry) to Intacct.
 * TODO: Expand to support ar_invoice and ap_bill transaction types based on
 *       the mapping's transaction_type field.
 */
async function submitRowToIntacct(
  creds: IntacctCredentials,
  mappedRow: MappedRow,
  transactionType: string
): Promise<IntacctPostResult> {
  const controlId = crypto.randomUUID();

  let functionXml: string;

  if (transactionType === 'journal_entry') {
    // Expects mapped fields: JOURNAL, BATCH_DATE, ACCOUNTNO, TR_TYPE, AMOUNT
    // Optional: BATCH_TITLE, REFERENCENO, MEMO, LOCATIONID, DEPARTMENTID, etc.
    const d = mappedRow.data;
    functionXml = `
      <create>
        <GLBATCH>
          ${d['JOURNAL']      ? `<JOURNAL>${xmlEsc(d['JOURNAL'])}</JOURNAL>` : ''}
          ${d['BATCH_DATE']   ? `<BATCH_DATE>${xmlEsc(d['BATCH_DATE'])}</BATCH_DATE>` : ''}
          ${d['BATCH_TITLE']  ? `<BATCH_TITLE>${xmlEsc(d['BATCH_TITLE'])}</BATCH_TITLE>` : ''}
          ${d['REFERENCENO']  ? `<REFERENCENO>${xmlEsc(d['REFERENCENO'])}</REFERENCENO>` : ''}
          <ENTRIES>
            <GLENTRY>
              ${d['ACCOUNTNO']    ? `<ACCOUNTNO>${xmlEsc(d['ACCOUNTNO'])}</ACCOUNTNO>` : ''}
              ${d['TR_TYPE']      ? `<TR_TYPE>${xmlEsc(d['TR_TYPE'])}</TR_TYPE>` : ''}
              ${d['AMOUNT']       ? `<AMOUNT>${xmlEsc(d['AMOUNT'])}</AMOUNT>` : ''}
              ${d['MEMO']         ? `<MEMO>${xmlEsc(d['MEMO'])}</MEMO>` : ''}
              ${d['LOCATIONID']   ? `<LOCATIONID>${xmlEsc(d['LOCATIONID'])}</LOCATIONID>` : ''}
              ${d['DEPARTMENTID'] ? `<DEPARTMENTID>${xmlEsc(d['DEPARTMENTID'])}</DEPARTMENTID>` : ''}
              ${d['PROJECTID']    ? `<PROJECTID>${xmlEsc(d['PROJECTID'])}</PROJECTID>` : ''}
              ${d['CUSTOMERID']   ? `<CUSTOMERID>${xmlEsc(d['CUSTOMERID'])}</CUSTOMERID>` : ''}
              ${d['VENDORID']     ? `<VENDORID>${xmlEsc(d['VENDORID'])}</VENDORID>` : ''}
              ${d['CLASSID']      ? `<CLASSID>${xmlEsc(d['CLASSID'])}</CLASSID>` : ''}
            </GLENTRY>
          </ENTRIES>
        </GLBATCH>
      </create>`;
  } else {
    // TODO: Sprint 3 — implement ar_invoice and ap_bill XML construction
    // For now stub with a no-op that will fail gracefully
    return {
      success: false,
      errors: [`Transaction type '${transactionType}' is not yet implemented. TODO: Sprint 3`],
    };
  }

  return postToIntacct(buildIntacctRequest(creds, controlId, functionXml));
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Validate webhook secret
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret) {
    const incomingSecret = req.headers.get('x-webhook-secret');
    if (!incomingSecret || incomingSecret !== webhookSecret) {
      console.error('process-job: invalid or missing x-webhook-secret header');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // Parse payload
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch (err) {
    console.error('process-job: failed to parse JSON payload', err);
    return new Response('Bad Request', { status: 400 });
  }

  const record = payload.record;

  // Step 2 — Only process auto_process=true jobs
  if (!record.auto_process) {
    console.log(`process-job: job ${record.id} has auto_process=false, skipping`);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Step 3 — mapping_id must be set
  if (!record.mapping_id) {
    console.warn(`process-job: job ${record.id} has no mapping_id, cannot auto-process`);
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: 'no_mapping_id' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Initialise Supabase admin client
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('process-job: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Internal Server Error', { status: 500 });
  }

  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('process-job: ENCRYPTION_KEY must be a 64-character hex string');
    return new Response('Internal Server Error', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const jobId = record.id;
  const tenantId = record.tenant_id;
  // Normalise file path — record may use storage_path or file_path
  const filePath = record.storage_path ?? record.file_path;

  // Step 4 — Mark job as processing
  const { error: updateToProcessingError } = await supabase
    .from('upload_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', jobId);

  if (updateToProcessingError) {
    console.error(`process-job: failed to update job ${jobId} to processing`, updateToProcessingError);
    return new Response('Internal Server Error', { status: 500 });
  }

  let processedCount = 0;
  let errorCount = 0;
  const collectedRowErrors: RowError[] = [];
  let finalStatus: 'completed' | 'completed_with_errors' | 'failed' = 'completed';
  let fileErrorMessage: string | undefined;

  try {
    // Step 5 — Fetch the field mapping
    const { data: mappingData, error: mappingError } = await supabase
      .from('field_mappings')
      .select('*')
      .eq('id', record.mapping_id)
      .single();

    if (mappingError || !mappingData) {
      throw new Error(`Failed to fetch mapping ${record.mapping_id}: ${mappingError?.message ?? 'not found'}`);
    }

    const mapping = mappingData as FieldMapping;

    // Step 6 — Download file from Supabase Storage (bucket: uploads)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('uploads')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file '${filePath}': ${downloadError?.message ?? 'no data'}`);
    }

    const fileText = await fileData.text();

    // Step 7 — Parse the file
    const mimeType = (record as Record<string, unknown>)['mime_type'] as string | undefined;
    const isXlsx =
      mimeType?.includes('spreadsheetml') ||
      record.filename.toLowerCase().endsWith('.xlsx') ||
      record.filename.toLowerCase().endsWith('.xls');

    let headers: string[];
    let rows: Record<string, string>[];

    if (isXlsx) {
      // TODO: Sprint 3 — Add XLSX parsing using a Deno-compatible library such as
      //       https://deno.land/x/sheetjs or https://esm.sh/xlsx
      //       For now fail gracefully so the job is marked failed rather than silently skipped.
      throw new Error('XLSX parsing is not yet implemented. TODO: Sprint 3');
    } else {
      // CSV parsing
      const parsed = parseCsv(fileText);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    console.log(`process-job: parsed ${rows.length} data rows from '${record.filename}' (${headers.length} columns)`);

    // Update row_count now that we know it
    await supabase
      .from('upload_jobs')
      .update({ row_count: rows.length })
      .eq('id', jobId);

    // Step 8 — Apply field mapping
    const { mappedRows, rowErrors: mappingErrors } = applyMapping(rows, mapping.column_mappings);
    collectedRowErrors.push(...mappingErrors);
    errorCount += mappingErrors.length;

    // Step 9 — Fetch and decrypt tenant credentials
    const { data: credRow, error: credError } = await supabase
      .from('tenant_credentials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'intacct')
      .single();

    if (credError || !credRow) {
      throw new Error(`No Intacct credentials found for tenant ${tenantId}: ${credError?.message ?? 'not found'}`);
    }

    const cred = credRow as TenantCredential;

    let credentialsJson: string;
    try {
      credentialsJson = await decryptCredentials(
        cred.encrypted_data,
        cred.iv,
        cred.auth_tag,
        encryptionKey
      );
    } catch (decryptErr) {
      throw new Error(`Failed to decrypt tenant credentials: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`);
    }

    const intacctCreds: IntacctCredentials = JSON.parse(credentialsJson);

    // Inject sender credentials from environment if not stored in the credential blob
    // (some tenants may store only their login creds; sender creds come from platform env)
    if (!intacctCreds.senderId) {
      const envSenderId = Deno.env.get('INTACCT_SENDER_ID');
      if (!envSenderId) throw new Error('INTACCT_SENDER_ID env var is required');
      intacctCreds.senderId = envSenderId;
    }
    if (!intacctCreds.senderPassword) {
      const envSenderPassword = Deno.env.get('INTACCT_SENDER_PASSWORD');
      if (!envSenderPassword) throw new Error('INTACCT_SENDER_PASSWORD env var is required');
      intacctCreds.senderPassword = envSenderPassword;
    }

    // Step 10 — Submit each mapped row to Intacct
    for (const mappedRow of mappedRows) {
      try {
        const result = await submitRowToIntacct(intacctCreds, mappedRow, mapping.transaction_type);
        if (result.success) {
          processedCount++;
        } else {
          const errMsg = result.errors?.join('; ') ?? 'Unknown Intacct error';
          collectedRowErrors.push({
            rowNumber: mappedRow.rowNumber,
            errorCode: 'INTACCT_SUBMISSION_FAILED',
            message: errMsg,
            rawData: mappedRow.data,
          });
          errorCount++;
        }
      } catch (rowErr) {
        collectedRowErrors.push({
          rowNumber: mappedRow.rowNumber,
          errorCode: 'INTACCT_EXCEPTION',
          message: rowErr instanceof Error ? rowErr.message : String(rowErr),
          rawData: mappedRow.data,
        });
        errorCount++;
      }
    }

    finalStatus = errorCount > 0 ? 'completed_with_errors' : 'completed';
  } catch (err) {
    finalStatus = 'failed';
    fileErrorMessage = err instanceof Error ? err.message : String(err);
    console.error(`process-job: job ${jobId} failed:`, fileErrorMessage);
  }

  // Step 11 — Insert row-level errors into job_errors
  if (collectedRowErrors.length > 0) {
    const errorInserts = collectedRowErrors.map((e) => ({
      job_id: jobId,
      tenant_id: tenantId,
      row_number: e.rowNumber,
      field_name: e.field ?? null,
      error_code: e.errorCode,
      error_message: e.message,
      raw_data: e.rawData,
    }));

    const { error: errorInsertErr } = await supabase
      .from('job_errors')
      .insert(errorInserts);

    if (errorInsertErr) {
      console.error(`process-job: failed to insert job_errors for job ${jobId}`, errorInsertErr);
    }
  }

  // Step 11 (cont) — Update upload_jobs with final status
  const { error: finalUpdateError } = await supabase
    .from('upload_jobs')
    .update({
      status: finalStatus,
      processed_count: processedCount,
      error_count: errorCount,
      completed_at: new Date().toISOString(),
      error_message: fileErrorMessage ?? null,
    })
    .eq('id', jobId);

  if (finalUpdateError) {
    console.error(`process-job: failed to write final status for job ${jobId}`, finalUpdateError);
  }

  console.log(`process-job: job ${jobId} finished — status=${finalStatus} processed=${processedCount} errors=${errorCount}`);

  return new Response(
    JSON.stringify({
      ok: true,
      jobId,
      status: finalStatus,
      processedCount,
      errorCount,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
