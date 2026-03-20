/**
 * Step Executor Interface
 *
 * Every step in the orchestration pipeline implements StepExecutor.
 * Steps are stateless functions over a shared StepContext.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobStep, JobItem, StepResult } from '@/lib/jobs/types';
import type { EventWriter } from '@/lib/jobs/event-writer';
import type { Connector } from '@/lib/connectors/connector.interface';

// ── Step context ──────────────────────────────────────────────────────────────
// Everything a step needs to execute, passed in from the orchestrator.

export interface StepContext {
  /** The job being processed */
  job: Job;
  /** The current step record (used to update DB) */
  step: JobStep;
  /** All items for this job (populated after parse step) */
  items: JobItem[];
  /** Connector for outbound submission */
  connector: Connector;
  /** Admin Supabase client (service role) */
  admin: SupabaseClient;
  /** Event writer scoped to this step */
  events: EventWriter;
  /** Tenant date locale (resolved from tenant region) */
  dateLocale: 'uk' | 'us';
  /** Mapping column definitions (loaded from field_mappings) */
  columnMappings: import('@/lib/mapping-engine/types').ColumnMappingEntryV2[];
  /** Transaction type from the mapping (e.g. 'journal_entry') */
  transactionType: string;
  /** Effective entity ID for this job */
  entityId: string | null;
}

// ── Step executor interface ───────────────────────────────────────────────────

export interface StepExecutor {
  execute(ctx: StepContext): Promise<StepResult>;
}
