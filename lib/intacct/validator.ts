import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ValidationError {
  code: string;
  message: string;
  rows?: number[];
  column?: string;
}

export interface BalanceGroup {
  key: string;        // journalId + date + description
  journalId: string;
  date: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  rowNumbers: number[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  rowCount: number;
  detectedColumns: string[];
  missingRequired: string[];
  unmappedSourceColumns: string[];
  balanceGroups?: BalanceGroup[];  // only for journal_entry type
}

export interface ColumnMappingEntry {
  source_column: string;
  target_field: string;
  required: boolean;
  transform: string;
}

export async function validateFile(
  blob: Blob,
  filename: string,
  columnMappings: ColumnMappingEntry[],
  transactionType: string
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Parse the file
  let rows: Record<string, string>[];
  try {
    rows = await parseToRows(blob, filename);
  } catch (e) {
    return {
      valid: false,
      errors: [{ code: 'PARSE_ERROR', message: `Could not parse file: ${e instanceof Error ? e.message : 'unknown error'}` }],
      warnings: [],
      rowCount: 0,
      detectedColumns: [],
      missingRequired: [],
      unmappedSourceColumns: [],
    };
  }

  if (rows.length === 0) {
    return {
      valid: false,
      errors: [{ code: 'EMPTY_FILE', message: 'The file contains no data rows.' }],
      warnings: [],
      rowCount: 0,
      detectedColumns: [],
      missingRequired: [],
      unmappedSourceColumns: [],
    };
  }

  const detectedColumns = Object.keys(rows[0]);

  // 2. Required column check
  const requiredMappings = columnMappings.filter(cm => cm.required && cm.target_field);
  const missingRequired: string[] = [];
  for (const cm of requiredMappings) {
    if (!detectedColumns.includes(cm.source_column)) {
      missingRequired.push(cm.source_column);
      errors.push({
        code: 'MISSING_REQUIRED_COLUMN',
        message: `Required column "${cm.source_column}" (→ ${cm.target_field}) not found in file.`,
        column: cm.source_column,
      });
    }
  }

  // 3. Unmapped columns (informational warning)
  const mappedSourceCols = new Set(columnMappings.map(cm => cm.source_column));
  const unmappedSourceColumns = detectedColumns.filter(c => !mappedSourceCols.has(c));
  if (unmappedSourceColumns.length > 0) {
    warnings.push({
      code: 'UNMAPPED_COLUMNS',
      message: `These columns are in the file but not in the mapping (they will be ignored): ${unmappedSourceColumns.join(', ')}`,
    });
  }

  // 4. Row-level checks: empty required cells, bad amounts, bad dates
  const amountColumns = columnMappings.filter(cm => cm.transform === 'decimal').map(cm => cm.source_column);
  const dateColumns = columnMappings.filter(cm => cm.transform === 'date_format').map(cm => cm.source_column);

  const emptyRequiredByCol: Record<string, number[]> = {};
  const badAmountRows: Record<string, number[]> = {};
  const badDateRows: Record<string, number[]> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based + header row

    // Empty required cells (only for columns present in the file)
    for (const cm of requiredMappings) {
      if (detectedColumns.includes(cm.source_column)) {
        const val = row[cm.source_column]?.trim() ?? '';
        if (!val) {
          if (!emptyRequiredByCol[cm.source_column]) emptyRequiredByCol[cm.source_column] = [];
          emptyRequiredByCol[cm.source_column].push(rowNum);
        }
      }
    }

    // Amount sanity check
    for (const col of amountColumns) {
      if (detectedColumns.includes(col)) {
        const raw = row[col]?.trim() ?? '';
        if (raw) {
          const n = parseFloat(raw.replace(/[£$€,]/g, ''));
          if (isNaN(n)) {
            if (!badAmountRows[col]) badAmountRows[col] = [];
            badAmountRows[col].push(rowNum);
          }
        }
      }
    }

    // Date sanity check
    for (const col of dateColumns) {
      if (detectedColumns.includes(col)) {
        const raw = row[col]?.trim() ?? '';
        if (raw && !looksLikeDate(raw)) {
          if (!badDateRows[col]) badDateRows[col] = [];
          badDateRows[col].push(rowNum);
        }
      }
    }
  }

  for (const [col, rowNums] of Object.entries(emptyRequiredByCol)) {
    errors.push({
      code: 'EMPTY_REQUIRED_CELL',
      message: `Required column "${col}" is empty in ${rowNums.length} row(s).`,
      column: col,
      rows: rowNums.slice(0, 10),
    });
  }

  for (const [col, rowNums] of Object.entries(badAmountRows)) {
    errors.push({
      code: 'INVALID_AMOUNT',
      message: `Column "${col}" has non-numeric values in ${rowNums.length} row(s).`,
      column: col,
      rows: rowNums.slice(0, 5),
    });
  }

  for (const [col, rowNums] of Object.entries(badDateRows)) {
    warnings.push({
      code: 'UNRECOGNISED_DATE',
      message: `Column "${col}" has values that may not parse as dates in ${rowNums.length} row(s). Accepted formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD.`,
      column: col,
      rows: rowNums.slice(0, 5),
    });
  }

  // 5. Balance check for journal entries
  let balanceGroups: BalanceGroup[] | undefined;
  if (transactionType === 'journal_entry' && missingRequired.length === 0) {
    balanceGroups = checkJournalBalance(rows, columnMappings);
    const unbalanced = balanceGroups.filter(g => !g.balanced);
    for (const g of unbalanced) {
      errors.push({
        code: 'UNBALANCED_JOURNAL',
        message: `Journal group "${g.journalId} / ${g.date} / ${g.description || '(no description)'}" is not balanced. Debits: ${g.totalDebit.toFixed(2)}, Credits: ${g.totalCredit.toFixed(2)}.`,
        rows: g.rowNumbers,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: rows.length,
    detectedColumns,
    missingRequired,
    unmappedSourceColumns,
    balanceGroups,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function parseToRows(blob: Blob, filename: string): Promise<Record<string, string>[]> {
  const ext = filename.split('.').pop()?.toLowerCase();
  const buffer = await blob.arrayBuffer();

  if (ext === 'csv') {
    const text = new TextDecoder().decode(buffer);
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
    });
    return result.data;
  }

  // XLSX / XLS
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
  return json.map(row => {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) cleaned[k.trim()] = String(v);
    return cleaned;
  });
}

function looksLikeDate(value: string): boolean {
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(value)) return true;
  // Excel serial
  if (/^\d{5}$/.test(value)) return true;
  return false;
}

function getMapping(columnMappings: ColumnMappingEntry[], targetField: string): string | undefined {
  return columnMappings.find(cm => cm.target_field === targetField)?.source_column;
}

function checkJournalBalance(
  rows: Record<string, string>[],
  columnMappings: ColumnMappingEntry[]
): BalanceGroup[] {
  const journalCol     = getMapping(columnMappings, 'JOURNALID');
  const dateCol        = getMapping(columnMappings, 'WHENCREATED');
  const descCol        = getMapping(columnMappings, 'DESCRIPTION');
  const amountCol      = getMapping(columnMappings, 'AMOUNT');
  const trTypeCol      = getMapping(columnMappings, 'TR_TYPE');

  if (!journalCol || !dateCol || !amountCol || !trTypeCol) return [];

  const groups = new Map<string, BalanceGroup>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const journalId   = (row[journalCol] ?? '').trim();
    const date        = (row[dateCol] ?? '').trim();
    const description = descCol ? (row[descCol] ?? '').trim() : '';
    const amountRaw   = (row[amountCol] ?? '').trim();
    const trTypeRaw   = (row[trTypeCol] ?? '').trim().toLowerCase();

    const key = `${journalId}\x00${date}\x00${description}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, journalId, date, description,
        totalDebit: 0, totalCredit: 0, balanced: false, rowNumbers: [],
      });
    }

    const g = groups.get(key)!;
    g.rowNumbers.push(rowNum);

    const amount = parseFloat(amountRaw.replace(/[£$€,]/g, ''));
    if (!isNaN(amount)) {
      const isCredit = ['credit', 'cr', '-1'].includes(trTypeRaw);
      if (isCredit) g.totalCredit += amount;
      else           g.totalDebit  += amount;
    }
  }

  for (const g of groups.values()) {
    g.balanced = Math.abs(g.totalDebit - g.totalCredit) < 0.005;
  }

  return Array.from(groups.values());
}
