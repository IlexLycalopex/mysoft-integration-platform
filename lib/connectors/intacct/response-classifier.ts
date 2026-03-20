/**
 * Intacct Response Classifier
 *
 * Translates Intacct-specific error codes and patterns into resilience categories.
 * Referenced by the submit step to decide retry vs data error vs dead-letter.
 */

import type { ConnectorResponse, ResponseClassification } from '../connector.interface';

// ── Intacct error code taxonomy ───────────────────────────────────────────────

/** Transient Intacct codes — safe to retry */
const TRANSIENT_CODES = new Set([
  'PL04000050',  // System temporarily unavailable
  'GW000002',    // Gateway timeout
]);

/** Duplicate / idempotency codes — record already exists */
const DUPLICATE_CODES = new Set([
  'BL01001973',  // Transaction XXXX already posted
  'BL01001762',  // Record already exists
]);

/** Data / validation error code prefixes */
const DATA_CODE_PREFIXES = ['BL3', 'BL34', 'XL03', 'XL04', 'BL01'];

// ── HTTP status patterns ──────────────────────────────────────────────────────

const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const AUTH_HTTP      = new Set([401, 403]);

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyIntacctFailure(response: ConnectorResponse): ResponseClassification {
  const firstError = response.errors?.[0];
  const code       = firstError?.code ?? '';
  const message    = firstError?.message ?? 'Unknown Intacct error';

  // Duplicate detection
  if (DUPLICATE_CODES.has(code) || /already.?(exists|posted)/i.test(message)) {
    return {
      category:    'data',
      isDuplicate: true,
      isTransient: false,
      errorCode:   code || 'DUPLICATE',
      message:     `Duplicate record detected: ${message}`,
    };
  }

  // Transient Intacct codes
  if (TRANSIENT_CODES.has(code)) {
    return {
      category:    'transient',
      isDuplicate: false,
      isTransient: true,
      errorCode:   code,
      message:     `Intacct temporarily unavailable: ${message}`,
    };
  }

  // Authentication failures
  if (code === 'XL03000001' || /authentication|unauthorized/i.test(message)) {
    return {
      category:    'configuration',
      isDuplicate: false,
      isTransient: false,
      errorCode:   code || 'AUTH_FAILURE',
      message:     `Intacct authentication failure: ${message}`,
    };
  }

  // HTTP-level transient errors (from network layer)
  const httpMatch = message.match(/HTTP[_ ](\d{3})/i);
  if (httpMatch) {
    const httpStatus = parseInt(httpMatch[1]);
    if (TRANSIENT_HTTP.has(httpStatus)) {
      return {
        category:    'transient',
        isDuplicate: false,
        isTransient: true,
        errorCode:   `HTTP_${httpStatus}`,
        message:     `HTTP ${httpStatus} from Intacct: ${message}`,
      };
    }
    if (AUTH_HTTP.has(httpStatus)) {
      return {
        category:    'configuration',
        isDuplicate: false,
        isTransient: false,
        errorCode:   `HTTP_${httpStatus}`,
        message:     `Auth error from Intacct: ${message}`,
      };
    }
  }

  // Data/validation codes (BL, XL prefixes)
  if (DATA_CODE_PREFIXES.some(p => code.startsWith(p))) {
    return {
      category:    'data',
      isDuplicate: false,
      isTransient: false,
      errorCode:   code,
      message:     `Data validation error: ${message}`,
    };
  }

  // Intacct "not found" errors
  if (/not\s+found|cannot\s+find|no.*record/i.test(message)) {
    return {
      category:    'data',
      isDuplicate: false,
      isTransient: false,
      errorCode:   code || 'NOT_FOUND',
      message:     `Referenced record not found: ${message}`,
    };
  }

  // Default: treat unknown Intacct errors as data errors to avoid infinite retries
  return {
    category:    'data',
    isDuplicate: false,
    isTransient: false,
    errorCode:   code || 'INTACCT_ERROR',
    message,
  };
}
