/**
 * Mapping Diff Engine
 *
 * Compares two versions of a column_mappings array and returns a structured
 * diff. Row identity is based on the stable `id` UUID on each entry.
 *
 * Used by the template versioning system to show tenants what changed between
 * the platform template version they're on and the latest published version.
 */

import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type RowDiffType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface RowDiff {
  type: RowDiffType;
  id: string;
  /** The target field name — useful for display */
  targetField: string;
  /** Label if set, otherwise target_field */
  displayLabel: string;
  /** Full entry before the change (undefined for 'added') */
  before?: ColumnMappingEntryV2;
  /** Full entry after the change (undefined for 'removed') */
  after?: ColumnMappingEntryV2;
  /** Which top-level properties changed (only meaningful for 'modified') */
  fieldsChanged: string[];
}

export interface MappingDiff {
  rows: RowDiff[];
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  /** True if any changes affect pipeline logic (not just labels/notes) */
  hasMaterialChanges: boolean;
  /** True if there are no differences */
  isEmpty: boolean;
}

// ── Fields whose changes are considered "material" (affect processing) ─────────
const MATERIAL_FIELDS: Array<keyof ColumnMappingEntryV2> = [
  'source_column',
  'target_field',
  'required',
  'steps',
  'on_empty',
  'default_value',
  'transform',
];

// ── Diff function ──────────────────────────────────────────────────────────────

export function diffMappings(
  oldMappings: ColumnMappingEntryV2[],
  newMappings: ColumnMappingEntryV2[],
): MappingDiff {
  const oldById = new Map(oldMappings.map((e) => [e.id, e]));
  const newById = new Map(newMappings.map((e) => [e.id, e]));

  const rows: RowDiff[] = [];

  // Walk new version: find added and modified rows
  for (const newEntry of newMappings) {
    const oldEntry = oldById.get(newEntry.id);

    if (!oldEntry) {
      rows.push({
        type: 'added',
        id: newEntry.id,
        targetField: newEntry.target_field,
        displayLabel: newEntry.label || newEntry.target_field,
        after: newEntry,
        fieldsChanged: [],
      });
    } else {
      const changedFields = detectChangedFields(oldEntry, newEntry);
      if (changedFields.length > 0) {
        rows.push({
          type: 'modified',
          id: newEntry.id,
          targetField: newEntry.target_field,
          displayLabel: newEntry.label || newEntry.target_field,
          before: oldEntry,
          after: newEntry,
          fieldsChanged: changedFields,
        });
      } else {
        rows.push({
          type: 'unchanged',
          id: newEntry.id,
          targetField: newEntry.target_field,
          displayLabel: newEntry.label || newEntry.target_field,
          before: oldEntry,
          after: newEntry,
          fieldsChanged: [],
        });
      }
    }
  }

  // Walk old version: find removed rows
  for (const oldEntry of oldMappings) {
    if (!newById.has(oldEntry.id)) {
      rows.push({
        type: 'removed',
        id: oldEntry.id,
        targetField: oldEntry.target_field,
        displayLabel: oldEntry.label || oldEntry.target_field,
        before: oldEntry,
        fieldsChanged: [],
      });
    }
  }

  const added    = rows.filter((r) => r.type === 'added').length;
  const removed  = rows.filter((r) => r.type === 'removed').length;
  const modified = rows.filter((r) => r.type === 'modified').length;
  const unchanged = rows.filter((r) => r.type === 'unchanged').length;

  const hasMaterialChanges = rows.some(
    (r) =>
      r.type === 'added' ||
      r.type === 'removed' ||
      (r.type === 'modified' &&
        r.fieldsChanged.some((f) => MATERIAL_FIELDS.includes(f as keyof ColumnMappingEntryV2))),
  );

  return {
    rows,
    added,
    removed,
    modified,
    unchanged,
    hasMaterialChanges,
    isEmpty: added === 0 && removed === 0 && modified === 0,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function detectChangedFields(
  a: ColumnMappingEntryV2,
  b: ColumnMappingEntryV2,
): string[] {
  const changed: string[] = [];
  const allKeys = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]) as Set<keyof ColumnMappingEntryV2>;

  for (const key of allKeys) {
    if (key === 'id') continue; // identity field, never "changed"
    if (!deepEqual(a[key], b[key])) {
      changed.push(key as string);
    }
  }

  return changed;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
