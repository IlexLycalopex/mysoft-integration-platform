/**
 * Sage Accounting API client (Sage 50cloud / Sage Business Cloud Accounting)
 *
 * Base URL: https://api.accounting.sage.com/v3.1/
 * Auth: OAuth 2.0 Bearer token
 * Pagination: cursor-based ($next link in response)
 *
 * Developer portal: https://developer.sage.com/accounting/reference/
 * Note: Requires Sage 50cloud subscription (Sage 50 desktop only is not supported).
 */

import type { OAuthTokens } from '../source.interface';

const AUTH_URL   = 'https://www.sageone.com/oauth2/auth/central';
const TOKEN_URL  = 'https://oauth.accounting.sage.com/token';
const API_BASE   = 'https://api.accounting.sage.com/v3.1';

interface SageTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export function buildSage50AuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes = 'full_access'
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeSage50Code(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sage 50 token exchange failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as SageTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshSage50Token(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sage 50 token refresh failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as SageTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// ── Generic paged GET ─────────────────────────────────────────────────────────

export interface SagePage<T> {
  $items: T[];
  $next?: string;
  $total?: number;
}

export async function sageGet<T>(
  pathOrUrl: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<SagePage<T>> {
  let url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) throw new Error('SAGE50_UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sage Accounting API error ${res.status} on ${pathOrUrl}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<SagePage<T>>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SageContact {
  id: string;
  displayed_as?: string;
  reference?: string;
  contact_type?: { id: string; displayed_as?: string };
  status?: { id: string; displayed_as?: string };
  email?: string;
  telephone?: string;
  website?: string;
  main_address?: {
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: { displayed_as?: string };
  };
  currency?: { id: string; displayed_as?: string };
  balance?: number;
  credit_limit?: number;
  tax_number?: string;
  notes?: string;
}

export interface SageInvoiceLine {
  id?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  net_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  ledger_account?: { id: string; displayed_as?: string };
  tax_rate?: { id: string; displayed_as?: string };
}

export interface SageInvoice {
  id: string;
  invoice_number?: string;
  reference?: string;
  contact?: { id: string; displayed_as?: string; reference?: string };
  date?: string;
  due_date?: string;
  currency?: { id: string; displayed_as?: string };
  status?: { id: string; displayed_as?: string };
  net_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  outstanding_amount?: number;
  notes?: string;
  invoice_lines?: SageInvoiceLine[];
}

export interface SageJournalLine {
  id?: string;
  description?: string;
  ledger_account?: { id: string; displayed_as?: string };
  debit?: number;
  credit?: number;
  tax_rate?: { id: string; displayed_as?: string };
}

export interface SageJournal {
  id: string;
  date?: string;
  reference?: string;
  description?: string;
  journal_code?: { id: string; displayed_as?: string };
  currency?: { id: string; displayed_as?: string };
  journal_lines?: SageJournalLine[];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const PAGE_SIZE = '200';

export async function fetchSageSalesInvoices(
  accessToken: string,
  nextUrl?: string,
  updatedOrCreatedSince?: string
): Promise<SagePage<SageInvoice>> {
  if (nextUrl) return sageGet<SageInvoice>(nextUrl, accessToken);

  const params: Record<string, string> = {
    items_per_page: PAGE_SIZE,
    attributes: 'all',
  };
  if (updatedOrCreatedSince) params.updated_or_created_since = updatedOrCreatedSince;

  return sageGet<SageInvoice>('/sales_invoices', accessToken, params);
}

export async function fetchSagePurchaseInvoices(
  accessToken: string,
  nextUrl?: string,
  updatedOrCreatedSince?: string
): Promise<SagePage<SageInvoice>> {
  if (nextUrl) return sageGet<SageInvoice>(nextUrl, accessToken);

  const params: Record<string, string> = {
    items_per_page: PAGE_SIZE,
    attributes: 'all',
  };
  if (updatedOrCreatedSince) params.updated_or_created_since = updatedOrCreatedSince;

  return sageGet<SageInvoice>('/purchase_invoices', accessToken, params);
}

export async function fetchSageJournals(
  accessToken: string,
  nextUrl?: string,
  updatedOrCreatedSince?: string
): Promise<SagePage<SageJournal>> {
  if (nextUrl) return sageGet<SageJournal>(nextUrl, accessToken);

  const params: Record<string, string> = {
    items_per_page: PAGE_SIZE,
    attributes: 'all',
  };
  if (updatedOrCreatedSince) params.updated_or_created_since = updatedOrCreatedSince;

  return sageGet<SageJournal>('/journals', accessToken, params);
}

export async function fetchSageContacts(
  accessToken: string,
  nextUrl?: string,
  updatedOrCreatedSince?: string
): Promise<SagePage<SageContact>> {
  if (nextUrl) return sageGet<SageContact>(nextUrl, accessToken);

  const params: Record<string, string> = {
    items_per_page: PAGE_SIZE,
    attributes: 'all',
  };
  if (updatedOrCreatedSince) params.updated_or_created_since = updatedOrCreatedSince;

  return sageGet<SageContact>('/contacts', accessToken, params);
}
