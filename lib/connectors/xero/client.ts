/**
 * Xero API client
 *
 * Wraps the Xero Accounting API (api.xero.com/api.xro/2.0/).
 * All requests are JSON (Accept: application/json).
 * Auth: OAuth 2.0 Bearer token + Xero-tenant-id header.
 */

import type { OAuthTokens } from '../source.interface';

const TOKEN_URL  = 'https://identity.xero.com/connect/token';
const AUTH_URL   = 'https://login.xero.com/identity/connect/authorize';
const API_BASE   = 'https://api.xero.com/api.xro/2.0';
const CONNECTIONS_URL = 'https://api.xero.com/connections';

interface XeroTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

export function buildXeroAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes = 'openid profile email accounting.transactions accounting.contacts offline_access'
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeXeroCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero token exchange failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as XeroTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshXeroToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero token refresh failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as XeroTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function getXeroTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch Xero tenants (${res.status})`);
  const data = (await res.json()) as XeroTenant[];
  return data;
}

// ── Generic API fetch ─────────────────────────────────────────────────────────

async function xeroGet(
  path: string,
  accessToken: string,
  xeroTenantId: string,
  params?: Record<string, string>
): Promise<unknown> {
  let url = `${API_BASE}${path}`;
  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': xeroTenantId,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) throw new Error('XERO_UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Xero API error ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ── Invoices (AR + AP) ────────────────────────────────────────────────────────

export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Reference?: string;
  Type: string;
  Status: string;
  Contact?: { ContactID: string; Name: string; EmailAddress?: string; AccountNumber?: string };
  Date?: string;
  DueDate?: string;
  CurrencyCode?: string;
  CurrencyRate?: number;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  LineItems?: XeroLineItem[];
}

export interface XeroLineItem {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  AccountCode?: string;
  ItemCode?: string;
  TaxType?: string;
  TaxAmount?: number;
  LineAmount?: number;
  Tracking?: { Name: string; Option: string }[];
}

export async function fetchXeroInvoices(
  accessToken: string,
  xeroTenantId: string,
  type: 'ACCREC' | 'ACCPAY',
  modifiedAfter?: string,
  page = 1
): Promise<{ invoices: XeroInvoice[]; hasMore: boolean }> {
  const params: Record<string, string> = {
    Type: type,
    page: String(page),
    pageSize: '100',
    order: 'UpdatedDateUTC ASC',
  };
  if (modifiedAfter) params.ModifiedAfter = modifiedAfter;

  const data = (await xeroGet('/Invoices', accessToken, xeroTenantId, params)) as {
    Invoices: XeroInvoice[];
  };
  const invoices = data.Invoices ?? [];
  return { invoices, hasMore: invoices.length === 100 };
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface XeroPayment {
  PaymentID: string;
  Type: string;
  Status: string;
  Reference?: string;
  Date?: string;
  Amount?: number;
  CurrencyRate?: number;
  Account?: { Code: string; Name: string };
  Invoice?: { InvoiceID: string; InvoiceNumber: string };
  Contact?: { Name: string };
  IsReconciled?: boolean;
  CurrencyCode?: string;
}

export async function fetchXeroPayments(
  accessToken: string,
  xeroTenantId: string,
  modifiedAfter?: string,
  page = 1
): Promise<{ payments: XeroPayment[]; hasMore: boolean }> {
  const params: Record<string, string> = { page: String(page), pageSize: '100' };
  if (modifiedAfter) params.ModifiedAfter = modifiedAfter;

  const data = (await xeroGet('/Payments', accessToken, xeroTenantId, params)) as {
    Payments: XeroPayment[];
  };
  const payments = data.Payments ?? [];
  return { payments, hasMore: payments.length === 100 };
}

// ── Manual Journals ───────────────────────────────────────────────────────────

export interface XeroJournal {
  JournalID: string;
  JournalNumber: number;
  Narration?: string;
  JournalDate?: string;
  Reference?: string;
  ShowOnCashBasisReports?: boolean;
  JournalLines?: XeroJournalLine[];
}

export interface XeroJournalLine {
  JournalLineID: string;
  AccountID?: string;
  AccountCode?: string;
  AccountName?: string;
  AccountType?: string;
  Description?: string;
  NetAmount?: number;
  GrossAmount?: number;
  TaxAmount?: number;
  TaxType?: string;
  IsBlank?: boolean;
  TrackingCategories?: { Name: string; Option: string }[];
}

export async function fetchXeroJournals(
  accessToken: string,
  xeroTenantId: string,
  offset = 0
): Promise<{ journals: XeroJournal[]; hasMore: boolean }> {
  const params: Record<string, string> = { offset: String(offset) };
  const data = (await xeroGet('/Journals', accessToken, xeroTenantId, params)) as {
    Journals: XeroJournal[];
  };
  const journals = data.Journals ?? [];
  return { journals, hasMore: journals.length === 100 };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export interface XeroContact {
  ContactID: string;
  Name: string;
  AccountNumber?: string;
  TaxNumber?: string;
  EmailAddress?: string;
  Phones?: { PhoneType: string; PhoneNumber: string }[];
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  ContactStatus?: string;
  Addresses?: {
    AddressType: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }[];
  BankAccountDetails?: string;
}

export async function fetchXeroContacts(
  accessToken: string,
  xeroTenantId: string,
  modifiedAfter?: string,
  page = 1
): Promise<{ contacts: XeroContact[]; hasMore: boolean }> {
  const params: Record<string, string> = { page: String(page), pageSize: '100' };
  if (modifiedAfter) params.ModifiedAfter = modifiedAfter;

  const data = (await xeroGet('/Contacts', accessToken, xeroTenantId, params)) as {
    Contacts: XeroContact[];
  };
  const contacts = data.Contacts ?? [];
  return { contacts, hasMore: contacts.length === 100 };
}

// ── Items ─────────────────────────────────────────────────────────────────────

export interface XeroItem {
  ItemID: string;
  Code: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsTrackedAsInventory?: boolean;
  IsSold?: boolean;
  IsPurchased?: boolean;
  SalesDetails?: { UnitPrice: number; AccountCode: string };
  PurchaseDetails?: { UnitPrice: number; AccountCode: string };
  QuantityOnHand?: number;
}

export async function fetchXeroItems(
  accessToken: string,
  xeroTenantId: string
): Promise<XeroItem[]> {
  const data = (await xeroGet('/Items', accessToken, xeroTenantId)) as {
    Items: XeroItem[];
  };
  return data.Items ?? [];
}
