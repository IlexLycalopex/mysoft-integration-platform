/**
 * Validate Source Step — Check file shape, required columns, encoding
 *
 * Validates that the parsed items match the expected structure.
 * Does NOT validate field values (that happens in transform step).
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult } from '@/lib/jobs/types';

export const validateSourceStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, events, columnMappings } = ctx;

    if (items.length === 0) {
      return {
        success: false,
        error: { category: 'data', code: 'NO_ITEMS', message: 'No items to validate — parse step may have failed' },
      };
    }

    // Derive the set of source columns declared in the mapping
    const requiredSourceColumns = columnMappings
      .filter(m => m.required && m.source_column && m.on_empty === 'error')
      .map(m => m.source_column as string);

    // Inspect first item's raw_row to get actual headers
    const firstItem = items[0];
    const rawRow = (firstItem.metadata_json as Record<string, unknown>)?.raw_row as Record<string, string> | undefined;

    if (!rawRow) {
      return {
        success: false,
        error: { category: 'system', code: 'NO_RAW_ROW', message: 'Parse step did not capture raw row data' },
      };
    }

    const actualColumns = Object.keys(rawRow);
    const missingColumns = requiredSourceColumns.filter(col => !actualColumns.includes(col));

    if (missingColumns.length > 0) {
      const message = `File is missing required columns: ${missingColumns.join(', ')}. ` +
        `Found columns: ${actualColumns.join(', ')}`;

      await events.warn('step_failed', message, { missingColumns, actualColumns });

      // Mark all items as failed
      await (ctx.admin as any)
        .from('job_items')
        .update({
          status:                'failed',
          error_category:        'data',
          error_code:            'MISSING_COLUMNS',
          error_message:         message,
          validation_errors_json: missingColumns.map(c => ({ field: c, message: `Column '${c}' not found in file` })),
        })
        .eq('job_id', job.id);

      return {
        success: false,
        error: { category: 'data', code: 'MISSING_COLUMNS', message },
      };
    }

    await events.info('step_completed',
      `Source validation passed: ${items.length} items, ${actualColumns.length} columns`,
      { itemCount: items.length, columnCount: actualColumns.length }
    );

    return {
      success:  true,
      items,
      metrics:  { item_count: items.length, column_count: actualColumns.length },
    };
  },
};
