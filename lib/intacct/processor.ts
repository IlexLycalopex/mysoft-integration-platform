/**
 * Job processor: reads an uploaded file from Supabase Storage,
 * applies the field mapping, and submits rows to Sage Intacct.
 *
 * Called from the API route POST /api/jobs/[id]/process
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCredentials } from '@/lib/actions/credentials';
import {
  createJournalEntry, createArInvoice, createApBill,
  createArPayment, createApPayment, createExpenseReport,
  createTimesheet, createVendor, createCustomer,
  createSupdoc,
} from '@/lib/intacct/client';
import type { IntacctCredentials } from '@/lib/intacct/types';
import type { ColumnMappingEntry } from '@/types/database';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';
import { mapRow as mapRowV2 } from '@/lib/mapping-engine/execute';
import type {
  JournalEntryLine, ArInvoiceLine, ApBillLine, ExpenseReportLine,
  TimesheetLine,
} from '@/lib/intacct/client';
import { sendJobCompletedEmail, sendJobFailedEmail, sendApprovalRequestEmail } from '@/lib/email';
import { dispatchWebhooks } from '@/lib/webhooks';
import { getTenantBranding } from '@/lib/branding';

export interface ProcessResult {
  processed: number;
  errors: number;
  message?: string;
  recordNos?: string[];
  entityIdUsed?: string | null;
}

export type { ProcessingLogEntry } from './log-types';
import type { ProcessingLogEntry } from './log-types';

type RawRow = Record<string, string>;

function logEntry(
  log: ProcessingLogEntry[],
  level: ProcessingLogEntry['level'],
  msg: string,
  data?: Record<string, unknown>
): void {
  log.push({ t: new Date().toISOString(), level, msg, ...(data ? { data } : {}) });
}

/**
 * Main entry point. Fetches job + mapping, downloads file, parses, submits rows.
 */
export async function processJob(jobId: string): Promise<ProcessResult> {
  const admin = createAdminClient();

  // 1 — fetch the job record
  const { data: job, error: jobErr } = await admin
    .from('upload_jobs')
    .select('id, tenant_id, storage_path, mapping_id, status, dry_run, requires_approval, approved_at, entity_id_override, watcher_config_id, attachment_storage_path, attachment_filename, attachment_mime_type, supdoc_folder_name')
    .eq('id', jobId)
    .single<{
      id: string;
      tenant_id: string;
      storage_path: string;
      mapping_id: string | null;
      status: string;
      dry_run: boolean;
      requires_approval: boolean;
      approved_at: string | null;
      entity_id_override: string | null;
      watcher_config_id: string | null;
      attachment_storage_path: string | null;
      attachment_filename: string | null;
      attachment_mime_type: string | null;
      supdoc_folder_name: string | null;
    }>();

  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'pending') throw new Error(`Job is already ${job.status}`);

  // Resolve watcher-level entity override (if job came from a watcher)
  let watcherEntityOverride: string | null = null;
  if (job.watcher_config_id) {
    const { data: watcher } = await admin
      .from('watcher_configs')
      .select('entity_id_override')
      .eq('id', job.watcher_config_id)
      .single<{ entity_id_override: string | null }>();
    watcherEntityOverride = watcher?.entity_id_override ?? null;
  }
  // Priority: job override > watcher override > credential default (resolved in runJob)
  const jobEntityOverride = job.entity_id_override ?? watcherEntityOverride ?? null;

  // Pre-fetch job metadata for notifications (needed before possible early return)
  const { data: jobMeta } = await admin
    .from('upload_jobs')
    .select('filename, created_by')
    .eq('id', jobId)
    .single<{ filename: string; created_by: string | null }>();

  // Fetch branding once per job for email notifications
  const tenantBranding = await getTenantBranding(job.tenant_id);

  // If job requires approval and hasn't been approved yet, set to awaiting_approval and stop
  if (job.requires_approval && !job.approved_at) {
    await admin.from('upload_jobs')
      .update({ status: 'awaiting_approval' })
      .eq('id', jobId);
    // Notify tenant admins that a job is waiting for approval
    await notifyApprovalRequired(admin, job.tenant_id, jobMeta?.created_by, {
      filename: jobMeta?.filename ?? 'file',
      jobId,
    }, tenantBranding);
    return { processed: 0, errors: 0 };
  }

  // 2 — mark as processing
  await admin.from('upload_jobs').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', jobId);

  try {
    const result = await runJob(admin, job.id, job.tenant_id, job.storage_path, job.mapping_id, job.dry_run, jobEntityOverride, {
      attachmentStoragePath: job.attachment_storage_path ?? undefined,
      attachmentFilename: job.attachment_filename ?? undefined,
      attachmentMimeType: job.attachment_mime_type ?? undefined,
      supdocFolderName: job.supdoc_folder_name ?? 'Mysoft Imports',
    });

    const finalStatus = result.errors > 0 ? 'completed_with_errors' : 'completed';
    await admin.from('upload_jobs').update({
      status: finalStatus,
      processed_count: result.processed,
      error_count: result.errors,
      completed_at: new Date().toISOString(),
      ...(result.entityIdUsed !== undefined ? { entity_id_used: result.entityIdUsed } : {}),
    }).eq('id', jobId);

    await notifyUser(admin, jobMeta?.created_by, 'completed', {
      filename: jobMeta?.filename ?? 'file',
      processed: result.processed,
      errors: result.errors,
      jobId,
    }, tenantBranding);

    // Fire webhooks (non-blocking)
    const webhookEvent = result.errors > 0 ? 'job.failed' : 'job.completed';
    dispatchWebhooks(job.tenant_id, webhookEvent, {
      jobId,
      tenantId: job.tenant_id,
      status: finalStatus,
      filename: jobMeta?.filename ?? 'file',
      processedCount: result.processed,
      errorCount: result.errors,
      recordNos: result.recordNos ?? [],
    }).catch(() => {}); // never let this throw

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    await admin.from('upload_jobs').update({
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    await notifyUser(admin, jobMeta?.created_by, 'failed', {
      filename: jobMeta?.filename ?? 'file',
      errorMessage: msg,
      jobId,
    }, tenantBranding);

    // Fire webhooks for failure (non-blocking)
    dispatchWebhooks(job.tenant_id, 'job.failed', {
      jobId,
      tenantId: job.tenant_id,
      status: 'failed',
      filename: jobMeta?.filename ?? 'file',
      processedCount: 0,
      errorCount: 1,
      recordNos: [],
      errorMessage: msg,
    }).catch(() => {}); // never let this throw

    throw err;
  }
}

interface AttachmentParams {
  attachmentStoragePath?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
  supdocFolderName?: string;
}

async function runJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  tenantId: string,
  storagePath: string,
  mappingId: string | null,
  dryRun = false,
  entityIdOverride: string | null = null,
  attachment: AttachmentParams = {}
): Promise<ProcessResult> {
  const log: ProcessingLogEntry[] = [];

  const flushLog = () =>
    admin.from('upload_jobs').update({ processing_log: log as unknown as Record<string, unknown>[] }).eq('id', jobId);

  // 3 — load tenant region (for date parsing locale) + credentials
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('home_region')
    .eq('id', tenantId)
    .single<{ home_region: 'uk' | 'us' | 'eu' }>();
  const dateLocale: 'uk' | 'us' = tenantRow?.home_region === 'us' ? 'us' : 'uk';

  logEntry(log, 'info', 'Loading Intacct credentials...');
  let creds = await getCredentials(tenantId);
  if (!creds) {
    logEntry(log, 'error', 'No Intacct credentials configured for this tenant');
    await flushLog();
    throw new Error('No Intacct credentials configured for this tenant. Visit Settings → Intacct Credentials.');
  }
  // Apply entity override priority: job/watcher override > credential default
  const effectiveEntityId = entityIdOverride ?? creds.entityId ?? null;
  if (entityIdOverride && entityIdOverride !== creds.entityId) {
    creds = { ...creds, entityId: entityIdOverride };
  }
  logEntry(log, 'info', 'Credentials loaded', {
    companyId: creds.companyId,
    userId: creds.userId,
    entityId: effectiveEntityId ?? '(top-level — no entity context)',
    entityIdSource: entityIdOverride ? 'job/watcher override' : (creds.entityId ? 'credential default' : 'none'),
    senderIdSource: creds.senderId ? 'configured' : 'missing',
    dateLocale,
  });

  // 3b — create supdoc in Intacct if an attachment was provided
  let resolvedSupdocId: string | undefined;

  if (attachment.attachmentStoragePath && !dryRun) {
    logEntry(log, 'info', 'Downloading supporting document from storage…', {
      attachmentPath: attachment.attachmentStoragePath,
      filename: attachment.attachmentFilename,
    });
    try {
      const { data: attachBlob, error: attachErr } = await admin.storage
        .from('uploads')
        .download(attachment.attachmentStoragePath);

      if (attachErr || !attachBlob) {
        logEntry(log, 'warn', `Could not download attachment: ${attachErr?.message ?? 'unknown'}. Proceeding without SUPDOCID.`);
      } else {
        const buffer = Buffer.from(await attachBlob.arrayBuffer());
        const base64Data = buffer.toString('base64');

        const folderName = attachment.supdocFolderName ?? 'Mysoft Imports';
        const filename = attachment.attachmentFilename ?? 'attachment';
        const mimeType = attachment.attachmentMimeType ?? 'application/pdf';

        logEntry(log, 'info', 'Creating supdoc in Intacct…', { folder: folderName, filename, mimeType });

        const supdocResult = await createSupdoc(creds, {
          supdocfoldername: folderName,
          description: `Imported via Mysoft Integration Platform — Job ${jobId}`,
          files: [{ filename, mimeType, data: base64Data }],
        });

        if (!supdocResult.success) {
          const err = supdocResult.errors?.[0];
          const errMsg = err
            ? `${err.errorno}: ${err.description}${err.description2 ? ' — ' + err.description2 : ''}`
            : 'Unknown error';
          logEntry(log, 'warn', `Supdoc creation failed: ${errMsg}. Proceeding without SUPDOCID.`, {
            errors: supdocResult.errors,
            rawXml: supdocResult.rawXml,
          });
        } else {
          // Intacct returns the supdocid in <key> on the result, or we fall back to a
          // supdocid we specified. Extract from recordNo (populated by postXml).
          resolvedSupdocId = supdocResult.recordNo ?? supdocResult.rawResult?.['key'] as string | undefined;
          if (!resolvedSupdocId && supdocResult.data?.[0]) {
            // Some Intacct versions return the id inside the data object
            const d = supdocResult.data[0];
            resolvedSupdocId = (d['supdocid'] ?? d['SUPDOCID']) as string | undefined;
          }

          if (resolvedSupdocId) {
            logEntry(log, 'success', `Supdoc created in Intacct`, { supdocId: resolvedSupdocId, folder: folderName, filename });
            // Persist SUPDOCID to the job record for audit trail
            await (admin as any).from('upload_jobs').update({ supdoc_id: resolvedSupdocId }).eq('id', jobId);
          } else {
            logEntry(log, 'warn', 'Supdoc creation appeared successful but no SUPDOCID was returned. Transactions will be posted without SUPDOCID.', {
              rawResult: supdocResult.rawResult,
            });
          }
        }
      }
    } catch (attachEx: unknown) {
      const msg = attachEx instanceof Error ? attachEx.message : String(attachEx);
      logEntry(log, 'warn', `Supdoc creation threw an exception: ${msg}. Proceeding without SUPDOCID.`);
    }
  } else if (attachment.attachmentStoragePath && dryRun) {
    logEntry(log, 'info', '[DRY RUN] Attachment present — supdoc creation skipped (dry run)');
  }

  // 4 — load mapping
  if (!mappingId) {
    logEntry(log, 'error', 'No mapping assigned to this job');
    await flushLog();
    throw new Error('No mapping assigned to this job. Edit the job to assign a field mapping.');
  }

  const { data: mapping } = await admin
    .from('field_mappings')
    .select('column_mappings, transaction_type, name')
    .eq('id', mappingId)
    .single<{ column_mappings: ColumnMappingEntry[]; transaction_type: string; name: string }>();

  if (!mapping) {
    logEntry(log, 'error', 'Field mapping not found', { mappingId });
    await flushLog();
    throw new Error('Field mapping not found');
  }
  logEntry(log, 'info', 'Mapping loaded', { mappingName: mapping.name, transactionType: mapping.transaction_type });

  // 5 — download file from Supabase Storage
  logEntry(log, 'info', 'Downloading file from storage...', { storagePath });
  const { data: fileData, error: dlErr } = await admin.storage.from('uploads').download(storagePath);
  if (dlErr || !fileData) {
    logEntry(log, 'error', `Could not download file: ${dlErr?.message ?? 'unknown'}`);
    await flushLog();
    throw new Error(`Could not download file: ${dlErr?.message ?? 'unknown'}`);
  }

  // 6 — parse file
  const rows = await parseFile(fileData, storagePath);
  const rowCount = rows.length;
  logEntry(log, 'info', `File parsed: ${rowCount} data rows`, { rowCount, storagePath });
  await admin.from('upload_jobs').update({ row_count: rowCount }).eq('id', jobId);

  // 7 — process rows (journal entries are grouped into balanced batches)
  let processed = 0;
  let errors = 0;
  const allRecordNos: string[] = [];

  if (mapping.transaction_type === 'journal_entry') {
    // Group rows into balanced GLBATCHes by JOURNALID + date + description
    const { recordNos, rowErrors, processedCount, groupLog } = await submitGroupedJournalEntries(
      creds, mapping.column_mappings, rows, dateLocale, dryRun, resolvedSupdocId
    );
    allRecordNos.push(...recordNos);
    processed = processedCount;
    errors = rowErrors.length;

    // Merge group-level log entries
    log.push(...groupLog);

    for (const re of rowErrors) {
      await admin.from('job_errors').insert({
        job_id: jobId,
        tenant_id: tenantId,
        row_number: re.rowNumbers[0],
        error_message: re.message,
        raw_data: re.rawData,
      });
    }
  } else {
    // Row-by-row for AR invoices, AP bills, payments, expense reports etc.
    logEntry(log, 'info', `Processing ${rowCount} rows as ${mapping.transaction_type}`);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        if (dryRun) {
          processed++;
          logEntry(log, 'info', `[DRY RUN] Would submit row ${rowNum} to Intacct (skipped)`, { rowNum, transactionType: mapping.transaction_type });
        } else {
          const recordNo = await submitRow(creds, mapping.transaction_type, mapping.column_mappings, row, dateLocale, resolvedSupdocId);
          if (recordNo) {
            allRecordNos.push(recordNo);
            logEntry(log, 'success', `Row ${rowNum} submitted`, { rowNum, recordNo });
          } else {
            logEntry(log, 'success', `Row ${rowNum} submitted (no RECORDNO returned)`, { rowNum });
          }
          processed++;
        }
      } catch (err: unknown) {
        errors++;
        const msg = err instanceof Error ? err.message : 'Row processing error';
        logEntry(log, 'error', `Row ${rowNum} failed: ${msg}`, { rowNum });
        await admin.from('job_errors').insert({
          job_id: jobId,
          tenant_id: tenantId,
          row_number: rowNum,
          error_message: msg,
          raw_data: row as Record<string, unknown>,
        });
      }
      if ((i + 1) % 10 === 0) {
        await admin.from('upload_jobs').update({ processed_count: processed, error_count: errors }).eq('id', jobId);
      }
    }
  }

  // Store Intacct RECORDNOs and final log on the job
  logEntry(log, allRecordNos.length > 0 ? 'success' : 'warn',
    allRecordNos.length > 0
      ? `Complete. ${processed} rows submitted, ${errors} errors. Intacct RECORDNOs: ${allRecordNos.join(', ')}`
      : `Complete. ${processed} rows submitted, ${errors} errors. No RECORDNOs returned.`,
    { processed, errors, recordNos: allRecordNos }
  );

  const finalUpdate: Record<string, unknown> = {
    processing_log: log as unknown as Record<string, unknown>[],
  };
  if (allRecordNos.length > 0) finalUpdate.intacct_record_nos = allRecordNos;

  await admin.from('upload_jobs').update(finalUpdate).eq('id', jobId);

  return { processed, errors, recordNos: allRecordNos, entityIdUsed: effectiveEntityId };
}

// ── Grouped journal entry submission ─────────────────────────────────────────

interface RowError { rowNumbers: number[]; message: string; rawData: Record<string, unknown> }

async function submitGroupedJournalEntries(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  rows: RawRow[],
  dateLocale: 'uk' | 'us' = 'uk',
  dryRun = false,
  supdocId?: string
): Promise<{ recordNos: string[]; rowErrors: RowError[]; processedCount: number; groupLog: ProcessingLogEntry[] }> {
  const rowErrors: RowError[] = [];
  const recordNos: string[] = [];
  const groupLog: ProcessingLogEntry[] = [];

  // Step 1 — map all rows to Intacct field names via v2 pipeline engine
  type MappedRow = { mapped: Record<string, string>; rowNum: number; raw: RawRow };
  const mappedRows: MappedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    let rowOk = true;
    let mapped: Record<string, string> = {};

    try {
      mapped = mapRowV2(row as Record<string, string>, columnMappings, { dateLocale });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rowErrors.push({ rowNumbers: [rowNum], message, rawData: row });
      logEntry(groupLog, 'error', `Row ${rowNum}: ${message}`);
      rowOk = false;
    }
    if (rowOk) mappedRows.push({ mapped, rowNum, raw: row });
  }

  // Step 2 — group by JOURNALID + WHENCREATED + DESCRIPTION
  const groups = new Map<string, MappedRow[]>();
  for (const mr of mappedRows) {
    const key = [
      mr.mapped['JOURNALID']   ?? '',
      mr.mapped['WHENCREATED'] ?? '',
      mr.mapped['DESCRIPTION'] ?? '',
    ].join('\x00');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(mr);
  }

  logEntry(groupLog, 'info', `Grouped ${mappedRows.length} rows into ${groups.size} GLBATCH(es)`, {
    groups: Array.from(groups.values()).map(g => ({
      journalId:   g[0].mapped['JOURNALID']   ?? '(missing)',
      date:        g[0].mapped['WHENCREATED'] ?? '(missing)',
      description: g[0].mapped['DESCRIPTION'] ?? '(none)',
      lineCount:   g.length,
      rows:        g.map(r => r.rowNum),
    })),
  });

  // Step 3 — submit one GLBATCH per group
  let processedCount = 0;
  for (const groupRows of groups.values()) {
    const first = groupRows[0].mapped;
    const rowNumbers = groupRows.map(r => r.rowNum);

    const journalId   = first['JOURNALID'];
    const postingDate = first['WHENCREATED'];
    const description = first['DESCRIPTION'];

    if (!journalId) {
      rowErrors.push({ rowNumbers, message: 'JOURNALID is required for Journal Entry', rawData: groupRows[0].raw });
      logEntry(groupLog, 'error', `Rows ${rowNumbers.join(',')}: JOURNALID is missing`);
      continue;
    }
    if (!postingDate) {
      rowErrors.push({ rowNumbers, message: 'WHENCREATED (posting date) is required for Journal Entry', rawData: groupRows[0].raw });
      logEntry(groupLog, 'error', `Rows ${rowNumbers.join(',')}: WHENCREATED is missing`);
      continue;
    }

    const lines: JournalEntryLine[] = groupRows.map(r => {
      const m = r.mapped;
      const rawTrType = m['TR_TYPE'];
      const trType: '1' | '-1' = rawTrType === '-1' ? '-1' : '1';
      // Fall back to creds.entityId for locationId if the CSV row doesn't supply one.
      // This handles multi-entity companies where the entity ID is the valid Location dimension value.
      const locationId = m['LOCATIONID'] || creds.entityId;
      return {
        accountNo:    m['GLACCOUNTNO'],
        amount:       m['AMOUNT'],
        trType,
        memo:         m['MEMO'],
        locationId,
        departmentId: m['DEPARTMENTID'],
        projectId:    m['PROJECTID'],
        customerId:   m['CUSTOMERID'],
        vendorId:     m['VENDORID'],
        employeeId:   m['EMPLOYEEID'],
        itemId:       m['ITEMID'],
        classId:      m['CLASSID'],
      };
    });

    if (dryRun) {
      processedCount += groupRows.length;
      logEntry(groupLog, 'info', '[DRY RUN] Would submit GLBATCH to Intacct (skipped)', {
        journalId, postingDate, lineCount: lines.length,
        lines: lines.map(l => ({ accountNo: l.accountNo, amount: l.amount, trType: l.trType })),
      });
      continue; // skip actual API call
    }

    logEntry(groupLog, 'info', `Submitting GLBATCH to Intacct`, {
      journalId,
      postingDate,
      description: description ?? '(none)',
      lineCount: lines.length,
      lines: lines.map(l => ({ accountNo: l.accountNo, amount: l.amount, trType: l.trType, memo: l.memo, locationId: l.locationId ?? '(not set)', departmentId: l.departmentId ?? '(not set)' })),
    });

    try {
      const result = await createJournalEntry(creds, {
        journalId,
        postingDate,
        description,
        referenceNo: first['REFERENCENO'],
        supdocId:    supdocId ?? first['SUPDOCID'],
        lines,
      });

      if (!result.success) {
        const err = result.errors?.[0];
        const errMsg = err
          ? `${err.errorno}: ${err.description}${err.description2 ? ' — ' + err.description2 : ''}${err.correction ? ' — Correction: ' + err.correction : ''}`
          : 'Intacct rejected the entry';
        rowErrors.push({ rowNumbers, message: errMsg, rawData: groupRows[0].raw });
        logEntry(groupLog, 'error', `GLBATCH rejected by Intacct`, {
          journalId, postingDate,
          errors: result.errors,
          intacctRequestXml: result.requestXml ?? null,
          intacctRawXml: result.rawXml ?? null,
        });
      } else {
        processedCount += groupRows.length;
        if (result.recordNo) recordNos.push(result.recordNo);
        logEntry(groupLog, 'success', `GLBATCH accepted by Intacct`, {
          journalId,
          postingDate,
          recordNo: result.recordNo ?? '(not returned)',
          lineCount: lines.length,
          intacctRawResult: result.rawResult ?? null,
          intacctRawXml: result.rawXml ?? null,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      rowErrors.push({ rowNumbers, message: msg, rawData: groupRows[0].raw });
      logEntry(groupLog, 'error', `GLBATCH submission threw an exception: ${msg}`, { journalId, postingDate });
    }
  }

  return { recordNos, rowErrors, processedCount, groupLog };
}

async function notifyUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null | undefined,
  type: 'completed' | 'failed',
  opts: { filename: string; processed?: number; errors?: number; errorMessage?: string; jobId: string },
  branding?: { brand_name: string | null; support_email: string | null }
): Promise<void> {
  if (!userId) return;
  try {
    const { data: { user } } = await admin.auth.admin.getUserById(userId);
    const email = user?.email;
    if (!email) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const jobUrl = `${baseUrl}/jobs`;
    if (type === 'completed') {
      await sendJobCompletedEmail({ to: email, filename: opts.filename, processed: opts.processed ?? 0, errors: opts.errors ?? 0, jobUrl, branding });
    } else {
      await sendJobFailedEmail({ to: email, filename: opts.filename, errorMessage: opts.errorMessage ?? 'Unknown error', jobUrl, branding });
    }
  } catch {
    // Never let email failure crash the job
  }
}

async function notifyApprovalRequired(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  submittedBy: string | null | undefined,
  opts: { filename: string; jobId: string },
  branding?: { brand_name: string | null; support_email: string | null }
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const jobUrl = `${baseUrl}/jobs/${opts.jobId}`;

    // Get submitter email for "uploaded by" display
    let uploadedBy = 'a team member';
    if (submittedBy) {
      try {
        const { data: { user: submitter } } = await admin.auth.admin.getUserById(submittedBy);
        if (submitter?.email) uploadedBy = submitter.email;
      } catch { /* ignore */ }
    }

    // Fetch all tenant admins
    const { data: adminProfiles } = await admin
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'tenant_admin');

    if (!adminProfiles?.length) return;

    for (const adminProfile of adminProfiles) {
      try {
        const { data: { user: adminUser } } = await admin.auth.admin.getUserById(adminProfile.id);
        if (adminUser?.email) {
          await sendApprovalRequestEmail({
            to: adminUser.email,
            filename: opts.filename,
            uploadedBy,
            rowCount: null,
            jobUrl,
            branding,
          });
        }
      } catch { /* never let one admin email failure stop others */ }
    }
  } catch {
    // Never let email failure crash the job
  }
}

async function submitRow(
  creds: IntacctCredentials,
  txType: string,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us' = 'uk',
  supdocId?: string
): Promise<string | undefined> {
  if (txType === 'ar_invoice') {
    return submitArInvoice(creds, columnMappings, row, dateLocale, supdocId);
  } else if (txType === 'ap_bill') {
    return submitApBill(creds, columnMappings, row, dateLocale, supdocId);
  } else if (txType === 'ar_payment') {
    return submitArPayment(creds, columnMappings, row, dateLocale);
  } else if (txType === 'ap_payment') {
    return submitApPayment(creds, columnMappings, row, dateLocale);
  } else if (txType === 'expense_report') {
    return submitExpenseReport(creds, columnMappings, row, dateLocale);
  } else if (txType === 'timesheet') {
    return submitTimesheet(creds, columnMappings, row, dateLocale);
  } else if (txType === 'vendor') {
    return submitVendor(creds, columnMappings, row, dateLocale);
  } else if (txType === 'customer') {
    return submitCustomer(creds, columnMappings, row, dateLocale);
  } else {
    throw new Error(`Transaction type '${txType}' processing is not yet implemented`);
  }
}

/** Map a raw CSV row to Intacct field names using the v2 pipeline engine. */
function mapRow(
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Record<string, string> {
  return mapRowV2(row as Record<string, string>, columnMappings, { dateLocale });
}

async function submitArInvoice(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us',
  supdocId?: string
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['CUSTOMERID'])  throw new Error('CUSTOMERID is required for AR Invoice');
  if (!mapped['WHENCREATED']) throw new Error('WHENCREATED (posting date) is required for AR Invoice');
  if (!mapped['GLACCOUNTNO']) throw new Error('GLACCOUNTNO is required for AR Invoice line');
  if (!mapped['AMOUNT'])      throw new Error('AMOUNT is required for AR Invoice line');

  const line: ArInvoiceLine = {
    accountNo:    mapped['GLACCOUNTNO'],
    amount:       mapped['AMOUNT'],
    memo:         mapped['MEMO'],
    locationId:   mapped['LOCATIONID'] || creds.entityId,
    departmentId: mapped['DEPARTMENTID'],
    projectId:    mapped['PROJECTID'],
    classId:      mapped['CLASSID'],
  };

  const result = await createArInvoice(creds, {
    customerId:   mapped['CUSTOMERID'],
    postingDate:  mapped['WHENCREATED'],
    dueDate:      mapped['WHENDUE'],
    description:  mapped['DESCRIPTION'],
    referenceNo:  mapped['REFERENCENO'],
    currency:     mapped['CURRENCY'],
    supdocId:     supdocId ?? mapped['SUPDOCID'],
    lines: [line],
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the AR invoice');
  }
  return result.recordNo;
}

async function submitApBill(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us',
  supdocId?: string
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['VENDORID'])    throw new Error('VENDORID is required for AP Bill');
  if (!mapped['WHENPOSTED'])  throw new Error('WHENPOSTED (posting date) is required for AP Bill');
  if (!mapped['GLACCOUNTNO']) throw new Error('GLACCOUNTNO is required for AP Bill line');
  if (!mapped['AMOUNT'])      throw new Error('AMOUNT is required for AP Bill line');

  const line: ApBillLine = {
    accountNo:    mapped['GLACCOUNTNO'],
    amount:       mapped['AMOUNT'],
    memo:         mapped['MEMO'],
    locationId:   mapped['LOCATIONID'] || creds.entityId,
    departmentId: mapped['DEPARTMENTID'],
    projectId:    mapped['PROJECTID'],
    classId:      mapped['CLASSID'],
  };

  const result = await createApBill(creds, {
    vendorId:    mapped['VENDORID'],
    postingDate: mapped['WHENPOSTED'],
    dueDate:     mapped['WHENDUE'],
    description: mapped['DESCRIPTION'],
    referenceNo: mapped['REFERENCENO'],
    currency:    mapped['CURRENCY'],
    supdocId:    supdocId ?? mapped['SUPDOCID'],
    lines: [line],
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the AP bill');
  }
  return result.recordNo;
}

async function submitArPayment(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['CUSTOMERID'])  throw new Error('CUSTOMERID is required for AR Payment');
  if (!mapped['PAYMENTDATE']) throw new Error('PAYMENTDATE is required for AR Payment');
  if (!mapped['AMOUNT'])      throw new Error('AMOUNT is required for AR Payment');

  const result = await createArPayment(creds, {
    customerId:    mapped['CUSTOMERID'],
    paymentDate:   mapped['PAYMENTDATE'],
    amount:        mapped['AMOUNT'],
    paymentMethod: mapped['PAYMENTMETHOD'] || undefined,
    bankAccountId: mapped['FINANCIALENTITY'] || undefined,
    description:   mapped['DESCRIPTION'] || undefined,
    referenceNo:   mapped['REFERENCENO'] || undefined,
    currency:      mapped['CURRENCY'] || undefined,
    locationId:    mapped['LOCATIONID'] || creds.entityId,
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the AR payment');
  }
  return result.recordNo;
}

async function submitApPayment(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['VENDORID'])    throw new Error('VENDORID is required for AP Payment');
  if (!mapped['PAYMENTDATE']) throw new Error('PAYMENTDATE is required for AP Payment');
  if (!mapped['AMOUNT'])      throw new Error('AMOUNT is required for AP Payment');

  const result = await createApPayment(creds, {
    vendorId:      mapped['VENDORID'],
    paymentDate:   mapped['PAYMENTDATE'],
    amount:        mapped['AMOUNT'],
    paymentMethod: mapped['PAYMENTMETHOD'] || undefined,
    bankAccountId: mapped['FINANCIALENTITY'] || undefined,
    description:   mapped['DESCRIPTION'] || undefined,
    referenceNo:   mapped['REFERENCENO'] || undefined,
    currency:      mapped['CURRENCY'] || undefined,
    locationId:    mapped['LOCATIONID'] || creds.entityId,
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the AP payment');
  }
  return result.recordNo;
}

async function submitExpenseReport(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['EMPLOYEEID'])   throw new Error('EMPLOYEEID is required for Expense Report');
  if (!mapped['WHENCREATED'])  throw new Error('WHENCREATED (report date) is required for Expense Report');
  if (!mapped['EXPENSETYPE'])  throw new Error('EXPENSETYPE is required for Expense Report line');
  if (!mapped['AMOUNT'])       throw new Error('AMOUNT is required for Expense Report line');

  const line: ExpenseReportLine = {
    expenseType:  mapped['EXPENSETYPE'],
    amount:       mapped['AMOUNT'],
    expenseDate:  mapped['EXPENSEDATE'] || undefined,
    memo:         mapped['MEMO'] || undefined,
    locationId:   mapped['LOCATIONID'] || creds.entityId,
    departmentId: mapped['DEPARTMENTID'] || undefined,
    projectId:    mapped['PROJECTID'] || undefined,
    classId:      mapped['CLASSID'] || undefined,
    billable:     mapped['BILLABLE'] ? mapped['BILLABLE'] === 'true' : undefined,
    reimbursable: mapped['REIMBURSABLE'] ? mapped['REIMBURSABLE'] === 'true' : undefined,
  };

  const result = await createExpenseReport(creds, {
    employeeId:  mapped['EMPLOYEEID'],
    reportDate:  mapped['WHENCREATED'],
    description: mapped['DESCRIPTION'] || undefined,
    referenceNo: mapped['REFERENCENO'] || undefined,
    currency:    mapped['CURRENCY'] || undefined,
    lines: [line],
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the expense report');
  }
  return result.recordNo;
}

async function submitTimesheet(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['EMPLOYEEID']) throw new Error('EMPLOYEEID is required for Timesheet');
  if (!mapped['BEGINDATE'])  throw new Error('BEGINDATE (week start date) is required for Timesheet');
  if (!mapped['QTY'])        throw new Error('QTY (hours) is required for Timesheet entry');

  const line: TimesheetLine = {
    projectId:    mapped['PROJECTID']    || undefined,
    taskId:       mapped['TASKKEY']      || undefined,
    timetype:     mapped['TIMETYPE']     || undefined,
    quantity:     mapped['QTY'],
    memo:         mapped['MEMO']         || undefined,
    locationId:   mapped['LOCATIONID']   || creds.entityId,
    departmentId: mapped['DEPARTMENTID'] || undefined,
    classId:      mapped['CLASSID']      || undefined,
  };

  const result = await createTimesheet(creds, {
    employeeId:    mapped['EMPLOYEEID'],
    weekStartDate: mapped['BEGINDATE'],
    description:   mapped['DESCRIPTION'] || undefined,
    lines: [line],
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the timesheet');
  }
  return result.recordNo;
}

async function submitVendor(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['VENDORID']) throw new Error('VENDORID is required for Vendor');
  if (!mapped['NAME'])     throw new Error('NAME (vendor name) is required for Vendor');

  const result = await createVendor(creds, {
    vendorId:      mapped['VENDORID'],
    name:          mapped['NAME'],
    email:         mapped['EMAIL1']        || undefined,
    phone:         mapped['PHONE1']        || undefined,
    currency:      mapped['CURRENCY']      || undefined,
    paymentMethod: mapped['PAYMENTMETHOD'] || undefined,
    taxId:         mapped['TAXID']         || undefined,
    notes:         mapped['NOTES']         || undefined,
    addressLine1:  mapped['ADDRESS1']      || undefined,
    addressLine2:  mapped['ADDRESS2']      || undefined,
    city:          mapped['CITY']          || undefined,
    state:         mapped['STATE']         || undefined,
    zip:           mapped['ZIP']           || undefined,
    country:       mapped['COUNTRY']       || undefined,
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the vendor');
  }
  return result.recordNo;
}

async function submitCustomer(
  creds: IntacctCredentials,
  columnMappings: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  row: RawRow,
  dateLocale: 'uk' | 'us'
): Promise<string | undefined> {
  const mapped = mapRow(columnMappings, row, dateLocale);

  if (!mapped['CUSTOMERID']) throw new Error('CUSTOMERID is required for Customer');
  if (!mapped['NAME'])       throw new Error('NAME (customer name) is required for Customer');

  const result = await createCustomer(creds, {
    customerId:   mapped['CUSTOMERID'],
    name:         mapped['NAME'],
    email:        mapped['EMAIL1']      || undefined,
    phone:        mapped['PHONE1']      || undefined,
    currency:     mapped['CURRENCY']    || undefined,
    creditLimit:  mapped['CREDITLIMIT'] || undefined,
    paymentTerm:  mapped['TERMNAME']    || undefined,
    taxId:        mapped['TAXID']       || undefined,
    notes:        mapped['NOTES']       || undefined,
    addressLine1: mapped['ADDRESS1']    || undefined,
    addressLine2: mapped['ADDRESS2']    || undefined,
    city:         mapped['CITY']        || undefined,
    state:        mapped['STATE']       || undefined,
    zip:          mapped['ZIP']         || undefined,
    country:      mapped['COUNTRY']     || undefined,
  });

  if (!result.success) {
    const err = result.errors?.[0];
    throw new Error(err ? `${err.errorno}: ${err.description}` : 'Intacct rejected the customer');
  }
  return result.recordNo;
}

// ── Date normalisation ────────────────────────────────────────────────────────

/**
 * Normalise a date string to YYYY-MM-DD.
 *
 * Priority order:
 *   1. Already ISO (YYYY-MM-DD) → pass through
 *   2. YYYY/MM/DD → convert
 *   3. Excel serial number (40000–60000) → convert
 *   4. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY  (UK default)
 *      MM/DD/YYYY or MM-DD-YYYY or MM.DD.YYYY  (US when dateLocale='us')
 *      Ambiguous cases (both a & b ≤ 12) resolved by locale.
 *   5. 2-digit year: ≤30 → 20xx, else → 19xx
 *   6. Unrecognised → return unchanged (Intacct will reject with a clear error)
 */
function normaliseDate(value: string, locale: 'uk' | 'us'): string {
  if (!value) return value;

  // 1. Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // 2. YYYY/MM/DD
  const isoSlash = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlash) return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;

  // 3. Excel serial number
  const serial = Number(value);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  // 4 & 5. Two-part date: d1 SEP d2 SEP year  (SEP = / - .)
  const parts = value.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (!parts) return value;

  const [, a, b, yearRaw] = parts;
  const year = yearRaw.length === 2
    ? (parseInt(yearRaw, 10) <= 30 ? `20${yearRaw}` : `19${yearRaw}`)
    : yearRaw;

  const aNum = parseInt(a, 10);
  const bNum = parseInt(b, 10);

  let day: string, month: string;
  if (locale === 'us') {
    // MM/DD/YYYY — unless a > 12 (must be day), treat a as month
    [month, day] = aNum > 12 ? [b, a] : [a, b];
  } else {
    // DD/MM/YYYY (UK/EU) — unless b > 12 (must be day), treat a as day
    [day, month] = bNum > 12 ? [b, a] : [a, b];
  }

  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return value;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ── Field transform (v1 legacy — kept for reference only) ────────────────────
// Actual transformation is now handled by the v2 pipeline engine (execute.ts).
// This function is no longer called in production paths.

async function parseFile(blob: Blob, path: string): Promise<RawRow[]> {
  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const text = await blob.text();
    const result = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
    return result.data;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' });
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
