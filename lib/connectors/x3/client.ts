/**
 * Sage X3 API client — REST and GraphQL
 *
 * REST:     POST {baseUrl}/{solution}/api/v1/{OBJECT}
 * GraphQL:  POST {baseUrl}/{solution}/api/graphql
 * Auth:     Basic auth (Authorization: Basic base64(user:pass))
 *
 * Sage X3 v12+ with Syracuse server required.
 * REST API must be enabled (Syracuse administration → Web Services → REST).
 */

import type { X3Credentials, X3Payload } from './types';
import { buildX3RestUrl, buildX3GraphQLUrl, buildX3AuthHeader } from './types';

export interface X3Response {
  success:     boolean;
  recordId?:   string;       // Returned ROWID or NUM from the created record
  rawResponse?: Record<string, unknown>;
  errors?:     { code: string; message: string; field?: string }[];
  statusCode?: number;
}

// ── Health check via GraphQL ─────────────────────────────────────────────────

export async function checkX3Health(creds: X3Credentials): Promise<{ ok: boolean; message?: string }> {
  // Ping a lightweight introspection query
  const url = buildX3GraphQLUrl(creds);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': buildX3AuthHeader(creds),
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) return { ok: false, message: 'Authentication failed — check username/password' };
    if (res.status === 404) {
      // GraphQL not available — try REST ping
      return checkX3RestHealth(creds);
    }
    if (!res.ok) return { ok: false, message: `X3 server responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    // Fall through to REST health check
    return checkX3RestHealth(creds);
  }
}

async function checkX3RestHealth(creds: X3Credentials): Promise<{ ok: boolean; message?: string }> {
  // Try a GET on a known lightweight endpoint
  const url = buildX3RestUrl(creds, 'ATABDIV?count=1&fields=ROWID');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': buildX3AuthHeader(creds),
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, message: 'Authentication failed — check username/password' };
    return { ok: res.ok, message: res.ok ? undefined : `X3 server responded ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not reach X3 server' };
  }
}

// ── REST create ───────────────────────────────────────────────────────────────

export async function x3RestCreate(
  creds: X3Credentials,
  objectName: string,
  payload: Record<string, unknown>
): Promise<X3Response> {
  const url = buildX3RestUrl(creds, objectName);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': buildX3AuthHeader(creds),
        'Accept':        'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    return {
      success: false,
      errors: [{ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : String(err) }],
    };
  }

  const statusCode = res.status;
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    return {
      success: false,
      statusCode,
      rawResponse: body,
      errors: parseX3Errors(body, statusCode),
    };
  }

  // Successful create — extract record identifier
  const recordId = extractRecordId(body, objectName);
  return { success: true, recordId, rawResponse: body, statusCode };
}

// ── GraphQL create ────────────────────────────────────────────────────────────

export async function x3GraphQLCreate(
  creds: X3Credentials,
  objectName: string,
  payload: Record<string, unknown>
): Promise<X3Response> {
  const url = buildX3GraphQLUrl(creds);

  // Build a simple create mutation
  const mutation = `
    mutation Create${objectName}($input: ${objectName}_input!) {
      ${objectName}_create(input: $input) {
        ROWID
        NUM
        errors { message field }
      }
    }
  `;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': buildX3AuthHeader(creds),
        'Accept':        'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ query: mutation, variables: { input: payload } }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    return {
      success: false,
      errors: [{ code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : String(err) }],
    };
  }

  const statusCode = res.status;
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch { /**/ }

  // GraphQL errors
  const gqlErrors = body.errors as { message: string }[] | undefined;
  if (gqlErrors?.length) {
    return {
      success: false,
      statusCode,
      rawResponse: body,
      errors: gqlErrors.map((e) => ({ code: 'GRAPHQL_ERROR', message: e.message })),
    };
  }

  // Check data-level errors
  const data = body.data as Record<string, unknown> | undefined;
  const result = data?.[`${objectName}_create`] as Record<string, unknown> | undefined;
  const dataErrors = result?.errors as { message: string; field?: string }[] | undefined;
  if (dataErrors?.length) {
    return {
      success: false,
      statusCode,
      rawResponse: body,
      errors: dataErrors.map((e) => ({ code: 'X3_DATA_ERROR', message: e.message, field: e.field })),
    };
  }

  const recordId = (result?.NUM as string) ?? (result?.ROWID as string) ?? undefined;
  return { success: true, recordId, rawResponse: body, statusCode };
}

// ── Dispatch — REST or GraphQL based on creds setting ────────────────────────

export async function submitToX3(creds: X3Credentials, payload: X3Payload): Promise<X3Response> {
  const data = payload.data as unknown as Record<string, unknown>;
  if (creds.useGraphQL) {
    return x3GraphQLCreate(creds, payload.objectName, data);
  }
  return x3RestCreate(creds, payload.objectName, data);
}

// ── Dry run ───────────────────────────────────────────────────────────────────

export async function dryRunX3(
  _creds: X3Credentials,
  payload: X3Payload
): Promise<X3Response> {
  return {
    success: true,
    recordId: undefined,
    rawResponse: { dryRun: true, payload: payload.data },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractRecordId(body: Record<string, unknown>, objectName: string): string | undefined {
  // X3 REST typically returns the created object with its key fields
  // Try common key fields by object type
  const keyFields: Record<string, string[]> = {
    GACCENTRY:  ['JOUENTRY', 'ACCDAT', 'ROWID'],
    SINVOICE:   ['NUM', 'ROWID'],
    PINVOICE:   ['NUM', 'ROWID'],
    BPCUSTOMER: ['BPCNUM', 'ROWID'],
    BPSUPPLIER: ['BPSNUM', 'ROWID'],
    ITMMASTER:  ['ITMREF', 'ROWID'],
    PAYMENT:    ['NUM', 'ROWID'],
  };

  const keys = keyFields[objectName] ?? ['ROWID'];
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return undefined;
}

function parseX3Errors(
  body: Record<string, unknown>,
  statusCode: number
): { code: string; message: string; field?: string }[] {
  // X3 can return errors in various shapes
  if (body.errors && Array.isArray(body.errors)) {
    return (body.errors as { message: string; field?: string }[]).map((e) => ({
      code: 'X3_ERROR',
      message: e.message,
      field: e.field,
    }));
  }

  if (body.error && typeof body.error === 'string') {
    return [{ code: 'X3_ERROR', message: body.error }];
  }

  if (body.message && typeof body.message === 'string') {
    return [{ code: `HTTP_${statusCode}`, message: body.message }];
  }

  return [{ code: `HTTP_${statusCode}`, message: `Request failed with status ${statusCode}` }];
}
