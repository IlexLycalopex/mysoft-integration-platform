/**
 * Mapping Engine v2 — Bulk Preview Runner
 *
 * Runs a full mapping definition against multiple sample rows
 * and returns per-cell results with step traces.
 *
 * Pure function — runs in the browser without any server calls.
 */

import type { ColumnMappingEntryV2, PipelineContext, PreviewRow, PreviewCell } from './types';
import type { ColumnMappingEntry } from '@/types/database';
import { applyPipeline } from './execute';
import { normaliseEntry } from './compat';

/**
 * Run all mapping entries against an array of sample rows.
 *
 * @param rows     Raw data rows (array of {columnName: value} objects)
 * @param entries  The mapping entries (v1 or v2)
 * @param context  Pipeline context (dateLocale, preview=true automatically set)
 * @returns        One PreviewRow per input row, with per-field results
 */
export function runPreview(
  rows: Record<string, string>[],
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  context: Omit<PipelineContext, 'preview'>,
): PreviewRow[] {
  const ctx: PipelineContext = { ...context, preview: true };

  return rows.map((raw, idx) => {
    const results: Record<string, PreviewCell> = {};

    for (const rawEntry of entries) {
      const entry = normaliseEntry(rawEntry);
      if (!entry.target_field) continue;

      const result = applyPipeline(raw, entry, ctx);

      results[entry.target_field] = {
        value:  result.value ?? '',
        skip:   result.skip ?? false,
        error:  result.error,
        trace:  result.trace,
      };
    }

    return { rowNum: idx + 2, raw, results };
  });
}

/**
 * Parse a pasted CSV string into rows.
 * Returns [headers, ...dataRows].
 * Handles quoted fields, commas within quotes, and Windows line endings.
 */
export function parsePastedCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current); current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cells = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });

  return { headers, rows };
}
