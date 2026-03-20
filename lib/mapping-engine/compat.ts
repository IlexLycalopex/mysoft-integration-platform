/**
 * Mapping Engine v2 — Backward Compatibility Shim
 *
 * Detects v1 ColumnMappingEntry objects and converts them to v2 format
 * so the pipeline engine can process both transparently.
 */

import type { ColumnMappingEntry, MappingTransform } from '@/types/database';
import type { ColumnMappingEntryV2, TransformStep } from './types';

/** Returns true if an entry has v2 pipeline fields (steps array present) */
export function isV2Entry(entry: unknown): entry is ColumnMappingEntryV2 {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'steps' in entry &&
    Array.isArray((entry as ColumnMappingEntryV2).steps)
  );
}

/** Convert a v1 legacy transform enum into an equivalent v2 TransformStep */
export function legacyTransformToStep(transform: MappingTransform): TransformStep {
  switch (transform) {
    case 'trim':        return { type: 'trim' };
    case 'date_format': return { type: 'date_format' };  // locale resolved from context
    case 'decimal':     return { type: 'decimal', precision: 2 };
    case 'boolean':     return { type: 'boolean_to_int' };
    case 'tr_type':     return { type: 'tr_type' };
    case 'none':
    default:            return { type: 'trim' }; // no-op equivalent — trim is safe
  }
}

/**
 * Convert a v1 ColumnMappingEntry to ColumnMappingEntryV2.
 * The result is functionally identical to the v1 behaviour.
 */
export function v1EntryToV2(entry: ColumnMappingEntry): ColumnMappingEntryV2 {
  const steps: TransformStep[] =
    entry.transform && entry.transform !== 'none'
      ? [legacyTransformToStep(entry.transform)]
      : [];

  return {
    id: entry.id,
    source_column: entry.source_column,
    target_field: entry.target_field,
    required: entry.required,
    transform: entry.transform,
    steps,
    on_empty: entry.required ? 'error' : 'null',
  };
}

/**
 * Normalise any entry (v1 or v2) to ColumnMappingEntryV2.
 * Safe to call on already-v2 entries — returns them unchanged.
 */
export function normaliseEntry(
  entry: ColumnMappingEntry | ColumnMappingEntryV2,
): ColumnMappingEntryV2 {
  if (isV2Entry(entry)) return entry;
  return v1EntryToV2(entry as ColumnMappingEntry);
}

/**
 * Normalise a full column_mappings array from the database.
 * The DB stores either v1 or v2 entries — this handles both.
 */
export function normaliseEntries(
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[],
): ColumnMappingEntryV2[] {
  return entries.map(normaliseEntry);
}

/**
 * Produce a blank v2 entry with sensible defaults.
 */
export function blankV2Entry(): ColumnMappingEntryV2 {
  return {
    id: crypto.randomUUID(),
    source_column: '',
    target_field: '',
    required: false,
    steps: [],
    on_empty: 'null',
  };
}
