/**
 * Job Orchestration Engine — Core Types
 *
 * All types used across the orchestration layer: jobs, steps, items, events,
 * error categories, and retry policy.
 */

// ── Status enums ─────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'              // legacy: maps to queued
  | 'queued'               // waiting for a worker
  | 'claimed'              // worker has locked this job
  | 'processing'           // worker is actively executing steps
  | 'awaiting_retry'       // transient failure, back-off timer running
  | 'partially_completed'  // some items succeeded, some failed (final)
  | 'completed'            // all items succeeded
  | 'completed_with_errors'// legacy: same as partially_completed
  | 'failed'               // non-retryable failure
  | 'dead_letter'          // max retries exhausted — manual intervention required
  | 'cancelled'            // user-cancelled
  | 'awaiting_approval';   // approval workflow gate

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type ItemStatus =
  | 'pending' | 'parsed' | 'validated' | 'transformed'
  | 'submitted' | 'posted' | 'failed' | 'reprocessable' | 'skipped';

export type EventSeverity = 'info' | 'warn' | 'error' | 'success';

// ── Error categorisation ──────────────────────────────────────────────────────
// Drives retry behaviour, UI presentation, and support workflow.

export type ErrorCategory =
  | 'transient'      // timeout, network, rate-limit → auto-retry
  | 'data'           // bad field value, missing required → no auto-retry, mark reprocessable
  | 'configuration'  // invalid template, bad credentials → fail job, require intervention
  | 'system';        // code exception, storage failure → retry or escalate

// ── Step types ────────────────────────────────────────────────────────────────

export type StepType =
  | 'ingest'
  | 'parse'
  | 'validate_source'
  | 'validate_template'
  | 'transform'
  | 'enrich'
  | 'build_payload'
  | 'submit'
  | 'attach_documents'
  | 'reconcile'
  | 'complete';

// The ordered pipeline for a standard job
export const STANDARD_PIPELINE: StepType[] = [
  'ingest',
  'parse',
  'validate_source',
  'validate_template',
  'transform',
  'build_payload',
  'submit',
  'reconcile',
  'complete',
];

// The pipeline for a dry-run job (no submit/reconcile)
export const DRY_RUN_PIPELINE: StepType[] = [
  'ingest',
  'parse',
  'validate_source',
  'validate_template',
  'transform',
  'build_payload',
  'complete',
];

// ── Domain model types ────────────────────────────────────────────────────────

export interface Job {
  id: string;
  tenant_id: string;
  created_by: string | null;
  filename: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  status: JobStatus;
  dry_run: boolean;
  requires_approval: boolean;
  approved_at: string | null;
  row_count: number | null;
  processed_count: number;
  error_count: number;
  mapping_id: string | null;
  source_type: string | null;
  entity_id_override: string | null;
  entity_id_used: string | null;
  watcher_config_id: string | null;
  // Orchestration columns
  trace_id: string | null;
  priority: number;
  claimed_by: string | null;
  claimed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  error_category: ErrorCategory | null;
  last_error_code: string | null;
  last_error_message: string | null;
  source_artefact_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  intacct_record_nos: string[] | null;
  processing_log: Record<string, unknown>[] | null;
  created_at: string;
  updated_at: string;
}

export interface JobStep {
  id: string;
  job_id: string;
  sequence: number;
  step_type: StepType;
  status: StepStatus;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_category: ErrorCategory | null;
  error_code: string | null;
  error_message: string | null;
  metrics_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface JobItem {
  id: string;
  job_id: string;
  tenant_id: string;
  item_key: string | null;
  item_sequence: number | null;
  source_row_number: number | null;
  status: ItemStatus;
  idempotency_key: string | null;
  validation_errors_json: Array<{ field: string; message: string }> | null;
  transformed_payload_json: Record<string, string> | null;
  endpoint_payload_json: Record<string, unknown> | null;
  endpoint_record_id: string | null;
  endpoint_response_json: Record<string, unknown> | null;
  error_category: ErrorCategory | null;
  error_code: string | null;
  error_message: string | null;
  reprocessable: boolean;
  posted_at: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  job_step_id: string | null;
  job_item_id: string | null;
  event_type: string;
  severity: EventSeverity;
  message: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface SourceArtefact {
  id: string;
  tenant_id: string;
  source_method: 'manual' | 'sftp' | 'http_push' | 'agent';
  content_type: string | null;
  storage_location: string | null;
  original_filename: string | null;
  remote_path: string | null;
  source_endpoint: string | null;
  received_at: string;
  file_hash: string | null;
  file_size: number | null;
  encoding: string | null;
  schema_hint: string | null;
  raw_metadata_json: Record<string, unknown> | null;
  created_at: string;
}

// ── Orchestration result types ────────────────────────────────────────────────

export interface OrchestrateResult {
  success: boolean;
  jobId: string;
  status: JobStatus;
  processed: number;
  errors: number;
  recordNos: string[];
  entityIdUsed?: string | null;
  message?: string;
}

export interface StepResult {
  success: boolean;
  /** Items created/updated by this step (passed to next step) */
  items?: JobItem[];
  /** Metrics to persist on job_steps.metrics_json */
  metrics?: Record<string, unknown>;
  /** Metadata to persist on job_steps.metadata_json */
  metadata?: Record<string, unknown>;
  /** If failed: error details */
  error?: {
    category: ErrorCategory;
    code: string;
    message: string;
  };
}

// ── Retry policy types ────────────────────────────────────────────────────────

export interface RetryDecision {
  shouldRetry: boolean;
  category: ErrorCategory;
  nextAttemptAt: Date | null;  // null = dead letter immediately
  reason: string;
}
