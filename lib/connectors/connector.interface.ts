/**
 * Connector Interface — Abstraction for all outbound ERP/endpoint systems
 *
 * Every connector (Intacct, future X3, generic REST) implements this interface.
 * The orchestration engine is connector-agnostic: it calls buildPayload/submit
 * without knowing anything about the target system.
 */

import type { ErrorCategory } from '@/lib/jobs/types';

// ── Connector capabilities ────────────────────────────────────────────────────
// Declared per-connector so the engine can adapt behaviour accordingly.

export interface ConnectorCapabilities {
  /** Connector type identifier */
  connectorType: string;
  /** Human-readable name */
  displayName: string;
  /** Supported destination object types */
  supportedObjectTypes: string[];
  /** Can validate payloads without posting (dry-run) */
  supportsDryRun: boolean;
  /** Supports idempotent upsert via external reference */
  supportsUpsert: boolean;
  /** Can attach documents to submitted records */
  supportsAttachments: boolean;
  /** Exposes schema/field discovery via API */
  supportsFieldDiscovery: boolean;
  /** True if field discovery requires tenant credentials (vs platform-level) */
  fieldDiscoveryRequiresAuth: boolean;
  /** Can check endpoint health before processing */
  supportsHealthCheck: boolean;
}

// ── Discovered field ───────────────────────────────────────────────────────────

export interface DiscoveredField {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  group: string;
  dataType?: 'string' | 'date' | 'decimal' | 'boolean' | 'integer';
  maxLength?: number;
  validValues?: string[];
}

// ── Build context ─────────────────────────────────────────────────────────────

export interface BuildPayloadContext {
  /** Transaction/object type (e.g. 'journal_entry', 'ar_invoice') */
  objectType: string;
  /** Transformed field→value map from the transform step */
  mappedFields: Record<string, string>;
  /** Tenant date locale for any remaining date handling */
  dateLocale: 'uk' | 'us';
  /** Entity ID override (multi-entity companies) */
  entityId?: string | null;
  /** Whether this is a dry-run (can alter payload for preview) */
  dryRun?: boolean;
}

// ── Submit context ────────────────────────────────────────────────────────────

export interface SubmitContext {
  objectType: string;
  dryRun?: boolean;
}

// ── Connector response ────────────────────────────────────────────────────────

export interface ConnectorResponse {
  success: boolean;
  /** External system record ID (e.g. Intacct RECORDNO) */
  recordId?: string;
  /** Raw response from the endpoint (truncated) */
  rawResponse?: Record<string, unknown>;
  /** Error details on failure */
  errors?: ConnectorError[];
}

export interface ConnectorError {
  code: string;
  message: string;
  detail?: string;
  correction?: string;
}

// ── Response classification ───────────────────────────────────────────────────

export interface ResponseClassification {
  category: ErrorCategory;
  /** True if this exact payload was already successfully posted (safe to skip) */
  isDuplicate: boolean;
  /** True if the endpoint was temporarily unavailable */
  isTransient: boolean;
  /** Suggested error code slug */
  errorCode: string;
  /** Human-readable message */
  message: string;
}

// ── The connector interface ───────────────────────────────────────────────────

export interface Connector {
  readonly capabilities: ConnectorCapabilities;

  /**
   * Check endpoint health before processing.
   * Returns true if the endpoint is reachable and credentials are valid.
   */
  healthCheck(tenantId: string): Promise<boolean>;

  /**
   * Build the connector-specific payload from mapped fields.
   * Pure function — no side effects, no API calls.
   */
  buildPayload(ctx: BuildPayloadContext): unknown;

  /**
   * Submit a built payload to the endpoint.
   * Returns a ConnectorResponse regardless of success/failure.
   */
  submit(tenantId: string, payload: unknown, ctx: SubmitContext): Promise<ConnectorResponse>;

  /**
   * Classify a failed ConnectorResponse into a resilience category.
   * Used by the submit step to decide retry vs. data error vs. DLQ.
   */
  classifyFailure(response: ConnectorResponse): ResponseClassification;

  /**
   * Discover available fields for a given object type from the endpoint API.
   * Optional — only implemented when capabilities.supportsFieldDiscovery = true.
   * When fieldDiscoveryRequiresAuth = true, tenantId is used to fetch credentials.
   */
  discoverFields?(objectType: string, tenantId: string): Promise<DiscoveredField[]>;
}
