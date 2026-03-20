/**
 * Transform Step — Apply Mapping Engine v2 pipeline to each item
 *
 * Runs mapRowV2() on each job_item's raw_row. Stores the transformed
 * field→value map on the item. Journal entries are grouped here too.
 */

import { mapRow as mapRowV2 } from '@/lib/mapping-engine/execute';
import type { StepExecutor, StepContext } from './types';
import type { StepResult, JobItem } from '@/lib/jobs/types';

export const transformStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, admin, events, columnMappings, dateLocale } = ctx;

    let transformed = 0;
    let failed      = 0;

    // Process each item independently
    for (const item of items) {
      const rawRow = (item.metadata_json as Record<string, unknown>)?.raw_row as Record<string, string> | undefined;

      if (!rawRow) {
        await markItemFailed(admin, item, 'data', 'NO_RAW_ROW', 'Raw row data not found for this item');
        failed++;
        continue;
      }

      try {
        const mappedFields = mapRowV2(rawRow, columnMappings, { dateLocale });

        await (admin as any)
          .from('job_items')
          .update({
            status:                   'transformed',
            transformed_payload_json: mappedFields,
          })
          .eq('id', item.id);

        transformed++;

        await events.info('item_transformed',
          `Row ${item.source_row_number} transformed`,
          { rowNum: item.source_row_number, fieldCount: Object.keys(mappedFields).length },
          item.id
        );

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await markItemFailed(admin, item, 'data', 'TRANSFORM_FAILED', message);
        await events.error('item_failed',
          `Row ${item.source_row_number} transform failed: ${message}`,
          { rowNum: item.source_row_number, error: message },
          item.id
        );
        failed++;
      }
    }

    // Reload items with transformed payloads
    const { data: updatedItems } = await (admin as any)
      .from('job_items')
      .select('*')
      .eq('job_id', job.id)
      .returns();

    await events.info('step_completed',
      `Transform complete: ${transformed} succeeded, ${failed} failed`,
      { transformed, failed }
    );

    // If ALL items failed, treat as data error (not a job error)
    if (transformed === 0 && failed > 0) {
      return {
        success: false,
        error: {
          category: 'data',
          code:     'ALL_ROWS_TRANSFORM_FAILED',
          message:  `All ${failed} rows failed during transformation. Check mapping configuration.`,
        },
        metrics: { transformed, failed },
      };
    }

    return {
      success:  true,
      items:    updatedItems ?? items,
      metrics:  { transformed, failed },
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markItemFailed(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  item: JobItem,
  category: string,
  code: string,
  message: string
): Promise<void> {
  await (admin as any)
    .from('job_items')
    .update({
      status:         'failed',
      error_category: category,
      error_code:     code,
      error_message:  message,
      reprocessable:  true,
    })
    .eq('id', item.id);
}
