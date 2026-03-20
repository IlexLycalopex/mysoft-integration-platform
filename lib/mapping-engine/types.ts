/**
 * Mapping Engine v2 — Type Definitions
 *
 * ColumnMappingEntryV2 is fully backward-compatible with v1 ColumnMappingEntry.
 * V1 entries (no `steps` array) are automatically shimmed by compat.ts.
 */

import type { MappingTransform } from '@/types/database';

// ── Condition (used by the `if` step) ────────────────────────────────────────

export type IfOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'empty' | 'not_empty'
  | 'matches_regex';

export interface IfCondition {
  operator: IfOperator;
  /** RHS of comparison — not needed for empty / not_empty */
  value?: string;
}

// ── Transform Steps ──────────────────────────────────────────────────────────

export type TransformStep =
  // ── String transforms ──────────────────────────────────────────────────────
  | { type: 'trim' }
  | { type: 'uppercase' }
  | { type: 'lowercase' }
  | { type: 'strip_currency' }                           // removes £ $ € ¥ and commas
  | { type: 'replace'; find: string; replacement: string; all?: boolean }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'regex_replace'; pattern: string; replacement: string }
  | { type: 'pad_left';  length: number; char?: string } // zero-pad reference codes
  | { type: 'pad_right'; length: number; char?: string }
  | { type: 'substring'; start: number; end?: number }   // slice
  | { type: 'split_take'; delimiter: string; index: number } // "Smith, John" → "Smith"

  // ── Numeric transforms ─────────────────────────────────────────────────────
  | { type: 'decimal'; precision?: number }              // parse → fixed N decimals (default 2)
  | { type: 'number_abs' }                               // absolute value
  | { type: 'number_negate' }                            // multiply by -1
  | { type: 'multiply'; factor: number }                 // scale (e.g. pence→pounds: 0.01)

  // ── Domain transforms ──────────────────────────────────────────────────────
  | { type: 'date_format'; locale?: 'uk' | 'us' | 'iso' | 'auto' }
  | { type: 'boolean_to_int' }                           // yes/true/1 → 1, no/false/0 → 0
  | { type: 'tr_type' }                                  // debit/credit → 1/-1

  // ── Multi-source steps ─────────────────────────────────────────────────────
  | { type: 'concat';   columns: string[]; separator?: string } // joins source + other cols
  | { type: 'coalesce'; columns: string[] }              // first non-empty of listed cols

  // ── Lookup / static ────────────────────────────────────────────────────────
  | { type: 'lookup'; table: Record<string, string>; fallback?: 'passthrough' | 'error' | 'empty' }
  | { type: 'static'; value: string }                    // always produce this value

  // ── Formula ───────────────────────────────────────────────────────────────
  | { type: 'formula'; expression: string }              // safe expression (no eval)

  // ── Conditional ───────────────────────────────────────────────────────────
  | { type: 'if'; condition: IfCondition; then_steps: TransformStep[]; else_steps?: TransformStep[] };

// ── Step type labels (for UI) ────────────────────────────────────────────────

export const STEP_TYPE_LABELS: Record<string, string> = {
  trim:            'Trim whitespace',
  uppercase:       'Uppercase',
  lowercase:       'Lowercase',
  strip_currency:  'Strip currency symbols (£ $ € ¥)',
  replace:         'Find & replace',
  regex_extract:   'Extract with regex',
  regex_replace:   'Replace with regex',
  pad_left:        'Pad left (zero-pad)',
  pad_right:       'Pad right',
  substring:       'Substring / slice',
  split_take:      'Split & take index',
  decimal:         'Parse as decimal number',
  number_abs:      'Absolute value',
  number_negate:   'Negate (× -1)',
  multiply:        'Multiply by factor',
  date_format:     'Parse date format',
  boolean_to_int:  'Boolean → integer (yes/no → 1/0)',
  tr_type:         'Debit/Credit → 1/-1',
  concat:          'Concatenate columns',
  coalesce:        'Coalesce (first non-empty)',
  lookup:          'Lookup table (map values)',
  static:          'Static value (override)',
  formula:         'Formula / expression',
  if:              'Conditional (if / then / else)',
};

export const STEP_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'String', types: ['trim', 'uppercase', 'lowercase', 'strip_currency', 'replace', 'regex_extract', 'regex_replace', 'pad_left', 'pad_right', 'substring', 'split_take'] },
  { label: 'Numeric', types: ['decimal', 'number_abs', 'number_negate', 'multiply'] },
  { label: 'Domain', types: ['date_format', 'boolean_to_int', 'tr_type'] },
  { label: 'Multi-source', types: ['concat', 'coalesce'] },
  { label: 'Logic', types: ['lookup', 'static', 'formula', 'if'] },
];

// ── Mapping Entry v2 ─────────────────────────────────────────────────────────

export interface ColumnMappingEntryV2 {
  id: string;

  /** Primary source CSV column name. Can be empty if using a multi-source first step. */
  source_column?: string;

  /** Intacct target field key (e.g. JOURNALID, AMOUNT) */
  target_field: string;

  /** Whether to fail the row if this field is empty after the pipeline */
  required: boolean;

  /** V1 legacy transform — only used when steps is empty (compat shim) */
  transform?: MappingTransform;

  /** Ordered pipeline steps applied left-to-right */
  steps: TransformStep[];

  /** Behaviour when the pipeline produces an empty value */
  on_empty: 'error' | 'skip' | 'default' | 'null';

  /** Used when on_empty = 'default' */
  default_value?: string;

  /** Display label for this row (shown in UI instead of source_column) */
  label?: string;

  /** Internal documentation for this mapping row */
  notes?: string;

  /**
   * Row-level inheritance tracking — only present when mapping.inheritance_mode = 'inherit'.
   * 'inherited'  = using platform version exactly; will receive platform updates automatically
   * 'customized' = tenant has modified this row
   * 'added'      = tenant-added row not in the platform template
   * 'conflict'   = platform updated this row but tenant also modified it; resolution required
   */
  override_state?: 'inherited' | 'customized' | 'added' | 'conflict';
}

// ── Pipeline Context ─────────────────────────────────────────────────────────

export interface PipelineContext {
  /** Tenant date locale for date_format steps */
  dateLocale: 'uk' | 'us';
  /** When true, every step records its input→output for the trace */
  preview?: boolean;
}

// ── Pipeline Result ───────────────────────────────────────────────────────────

export interface StepTrace {
  step: TransformStep;
  input: string;
  output: string;
  error?: string;
}

export interface PipelineResult {
  /** Final output value (undefined if skip=true) */
  value?: string;
  /** True when on_empty=skip and value was empty */
  skip?: boolean;
  /** Error message if the pipeline threw (preview mode only — otherwise re-thrown) */
  error?: string;
  /** Step-by-step trace (populated when context.preview=true) */
  trace?: StepTrace[];
}

// ── Bulk preview ─────────────────────────────────────────────────────────────

export interface PreviewRow {
  rowNum: number;
  raw: Record<string, string>;
  results: Record<string, PreviewCell>;
}

export interface PreviewCell {
  value: string;
  skip: boolean;
  error?: string;
  trace?: StepTrace[];
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface MappingValidationError {
  rowIndex: number;
  field: keyof ColumnMappingEntryV2 | string;
  message: string;
}
