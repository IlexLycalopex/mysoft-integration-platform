/**
 * Parse Step — Convert source file into job_items rows
 *
 * Downloads the file from Supabase Storage, parses CSV/XLSX,
 * and upserts one job_item per data row.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { StepExecutor, StepContext } from './types';
import type { StepResult } from '@/lib/jobs/types';

export const parseStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, admin, events } = ctx;

    await events.info('step_started', 'Downloading file from storage', { storagePath: job.storage_path });

    // Download file from Supabase Storage
    const { data: fileData, error: dlErr } = await admin.storage
      .from('uploads')
      .download(job.storage_path);

    if (dlErr || !fileData) {
      return {
        success: false,
        error: {
          category: 'transient',
          code:     'STORAGE_DOWNLOAD_FAILED',
          message:  `Could not download file: ${dlErr?.message ?? 'unknown'}`,
        },
      };
    }

    // Parse file into rows
    let rows: Record<string, string>[];
    try {
      rows = await parseFile(fileData, job.storage_path);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          category: 'data',
          code:     'FILE_PARSE_FAILED',
          message,
        },
      };
    }

    const rowCount = rows.length;
    await events.info('item_parsed', `File parsed: ${rowCount} data rows`, { rowCount });

    // Update row_count on the job
    await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('upload_jobs')
      .update({ row_count: rowCount })
      .eq('id', job.id);

    // Upsert job_items — one per data row
    if (rowCount === 0) {
      return {
        success: false,
        error: { category: 'data', code: 'EMPTY_FILE', message: 'File contains no data rows' },
      };
    }

    const itemInserts = rows.map((row, idx) => ({
      job_id:           job.id,
      tenant_id:        job.tenant_id,
      item_sequence:    idx + 1,
      source_row_number: idx + 2,           // row 1 = header
      status:           'parsed' as const,
      metadata_json:    { raw_row: row },
    }));

    const { data: insertedItems, error: insertErr } = await (admin as any)
      .from('job_items')
      .insert(itemInserts)
      .select('*')
      .returns();

    if (insertErr || !insertedItems) {
      return {
        success: false,
        error: {
          category: 'system',
          code:     'ITEM_INSERT_FAILED',
          message:  `Failed to create job items: ${insertErr?.message}`,
        },
      };
    }

    return {
      success:  true,
      items:    insertedItems,
      metrics:  { row_count: rowCount },
      metadata: { parsed_at: new Date().toISOString() },
    };
  },
};

// ── File parsers ──────────────────────────────────────────────────────────────

async function parseFile(blob: Blob, path: string): Promise<Record<string, string>[]> {
  const ext = path.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const text = await blob.text();
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    if (result.errors.length > 0) {
      const fatal = result.errors.find(e => (e.type as string) === 'Delimiter' || (e.type as string) === 'Abort');
      if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
    }
    return result.data;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await blob.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
  }

  throw new Error(`Unsupported file type: .${ext ?? 'unknown'}. Please upload a CSV or XLSX file.`);
}
