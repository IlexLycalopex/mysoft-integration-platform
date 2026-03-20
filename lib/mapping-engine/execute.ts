/**
 * Mapping Engine v2 — Pipeline Execution Engine
 *
 * Pure TypeScript — no server imports, no Node.js APIs.
 * Safe to import in both browser (preview UI) and server (processor.ts).
 *
 * Entry points:
 *   applyPipeline(row, entry, context) → PipelineResult
 *   applyPipelineAll(row, entries, context) → Record<string, PipelineResult>
 */

import type {
  ColumnMappingEntryV2,
  TransformStep,
  IfCondition,
  PipelineContext,
  PipelineResult,
  StepTrace,
} from './types';
import type { ColumnMappingEntry } from '@/types/database';
import { normaliseEntry } from './compat';
import { evaluateFormula } from './formula';

// ── Date normalisation (duplicated here to keep this file dependency-free) ───

function normaliseDate(value: string, locale: 'uk' | 'us' | 'iso' | 'auto'): string {
  const v = value.trim();
  if (!v) return v;

  // Already ISO  YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // ISO with time component — strip time
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);

  // Various separators: / - .
  const parts = v.split(/[\/\-\.]/).map(p => p.trim());
  if (parts.length !== 3) return v;

  const [a, b, c] = parts;

  let year: string, month: string, day: string;

  // 4-digit year in position 0 → unambiguous ISO-like  YYYY/MM/DD
  if (a.length === 4) {
    [year, month, day] = [a, b, c];
  } else if (c.length === 4) {
    // DD/MM/YYYY or MM/DD/YYYY
    year = c;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);

    if (locale === 'auto') {
      // If a > 12 it must be day; if b > 12 it must be day (but then a = month)
      if (aNum > 12) { day = a; month = b; }
      else if (bNum > 12) { month = a; day = b; }
      else { day = a; month = b; } // assume UK (day first) when ambiguous
    } else if (locale === 'us') {
      [month, day] = [a, b];
    } else {
      // uk / iso default
      [day, month] = [a, b];
    }
  } else {
    return v; // unrecognised format — pass through
  }

  const m = parseInt(month, 10);
  const d = parseInt(day,   10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return v;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function evaluateCondition(condition: IfCondition, value: string): boolean {
  const { operator, value: rhs = '' } = condition;
  switch (operator) {
    case 'eq':           return value === rhs;
    case 'neq':          return value !== rhs;
    case 'contains':     return value.includes(rhs);
    case 'not_contains': return !value.includes(rhs);
    case 'starts_with':  return value.startsWith(rhs);
    case 'ends_with':    return value.endsWith(rhs);
    case 'empty':        return !value.trim();
    case 'not_empty':    return Boolean(value.trim());
    case 'gt':           return parseFloat(value) > parseFloat(rhs);
    case 'lt':           return parseFloat(value) < parseFloat(rhs);
    case 'gte':          return parseFloat(value) >= parseFloat(rhs);
    case 'lte':          return parseFloat(value) <= parseFloat(rhs);
    case 'matches_regex':
      try { return new RegExp(rhs).test(value); } catch { return false; }
    default: return false;
  }
}

// ── Step executor ─────────────────────────────────────────────────────────────

export function applyStep(
  current: string,
  step: TransformStep,
  row: Record<string, string>,
  context: PipelineContext,
): string {
  switch (step.type) {
    // ── String ──────────────────────────────────────────────────────────────
    case 'trim':           return current.trim();
    case 'uppercase':      return current.toUpperCase();
    case 'lowercase':      return current.toLowerCase();
    case 'strip_currency': return current.replace(/[£$€¥]/g, '').replace(/,/g, '').trim();

    case 'replace': {
      if (step.all) return current.split(step.find).join(step.replacement);
      return current.replace(step.find, step.replacement);
    }

    case 'regex_extract': {
      try {
        const re = new RegExp(step.pattern);
        const match = current.match(re);
        if (!match) return '';
        const g = step.group ?? 1;
        return match[g] ?? match[0] ?? '';
      } catch { return current; }
    }

    case 'regex_replace': {
      try {
        const re = new RegExp(step.pattern, 'g');
        return current.replace(re, step.replacement);
      } catch { return current; }
    }

    case 'pad_left':  return current.padStart(step.length, step.char ?? '0');
    case 'pad_right': return current.padEnd(step.length, step.char ?? ' ');

    case 'substring': {
      const e = step.end;
      return e !== undefined ? current.slice(step.start, e) : current.slice(step.start);
    }

    case 'split_take': {
      const parts = current.split(step.delimiter);
      return parts[step.index] ?? '';
    }

    // ── Numeric ──────────────────────────────────────────────────────────────
    case 'decimal': {
      const clean = current.replace(/[£$€¥,\s]/g, '');
      const n = parseFloat(clean);
      if (isNaN(n)) return current;
      return n.toFixed(step.precision ?? 2);
    }

    case 'number_abs': {
      const n = parseFloat(current);
      return isNaN(n) ? current : String(Math.abs(n));
    }

    case 'number_negate': {
      const n = parseFloat(current);
      return isNaN(n) ? current : String(-n);
    }

    case 'multiply': {
      const n = parseFloat(current);
      if (isNaN(n)) return current;
      return parseFloat((n * step.factor).toPrecision(12)).toString();
    }

    // ── Domain ────────────────────────────────────────────────────────────────
    case 'date_format': {
      const locale = step.locale ?? context.dateLocale ?? 'uk';
      return normaliseDate(current.trim(), locale);
    }

    case 'boolean_to_int': {
      const l = current.toLowerCase().trim();
      if (['yes', 'true', '1', 'y'].includes(l)) return '1';
      if (['no', 'false', '0', 'n'].includes(l))  return '0';
      return current;
    }

    case 'tr_type': {
      const l = current.toLowerCase().trim();
      if (['debit',  'dr',  '1'].includes(l))  return '1';
      if (['credit', 'cr', '-1'].includes(l)) return '-1';
      return current;
    }

    // ── Multi-source ──────────────────────────────────────────────────────────
    case 'concat': {
      const sep = step.separator ?? '';
      const parts = [current, ...step.columns.map(c => row[c] ?? '')].filter(p => p !== '');
      return parts.join(sep);
    }

    case 'coalesce': {
      if (current.trim()) return current;
      for (const col of step.columns) {
        const v = row[col] ?? '';
        if (v.trim()) return v;
      }
      return '';
    }

    // ── Logic ────────────────────────────────────────────────────────────────
    case 'lookup': {
      const found = step.table[current];
      if (found !== undefined) return found;
      const fallback = step.fallback ?? 'passthrough';
      if (fallback === 'passthrough') return current;
      if (fallback === 'empty') return '';
      throw new Error(`Lookup: no match found for value '${current}'`);
    }

    case 'static': return step.value;

    case 'formula':
      return evaluateFormula(step.expression, row, current);

    case 'if': {
      const met = evaluateCondition(step.condition, current);
      const subSteps = met ? step.then_steps : (step.else_steps ?? []);
      let result = current;
      for (const s of subSteps) {
        result = applyStep(result, s, row, context);
      }
      return result;
    }

    default:
      return current;
  }
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

/**
 * Apply a full pipeline to a single source row for one mapping entry.
 * Handles v1 and v2 entries transparently via the compat shim.
 */
export function applyPipeline(
  row: Record<string, string>,
  entry: ColumnMappingEntry | ColumnMappingEntryV2,
  context: PipelineContext,
): PipelineResult {
  const v2 = normaliseEntry(entry);
  const trace: StepTrace[] = [];

  // Resolve initial value from source column
  let current: string = v2.source_column ? (row[v2.source_column] ?? '') : '';

  try {
    for (const step of v2.steps) {
      const before = current;
      current = applyStep(current, step, row, context);
      if (context.preview) {
        trace.push({ step, input: before, output: current });
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (context.preview) {
      return { error, trace };
    }
    throw err;
  }

  // Null / default / skip handling
  if (!current.trim()) {
    const onEmpty = v2.on_empty ?? (v2.required ? 'error' : 'null');
    switch (onEmpty) {
      case 'default':
        current = v2.default_value ?? '';
        if (context.preview) trace.push({ step: { type: 'static', value: current }, input: '', output: current });
        break;
      case 'skip':
        return { skip: true, trace: context.preview ? trace : undefined };
      case 'null':
        // explicit empty — pass as empty string
        break;
      case 'error':
      default:
        if (v2.required) {
          const error = `Required field '${v2.source_column ?? v2.target_field}' → ${v2.target_field} is empty after pipeline`;
          if (context.preview) return { error, trace };
          throw new Error(error);
        }
    }
  }

  return {
    value: current,
    trace: context.preview ? trace : undefined,
  };
}

/**
 * Apply all mapping entries to a single source row.
 * Returns a map of target_field → PipelineResult.
 * Skipped entries are omitted from the result map.
 */
export function applyPipelineAll(
  row: Record<string, string>,
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  context: PipelineContext,
): Record<string, PipelineResult> {
  const results: Record<string, PipelineResult> = {};
  for (const entry of entries) {
    const v2 = normaliseEntry(entry);
    if (!v2.target_field) continue;
    const result = applyPipeline(row, v2, context);
    if (!result.skip) {
      results[v2.target_field] = result;
    }
  }
  return results;
}

/**
 * Convenience: apply all entries and return only the final string values.
 * Throws on any error unless context.preview is true.
 */
export function mapRow(
  row: Record<string, string>,
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[],
  context: PipelineContext,
): Record<string, string> {
  const results = applyPipelineAll(row, entries, context);
  const mapped: Record<string, string> = {};
  for (const [field, result] of Object.entries(results)) {
    if (result.error) throw new Error(result.error);
    mapped[field] = result.value ?? '';
  }
  return mapped;
}
