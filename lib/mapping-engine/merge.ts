/**
 * Mapping Merge Engine
 *
 * Handles the logic for applying a platform template update to a tenant's
 * linked or inherit-mode mapping.
 *
 * Modes:
 *   'linked'  — whole-mapping accept/reject. Simple overwrite.
 *   'inherit' — row-level ownership. Platform updates flow through on
 *               rows the tenant hasn't modified; conflicts flagged otherwise.
 */

import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OverrideState = 'inherited' | 'customized' | 'added' | 'conflict';

/** Extends ColumnMappingEntryV2 with inheritance tracking */
export interface InheritableEntry extends ColumnMappingEntryV2 {
  override_state?: OverrideState;
}

export interface ConflictRow {
  id: string;
  targetField: string;
  displayLabel: string;
  tenantEntry: InheritableEntry;
  platformEntry: ColumnMappingEntryV2;
}

export interface MergeResult {
  merged: InheritableEntry[];
  conflicts: ConflictRow[];
  /** Count of rows auto-applied from platform (override_state was 'inherited') */
  autoApplied: number;
  /** Count of rows where tenant had customized and platform also changed — conflict */
  conflictCount: number;
}

// ── Linked mode (whole-mapping) ────────────────────────────────────────────────
// Simple overwrite — used when inheritance_mode = 'linked'.
// All rows come from the platform version; no per-row tracking.

export function acceptLinkedUpdate(
  platformMappings: ColumnMappingEntryV2[],
): InheritableEntry[] {
  return platformMappings.map((entry) => ({
    ...entry,
    override_state: undefined, // linked mode doesn't track row-level state
  }));
}

// ── Inherit mode (row-level) ───────────────────────────────────────────────────
// Rows the tenant hasn't touched receive platform updates automatically.
// Rows the tenant customised AND the platform also changed → conflict.

export function mergeInheritUpdate(
  tenantMappings: InheritableEntry[],
  platformMappings: ColumnMappingEntryV2[],
): MergeResult {
  const tenantById = new Map(tenantMappings.map((e) => [e.id, e]));
  const platformById = new Map(platformMappings.map((e) => [e.id, e]));

  const merged: InheritableEntry[] = [];
  const conflicts: ConflictRow[] = [];
  let autoApplied = 0;

  // Walk platform version (defines the authoritative row order for inherited rows)
  for (const platformRow of platformMappings) {
    const tenantRow = tenantById.get(platformRow.id);

    if (!tenantRow) {
      // New row in platform version — add it as inherited
      merged.push({ ...platformRow, override_state: 'inherited' });
      autoApplied++;
      continue;
    }

    const overrideState = tenantRow.override_state ?? 'customized';

    if (overrideState === 'inherited') {
      // Tenant hasn't touched this row — apply platform update
      merged.push({ ...platformRow, override_state: 'inherited' });
      autoApplied++;
    } else if (overrideState === 'customized' || overrideState === 'conflict') {
      const platformChanged = !deepEqual(
        stripOverrideState(tenantRow),
        platformRow,
      );

      if (platformChanged) {
        // Both sides changed — conflict
        conflicts.push({
          id: platformRow.id,
          targetField: platformRow.target_field,
          displayLabel: platformRow.label || platformRow.target_field,
          tenantEntry: tenantRow,
          platformEntry: platformRow,
        });
        // Keep tenant version but mark as conflict
        merged.push({ ...tenantRow, override_state: 'conflict' });
      } else {
        // Platform "changed" to what tenant already has — no conflict
        merged.push({ ...tenantRow, override_state: 'customized' });
      }
    } else if (overrideState === 'added') {
      // This shouldn't happen (added rows have no platform counterpart)
      // but handle gracefully: treat as customized
      merged.push({ ...tenantRow, override_state: 'added' });
    }
  }

  // Preserve tenant-added rows (not in platform at all)
  for (const tenantRow of tenantMappings) {
    if (tenantRow.override_state === 'added' && !platformById.has(tenantRow.id)) {
      merged.push(tenantRow);
    }
  }

  // Handle platform-removed rows where tenant had customized them
  for (const tenantRow of tenantMappings) {
    if (
      !platformById.has(tenantRow.id) &&
      tenantRow.override_state !== 'added'
    ) {
      // Platform removed this row
      if (tenantRow.override_state === 'inherited') {
        // Auto-remove: tenant never customised it
        // (already excluded from merged by not being in platform loop)
      } else {
        // Tenant customised a row that platform removed — conflict
        // Surface as a conflict (row present in merged, marked conflict)
        const alreadyInMerged = merged.some((r) => r.id === tenantRow.id);
        if (!alreadyInMerged) {
          conflicts.push({
            id: tenantRow.id,
            targetField: tenantRow.target_field,
            displayLabel: tenantRow.label || tenantRow.target_field,
            tenantEntry: tenantRow,
            platformEntry: undefined as unknown as ColumnMappingEntryV2,
          });
          merged.push({ ...tenantRow, override_state: 'conflict' });
        }
      }
    }
  }

  return {
    merged,
    conflicts,
    autoApplied,
    conflictCount: conflicts.length,
  };
}

// ── Conflict resolution ────────────────────────────────────────────────────────

export function resolveConflict(
  mappings: InheritableEntry[],
  rowId: string,
  resolution: 'keep_mine' | 'accept_platform',
  platformEntry?: ColumnMappingEntryV2,
): InheritableEntry[] {
  return mappings.map((row) => {
    if (row.id !== rowId) return row;

    if (resolution === 'keep_mine') {
      return { ...row, override_state: 'customized' as OverrideState };
    }

    if (resolution === 'accept_platform' && platformEntry) {
      return { ...platformEntry, override_state: 'inherited' as OverrideState };
    }

    return row;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripOverrideState(entry: InheritableEntry): ColumnMappingEntryV2 {
  const { override_state, ...rest } = entry;
  return rest as ColumnMappingEntryV2;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
