/**
 * Mapping Engine v2 — Mapping Validation
 *
 * Validates a full array of ColumnMappingEntryV2 objects before save.
 * Returns structured errors per row and field.
 */

import type { ColumnMappingEntryV2, MappingValidationError, TransformStep } from './types';
import { normaliseEntry } from './compat';
import { validateFormula } from './formula';
import type { ColumnMappingEntry } from '@/types/database';

export interface MappingValidationResult {
  valid: boolean;
  errors: MappingValidationError[];
}

function validateStep(
  step: TransformStep,
  rowIndex: number,
  stepIndex: number,
  errors: MappingValidationError[],
) {
  const field = `steps[${stepIndex}]`;
  switch (step.type) {
    case 'replace':
      if (!step.find) errors.push({ rowIndex, field, message: 'Replace step: "find" cannot be empty' });
      break;
    case 'regex_extract':
    case 'regex_replace':
      try { new RegExp(step.pattern); }
      catch { errors.push({ rowIndex, field, message: `Regex step: invalid pattern: ${step.pattern}` }); }
      break;
    case 'pad_left':
    case 'pad_right':
      if (step.length < 1) errors.push({ rowIndex, field, message: 'Pad step: length must be ≥ 1' });
      break;
    case 'multiply':
      if (typeof step.factor !== 'number' || isNaN(step.factor))
        errors.push({ rowIndex, field, message: 'Multiply step: factor must be a number' });
      break;
    case 'lookup':
      if (!step.table || typeof step.table !== 'object')
        errors.push({ rowIndex, field, message: 'Lookup step: table must be an object' });
      break;
    case 'formula': {
      const err = validateFormula(step.expression);
      if (err) errors.push({ rowIndex, field, message: `Formula step: ${err}` });
      break;
    }
    case 'if': {
      if (!step.then_steps?.length)
        errors.push({ rowIndex, field, message: 'If step: then_steps cannot be empty' });
      // Recurse into nested steps
      (step.then_steps ?? []).forEach((s, i) => validateStep(s, rowIndex, i, errors));
      (step.else_steps ?? []).forEach((s, i) => validateStep(s, rowIndex, i, errors));
      break;
    }
  }
}

/**
 * Validate an array of mapping entries (v1 or v2).
 * Returns a result object with `valid` flag and structured errors.
 */
export function validateMappingEntries(
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[],
): MappingValidationResult {
  const errors: MappingValidationError[] = [];
  const usedTargets = new Set<string>();

  entries.forEach((rawEntry, rowIndex) => {
    const entry = normaliseEntry(rawEntry);

    // Target field required
    if (!entry.target_field) {
      errors.push({ rowIndex, field: 'target_field', message: 'Target field is required' });
    }

    // Source column required unless a static or multi-source first step provides the value
    const hasValueSource =
      entry.source_column ||
      entry.steps.some(s => s.type === 'static' || s.type === 'concat' || s.type === 'coalesce' || s.type === 'formula');

    if (!hasValueSource) {
      errors.push({ rowIndex, field: 'source_column', message: 'A source column or value-providing step (static/concat/coalesce/formula) is required' });
    }

    // Duplicate target field
    if (entry.target_field) {
      if (usedTargets.has(entry.target_field)) {
        errors.push({ rowIndex, field: 'target_field', message: `Target field '${entry.target_field}' is mapped more than once` });
      }
      usedTargets.add(entry.target_field);
    }

    // Validate default_value when on_empty = 'default'
    if (entry.on_empty === 'default' && !entry.default_value) {
      errors.push({ rowIndex, field: 'default_value', message: 'A default value is required when "if empty" is set to "use default"' });
    }

    // Validate each step
    entry.steps.forEach((step, stepIndex) => {
      validateStep(step, rowIndex, stepIndex, errors);
    });
  });

  return { valid: errors.length === 0, errors };
}
