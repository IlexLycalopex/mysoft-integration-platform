/**
 * Submit Step — Call the connector and submit each payload to the endpoint
 *
 * For journal entries: groups items by JOURNALID+date+description and submits
 * one GLBATCH per group (same behaviour as original processor.ts).
 * For all other types: one submission per item.
 *
 * Error classification drives retry vs. data error vs. dead-letter decisions.
 */

import type { StepExecutor, StepContext } from './types';
import type { StepResult, JobItem } from '@/lib/jobs/types';
import type { SubmitContext } from '@/lib/connectors/connector.interface';
import type { JournalEntry, JournalEntryLine } from '@/lib/intacct/client';

export const submitStep: StepExecutor = {
  async execute(ctx: StepContext): Promise<StepResult> {
    const { job, items, admin, events, connector, transactionType, entityId, dateLocale } = ctx;

    if (job.dry_run) {
      // Dry run: simulate success for all transformed items
      const transformedItems = items.filter(i =>
        i.status === 'transformed' || i.status === 'validated'
      );
      await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
        .from('job_items')
        .update({ status: 'posted', posted_at: new Date().toISOString() })
        .in('id', transformedItems.map(i => i.id));

      await events.info('dry_run_completed',
        `[DRY RUN] Would submit ${transformedItems.length} item(s) to ${connector.capabilities.displayName}`,
        { count: transformedItems.length, transactionType }
      );

      const { data: updatedItems } = await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
        .from('job_items')
        .select('*').eq('job_id', job.id).returns<JobItem[]>();

      return {
        success: true,
        items:   updatedItems ?? items,
        metrics: { submitted: transformedItems.length, dry_run: true },
      };
    }

    // Live submission
    const readyItems = items.filter(
      i => (i.status === 'transformed') && i.endpoint_payload_json
    );

    if (readyItems.length === 0) {
      return {
        success: false,
        error: { category: 'data', code: 'NO_READY_ITEMS', message: 'No items ready for submission' },
      };
    }

    const submitCtx: SubmitContext = { objectType: transactionType, dryRun: false };

    let submitted = 0;
    let failed    = 0;
    let transientErrors = 0;
    const recordNos: string[] = [];

    if (transactionType === 'journal_entry') {
      // Group journal entry items into GLBATCHes
      const groups = groupJournalItems(readyItems);

      for (const [groupKey, groupItems] of groups) {
        void groupKey; // groupKey used for grouping only
        const firstItem = groupItems[0];
        const mappedFields = firstItem.transformed_payload_json as Record<string, string>;

        // Rebuild full journal entry payload with ALL lines from the group
        const allLines = groupItems.map(item => {
          const m = item.transformed_payload_json as Record<string, string>;
          return { ...m };
        });

        // Build a combined journal entry payload with all group lines
        let combinedPayload: unknown;
        try {
          combinedPayload = buildGroupedJournalPayload(mappedFields, allLines, entityId);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          for (const item of groupItems) {
            await markItemFailed(admin, item, 'data', 'JOURNAL_BUILD_FAILED', message);
          }
          failed += groupItems.length;
          continue;
        }

        const result = await connector.submit(job.tenant_id, combinedPayload, submitCtx);

        if (result.success) {
          const recordId = result.recordId;
          if (recordId) recordNos.push(recordId);

          for (const item of groupItems) {
            await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
              .from('job_items')
              .update({
                status:                'posted',
                endpoint_record_id:    recordId ?? null,
                endpoint_response_json: { rawXml: result.rawResponse?.rawXml },
                posted_at:             new Date().toISOString(),
              })
              .eq('id', item.id);
            submitted++;
            await events.success('item_posted',
              `Journal batch posted: RECORDNO ${recordId ?? '(none)'}`,
              { rowNum: item.source_row_number, recordId },
              item.id
            );
          }
        } else {
          const classification = connector.classifyFailure(result);
          for (const item of groupItems) {
            const reprocessable = classification.category === 'data';
            await markItemFailed(admin, item, classification.category, classification.errorCode, classification.message, reprocessable);
            await events.error('item_failed',
              `Row ${item.source_row_number} failed: ${classification.message}`,
              { category: classification.category, code: classification.errorCode },
              item.id
            );
          }
          failed += groupItems.length;
          if (classification.isTransient) transientErrors++;
        }
      }
    } else {
      // One submission per item
      for (const item of readyItems) {
        const result = await connector.submit(
          job.tenant_id,
          item.endpoint_payload_json,
          submitCtx
        );

        if (result.success) {
          const recordId = result.recordId;
          if (recordId) recordNos.push(recordId);

          await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
            .from('job_items')
            .update({
              status:                'posted',
              endpoint_record_id:    recordId ?? null,
              endpoint_response_json: result.rawResponse ?? null,
              posted_at:             new Date().toISOString(),
            })
            .eq('id', item.id);

          submitted++;
          await events.success('item_posted',
            `Row ${item.source_row_number} posted: RECORDNO ${recordId ?? '(none)'}`,
            { rowNum: item.source_row_number, recordId },
            item.id
          );
        } else {
          const classification = connector.classifyFailure(result);
          const reprocessable  = classification.category === 'data';
          await markItemFailed(admin, item, classification.category, classification.errorCode, classification.message, reprocessable);
          await events.error('item_failed',
            `Row ${item.source_row_number} failed: ${classification.message}`,
            { category: classification.category, code: classification.errorCode },
            item.id
          );
          failed++;
          if (classification.isTransient) transientErrors++;
        }
      }
    }

    // Reload all items
    const { data: updatedItems } = await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('job_items')
      .select('*').eq('job_id', job.id).returns<JobItem[]>();

    // If majority of failures are transient → propagate as transient to trigger job retry
    if (submitted === 0 && transientErrors > 0) {
      return {
        success: false,
        items: updatedItems ?? items,
        metrics: { submitted, failed, transient_errors: transientErrors, record_nos: recordNos },
        error: {
          category: 'transient',
          code:     'ALL_SUBMISSIONS_TRANSIENT',
          message:  `All ${failed} submission(s) failed with transient errors — will retry`,
        },
      };
    }

    await events.info('step_completed',
      `Submit complete: ${submitted} posted, ${failed} failed`,
      { submitted, failed, recordNos, transientErrors }
    );

    return {
      success:  submitted > 0 || (submitted === 0 && failed === 0),
      items:    updatedItems ?? items,
      metrics:  { submitted, failed, transient_errors: transientErrors },
      metadata: { record_nos: recordNos },
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupJournalItems(items: JobItem[]): Map<string, JobItem[]> {
  const groups = new Map<string, JobItem[]>();
  for (const item of items) {
    const m = item.transformed_payload_json as Record<string, string>;
    const key = [m['JOURNALID'] ?? '', m['WHENCREATED'] ?? '', m['DESCRIPTION'] ?? ''].join('\x00');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

function buildGroupedJournalPayload(
  first: Record<string, string>,
  allLines: Record<string, string>[],
  entityId?: string | null
): { type: 'journal_entry'; data: JournalEntry } {
  const lines: JournalEntryLine[] = allLines.map(m => {
    const rawTrType = m['TR_TYPE'];
    const trType: '1' | '-1' = rawTrType === '-1' ? '-1' : '1';
    return {
      accountNo:    m['GLACCOUNTNO'] ?? '',
      amount:       m['AMOUNT'] ?? '',
      trType,
      memo:         m['MEMO']         || undefined,
      locationId:   m['LOCATIONID']   || entityId || undefined,
      departmentId: m['DEPARTMENTID'] || undefined,
      projectId:    m['PROJECTID']    || undefined,
      customerId:   m['CUSTOMERID']   || undefined,
      vendorId:     m['VENDORID']     || undefined,
      employeeId:   m['EMPLOYEEID']   || undefined,
      itemId:       m['ITEMID']       || undefined,
      classId:      m['CLASSID']      || undefined,
    };
  });

  return {
    type: 'journal_entry',
    data: {
      journalId:   first['JOURNALID']   ?? '',
      postingDate: first['WHENCREATED'] ?? '',
      description: first['DESCRIPTION']|| undefined,
      referenceNo: first['REFERENCENO']|| undefined,
      lines,
    },
  };
}

async function markItemFailed(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  item: JobItem,
  category: string,
  code: string,
  message: string,
  reprocessable = false
): Promise<void> {
  await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
    .from('job_items')
    .update({
      status:         'failed',
      error_category: category,
      error_code:     code,
      error_message:  message,
      reprocessable,
    })
    .eq('id', item.id);
}
