/**
 * Retry Policy — Error categorisation + exponential backoff decisions
 *
 * Error categories drive different retry behaviours:
 *   transient    → auto-retry with backoff (network, timeout, rate-limit)
 *   data         → no auto-retry; mark items reprocessable, await correction
 *   configuration→ fail job immediately; require platform/admin intervention
 *   system       → retry up to max_attempts then dead-letter
 */

import type { ErrorCategory, RetryDecision } from './types';

// ── Backoff schedule (capped exponential) ────────────────────────────────────
// Attempt 1: immediate  2: +5m  3: +15m  4: +60m  5+: dead-letter

const BACKOFF_DELAYS_MS: Record<number, number> = {
  1: 0,
  2: 5  * 60 * 1000,
  3: 15 * 60 * 1000,
  4: 60 * 60 * 1000,
};

const JITTER_MAX_MS = 30_000; // ±30 seconds jitter to avoid thundering herd

function addJitter(ms: number): number {
  return ms + Math.floor(Math.random() * JITTER_MAX_MS);
}

export function getNextAttemptAt(attemptCount: number): Date | null {
  const delayMs = BACKOFF_DELAYS_MS[attemptCount] ?? BACKOFF_DELAYS_MS[4];
  return new Date(Date.now() + addJitter(delayMs));
}

// ── Error pattern matching ─────────────────────────────────────────────────
// Matches against error messages / codes from Intacct and infrastructure.

const TRANSIENT_PATTERNS: RegExp[] = [
  /timeout/i,
  /timed?\s*out/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /fetch\s+failed/i,
  /network\s+error/i,
  /rate.?limit/i,
  /429/,
  /503/,
  /502/,
  /500/,           // could be transient on endpoint side
  /temporarily\s+unavailable/i,
  /service\s+unavailable/i,
  /endpoint\s+unavailable/i,
  /PL04000050/,    // Intacct: system temporarily unavailable
  /STALE_CLAIM/,
];

const DATA_PATTERNS: RegExp[] = [
  /required\s+for/i,
  /is\s+required/i,
  /invalid\s+field/i,
  /invalid\s+date/i,
  /invalid\s+amount/i,
  /no\s+entity\s+found/i,
  /gl\s+account\s+not\s+found/i,
  /vendor\s+not\s+found/i,
  /customer\s+not\s+found/i,
  /department\s+not\s+found/i,
  /project\s+not\s+found/i,
  /employee\s+not\s+found/i,
  /XL03000009/,    // Intacct: cannot find record
  /BL34000061/,    // Intacct: transaction date invalid
  /record\s+already\s+exists/i,
  /duplicate/i,
];

const CONFIGURATION_PATTERNS: RegExp[] = [
  /no\s+intacct\s+credentials/i,
  /credentials?\s+not\s+configured/i,
  /no\s+mapping\s+assigned/i,
  /field\s+mapping\s+not\s+found/i,
  /sender\s+credentials\s+not\s+configured/i,
  /invalid\s+template/i,
  /template\s+not\s+found/i,
  /unauthorized/i,
  /authentication.*failure/i,
  /XL03000001/,    // Intacct: authentication failure
  /CA.*invalid\s+license/i,
];

/**
 * Categorise an error into one of the four resilience categories.
 * Uses pattern matching; falls back to 'system' for unclassified errors.
 */
export function categoriseError(err: Error | string): ErrorCategory {
  const msg = typeof err === 'string' ? err : err.message;

  if (CONFIGURATION_PATTERNS.some(p => p.test(msg))) return 'configuration';
  if (DATA_PATTERNS.some(p => p.test(msg)))           return 'data';
  if (TRANSIENT_PATTERNS.some(p => p.test(msg)))      return 'transient';
  return 'system';
}

/**
 * Determine whether and when to retry a failed job.
 *
 * Rules:
 *   - configuration errors: never retry
 *   - data errors: never retry (mark items reprocessable, await user action)
 *   - transient/system errors: retry up to maxAttempts with backoff
 */
export function getRetryDecision(
  err: Error | string,
  attemptCount: number,
  maxAttempts: number
): RetryDecision {
  const category = categoriseError(err);
  const msg      = typeof err === 'string' ? err : err.message;

  // Configuration or data errors: fail immediately, no retry
  if (category === 'configuration') {
    return {
      shouldRetry: false,
      category,
      nextAttemptAt: null,
      reason: 'Configuration errors require manual intervention and are not retried automatically',
    };
  }

  if (category === 'data') {
    return {
      shouldRetry: false,
      category,
      nextAttemptAt: null,
      reason: 'Data errors require source correction before reprocessing',
    };
  }

  // Transient / system: check attempt budget
  if (attemptCount >= maxAttempts) {
    return {
      shouldRetry: false,
      category,
      nextAttemptAt: null,
      reason: `Max attempts (${maxAttempts}) reached — moving to dead letter`,
    };
  }

  const nextAt = getNextAttemptAt(attemptCount);
  const minutesUntil = nextAt ? Math.round((nextAt.getTime() - Date.now()) / 60_000) : 0;

  return {
    shouldRetry: true,
    category,
    nextAttemptAt: nextAt,
    reason: `${category} error — retry attempt ${attemptCount + 1}/${maxAttempts} scheduled in ~${minutesUntil} min: ${msg}`,
  };
}

/**
 * Format error code from error message for persistence.
 * Extracts Intacct error codes (e.g. XL03000009) or generates a slug.
 */
export function extractErrorCode(err: Error | string): string {
  const msg = typeof err === 'string' ? err : err.message;
  // Extract Intacct-style error codes
  const intacctCode = msg.match(/\b([A-Z]{2}\d{8})\b/);
  if (intacctCode) return intacctCode[1];
  // Extract HTTP status codes
  const httpCode = msg.match(/\b(4\d{2}|5\d{2})\b/);
  if (httpCode) return `HTTP_${httpCode[1]}`;
  // Generate slug from first few words
  return msg
    .split(/[\s:—]/)[0]
    ?.toUpperCase()
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 32) || 'UNKNOWN';
}
