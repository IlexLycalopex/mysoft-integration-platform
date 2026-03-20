/**
 * Build Payload Step — Generate connector-specific payloads from transformed items
 *
 * For journal entries, groups items by JOURNALID+date+description into batches.
 * For all other types, one payload per item.
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult, JobItem } from '@/lib/jobs/types';
import type { BuildPayloadContext } from '@/lib/connectors/connector.interface';

export const buildPayloadStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, admin, events, connector, transactionType, entityId } = ctx;

    // Only process transformed items
    const readyItems = items.filter(i => i.status === 'transformed' && i.transformed_payload_json);
    if (readyItems.length === 0) {
      return {
        success: false,
        error: { category: 'data', code: 'NO_TRANSFORMED_ITEMS', message: 'No items in transformed state' },
      };
    }

    let built    = 0;
    let failed   = 0;
    const groups: Map<string, { items: JobItem[]; payload: unknown }> = new Map();

    for (const item of readyItems) {
      const mappedFields = item.transformed_payload_json as Record<string, string>;

      try {
        const buildCtx: BuildPayloadContext = {
          objectType:   transactionType,
          mappedFields,
          dateLocale:   ctx.dateLocale,
          entityId:     entityId ?? undefined,
          dryRun:       job.dry_run,
        };

        const payload = connector.buildPayload(buildCtx);

        // For journal entries, group by JOURNALID+date+description (same key = same GLBATCH)
        const groupKey = transactionType === 'journal_entry'
          ? [mappedFields['JOURNALID'] ?? '', mappedFields['WHENCREATED'] ?? '', mappedFields['DESCRIPTION'] ?? ''].join('\x00')
          : item.id;  // all other types: one payload per item

        if (!groups.has(groupKey)) {
          groups.set(groupKey, { items: [], payload });
        }
        groups.get(groupKey)!.items.push(item);

        // Persist endpoint_payload_json on each item
        await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
          .from('job_items')
          .update({ endpoint_payload_json: payload as Record<string, unknown> })
          .eq('id', item.id);

        built++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
          .from('job_items')
          .update({
            status:         'failed',
            error_category: 'data',
            error_code:     'BUILD_PAYLOAD_FAILED',
            error_message:  message,
            reprocessable:  true,
          })
          .eq('id', item.id);

        await events.error('item_failed',
          `Row ${item.source_row_number} payload build failed: ${message}`,
          { rowNum: item.source_row_number },
          item.id
        );
        failed++;
      }
    }

    // Reload items
    const { data: updatedItems } = await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('job_items')
      .select('*')
      .eq('job_id', job.id)
      .returns<JobItem[]>();

    await events.info('step_completed',
      `Payload build: ${built} built, ${failed} failed, ${groups.size} submission group(s)`,
      { built, failed, groupCount: groups.size, transactionType }
    );

    return {
      success:  built > 0,
      items:    updatedItems ?? items,
      metrics:  { built, failed, groups: groups.size },
      metadata: { group_count: groups.size },
      ...(built === 0 ? {
        error: {
          category: 'data' as const,
          code: 'ALL_PAYLOAD_BUILDS_FAILED',
          message: `All ${failed} items failed payload construction`,
        },
      } : {}),
    };
  },
};
