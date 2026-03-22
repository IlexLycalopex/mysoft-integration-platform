/**
 * Sage X3 Response Classifier
 *
 * Translates X3 / Syracuse API error patterns into resilience categories.
 * Used by the submit step to decide: retry vs data error vs dead-letter.
 */

import type { ConnectorResponse, ResponseClassification } from '../connector.interface';

// ── HTTP status classification ────────────────────────────────────────────────

const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const AUTH_HTTP      = new Set([401, 403]);

// ── X3 error message patterns ─────────────────────────────────────────────────

const DUPLICATE_PATTERNS = [
  /already\s+exists/i,
  /duplicate\s+(key|entry|record)/i,
  /record\s+already\s+exists/i,
];

const TRANSIENT_PATTERNS = [
  /temporarily\s+unavailable/i,
  /service\s+unavailable/i,
  /timeout/i,
  /connection\s+refused/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
];

const AUTH_PATTERNS = [
  /authentication/i,
  /unauthorized/i,
  /invalid\s+(user|credential|password)/i,
  /access\s+denied/i,
  /forbidden/i,
];

const DATA_PATTERNS = [
  /is\s+required/i,
  /invalid\s+(value|format|date|number)/i,
  /not\s+found/i,
  /does\s+not\s+exist/i,
  /cannot\s+find/i,
  /field.*mandatory/i,
  /mandatory.*field/i,
  /validation\s+error/i,
];

// ── Classifier ────────────────────────────────────────────────────────────────

export function classifyX3Failure(response: ConnectorResponse): ResponseClassification {
  const firstError = response.errors?.[0];
  const code       = firstError?.code ?? '';
  const message    = firstError?.message ?? 'Unknown X3 error';

  // Network errors
  if (code === 'NETWORK_ERROR') {
    return {
      category:    'transient',
      isDuplicate: false,
      isTransient: true,
      errorCode:   'NETWORK_ERROR',
      message:     `Network error reaching X3: ${message}`,
    };
  }

  // GraphQL-level errors (schema/introspection issues are data-level)
  if (code === 'GRAPHQL_ERROR') {
    return {
      category:    'data',
      isDuplicate: false,
      isTransient: false,
      errorCode:   'GRAPHQL_ERROR',
      message:     `X3 GraphQL error: ${message}`,
    };
  }

  // Check HTTP status if embedded in error code
  const httpMatch = code.match(/^HTTP_(\d{3})$/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1]);
    if (AUTH_HTTP.has(status)) {
      return {
        category:    'configuration',
        isDuplicate: false,
        isTransient: false,
        errorCode:   code,
        message:     `X3 authentication failed (${status}): check username/password and API user permissions`,
      };
    }
    if (TRANSIENT_HTTP.has(status)) {
      return {
        category:    'transient',
        isDuplicate: false,
        isTransient: true,
        errorCode:   code,
        message:     `X3 server temporarily unavailable (${status}): ${message}`,
      };
    }
  }

  // Auth patterns in message
  if (AUTH_PATTERNS.some(p => p.test(message))) {
    return {
      category:    'configuration',
      isDuplicate: false,
      isTransient: false,
      errorCode:   code || 'AUTH_FAILURE',
      message:     `X3 authentication/permission error: ${message}`,
    };
  }

  // Duplicate detection
  if (DUPLICATE_PATTERNS.some(p => p.test(message))) {
    return {
      category:    'data',
      isDuplicate: true,
      isTransient: false,
      errorCode:   code || 'DUPLICATE',
      message:     `Duplicate record: ${message}`,
    };
  }

  // Transient patterns
  if (TRANSIENT_PATTERNS.some(p => p.test(message))) {
    return {
      category:    'transient',
      isDuplicate: false,
      isTransient: true,
      errorCode:   code || 'TRANSIENT',
      message:     `X3 temporarily unavailable: ${message}`,
    };
  }

  // Data/validation patterns
  if (DATA_PATTERNS.some(p => p.test(message))) {
    return {
      category:    'data',
      isDuplicate: false,
      isTransient: false,
      errorCode:   code || 'VALIDATION_ERROR',
      message:     `X3 data validation error: ${message}`,
    };
  }

  // Default: treat as data error to avoid infinite retry loops
  return {
    category:    'data',
    isDuplicate: false,
    isTransient: false,
    errorCode:   code || 'X3_ERROR',
    message,
  };
}
