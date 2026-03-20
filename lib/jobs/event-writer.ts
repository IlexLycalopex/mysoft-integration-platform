/**
 * Event Writer — Append-only job_events audit trail
 *
 * All job lifecycle events are written here. Never update events;
 * only insert. Provides full observability of every job from queue to completion.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventSeverity } from './types';

export type EventType =
  | 'job_queued'
  | 'job_claimed'
  | 'job_released'
  | 'job_completed'
  | 'job_failed'
  | 'job_dead_lettered'
  | 'job_cancelled'
  | 'retry_scheduled'
  | 'stale_claim_recovered'
  | 'approval_requested'
  | 'approval_granted'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  | 'item_parsed'
  | 'item_validated'
  | 'item_transformed'
  | 'item_submitted'
  | 'item_posted'
  | 'item_failed'
  | 'item_skipped'
  | 'duplicate_detected'
  | 'dry_run_completed';

export class EventWriter {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly jobId: string,
    private stepId?: string
  ) {}

  /** Create a new EventWriter scoped to a specific step */
  forStep(stepId: string): EventWriter {
    const w = new EventWriter(this.admin, this.jobId, stepId);
    return w;
  }

  async write(
    type: EventType,
    severity: EventSeverity,
    message: string,
    meta?: Record<string, unknown>,
    itemId?: string
  ): Promise<void> {
    try {
      await (this.admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
        .from('job_events')
        .insert({
          job_id:        this.jobId,
          job_step_id:   this.stepId ?? null,
          job_item_id:   itemId ?? null,
          event_type:    type,
          severity,
          message,
          metadata_json: meta ?? null,
        });
    } catch {
      // Event writing must never crash the orchestrator
      console.warn(`[EventWriter] Failed to write event ${type} for job ${this.jobId}`);
    }
  }

  info(type: EventType, message: string, meta?: Record<string, unknown>, itemId?: string) {
    return this.write(type, 'info', message, meta, itemId);
  }

  success(type: EventType, message: string, meta?: Record<string, unknown>, itemId?: string) {
    return this.write(type, 'success', message, meta, itemId);
  }

  warn(type: EventType, message: string, meta?: Record<string, unknown>, itemId?: string) {
    return this.write(type, 'warn', message, meta, itemId);
  }

  error(type: EventType, message: string, meta?: Record<string, unknown>, itemId?: string) {
    return this.write(type, 'error', message, meta, itemId);
  }
}

/**
 * Standalone helper — write a single event without needing an EventWriter instance.
 * Used by one-off transitions (approval, cancellation, etc.)
 */
export async function writeJobEvent(
  admin: SupabaseClient,
  jobId: string,
  type: EventType,
  severity: EventSeverity,
  message: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await (admin as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>)
      .from('job_events')
      .insert({
        job_id:        jobId,
        event_type:    type,
        severity,
        message,
        metadata_json: meta ?? null,
      });
  } catch {
    console.warn(`[EventWriter] Failed to write event ${type} for job ${jobId}`);
  }
}
