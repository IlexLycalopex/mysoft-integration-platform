/**
 * QuickBooks Online (Intuit Accounting API) client
 *
 * Base URL: https://quickbooks.api.intuit.com/v3/company/{realmId}/
 * Auth: OAuth 2.0 Bearer token
 * Queries: SQL-like SELECT syntax via /query endpoint
 */

const AUTH_URL  = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const API_BASE  = 'https://quickbooks.api.intuit.com/v3/company';
const MINOR_VERSION = '70';

import type { OAuthTokens } from '../source.interface';

interface QBOTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
}

export function buildQBOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scope = 'com.intuit.quickbooks.accounting'
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeQBOCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  realmId: string
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
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token exchange failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as QBOTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extraData: { realm_id: realmId },
  };
}

export async function refreshQBOToken(
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
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token refresh failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as QBOTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// ── Query runner ──────────────────────────────────────────────────────────────

export async function qboQuery<T>(
  sql: string,
  accessToken: string,
  realmId: string
): Promise<T[]> {
  const url = `${API_BASE}/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=${MINOR_VERSION}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) throw new Error('QBO_UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`QBO API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { QueryResponse: Record<string, unknown> };
  const queryResponse = json.QueryResponse ?? {};
  // The entity name is the first key that isn't startPosition/maxResults/totalCount
  const entityKey = Object.keys(queryResponse).find(
    (k) => !['startPosition', 'maxResults', 'totalCount'].includes(k)
  );
  if (!entityKey) return [];
  return (queryResponse[entityKey] as T[]) ?? [];
}

// ── QBO types ─────────────────────────────────────────────────────────────────

export interface QBORef { value: string; name?: string }

export interface QBOInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  CustomerRef?: QBORef;
  BillEmail?: { Address: string };
  CurrencyRef?: QBORef;
  ExchangeRate?: number;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  Line?: QBOLine[];
}

export interface QBOLine {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    Qty?: number;
    UnitPrice?: number;
    ItemRef?: QBORef;
    TaxCodeRef?: QBORef;
  };
  AccountBasedExpenseLineDetail?: { AccountRef?: QBORef };
  JournalEntryLineDetail?: {
    PostingType?: string;
    AccountRef?: QBORef;
    Entity?: { EntityRef?: QBORef; Type?: string };
  };
}

export interface QBOBill {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  VendorRef?: QBORef;
  CurrencyRef?: QBORef;
  TotalAmt?: number;
  Balance?: number;
  PrivateNote?: string;
  Line?: QBOLine[];
}

export interface QBOPayment {
  Id: string;
  PaymentRefNum?: string;
  TxnDate?: string;
  CustomerRef?: QBORef;
  TotalAmt?: number;
  CurrencyRef?: QBORef;
  ExchangeRate?: number;
  DepositToAccountRef?: QBORef;
  PrivateNote?: string;
}

export interface QBOJournalEntry {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  CurrencyRef?: QBORef;
  ExchangeRate?: number;
  PrivateNote?: string;
  Line?: QBOLine[];
}

export interface QBOVendor {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  PrintOnCheckName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Vendor1099?: boolean;
  AcctNum?: string;
  CurrencyRef?: QBORef;
  Balance?: number;
  BillAddr?: {
    Line1?: string; City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string; Country?: string;
  };
}

export interface QBOCustomer {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  CurrencyRef?: QBORef;
  Balance?: number;
  Notes?: string;
  BillAddr?: {
    Line1?: string; City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string; Country?: string;
  };
}

export interface QBOItem {
  Id: string;
  Name?: string;
  Sku?: string;
  Description?: string;
  Type?: string;
  UnitPrice?: number;
  PurchaseCost?: number;
  IncomeAccountRef?: QBORef;
  ExpenseAccountRef?: QBORef;
  QtyOnHand?: number;
  Active?: boolean;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const PAGE = 100;

export async function fetchQBOInvoices(
  accessToken: string, realmId: string, startPos: number, modifiedAfter?: string
): Promise<{ invoices: QBOInvoice[]; hasMore: boolean }> {
  const where = modifiedAfter ? ` WHERE Metadata.LastUpdatedTime >= '${modifiedAfter}'` : '';
  const sql = `SELECT * FROM Invoice${where} ORDERBY TxnDate ASC STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const invoices = await qboQuery<QBOInvoice>(sql, accessToken, realmId);
  return { invoices, hasMore: invoices.length === PAGE };
}

export async function fetchQBOBills(
  accessToken: string, realmId: string, startPos: number, modifiedAfter?: string
): Promise<{ bills: QBOBill[]; hasMore: boolean }> {
  const where = modifiedAfter ? ` WHERE Metadata.LastUpdatedTime >= '${modifiedAfter}'` : '';
  const sql = `SELECT * FROM Bill${where} ORDERBY TxnDate ASC STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const bills = await qboQuery<QBOBill>(sql, accessToken, realmId);
  return { bills, hasMore: bills.length === PAGE };
}

export async function fetchQBOPayments(
  accessToken: string, realmId: string, startPos: number, modifiedAfter?: string
): Promise<{ payments: QBOPayment[]; hasMore: boolean }> {
  const where = modifiedAfter ? ` WHERE Metadata.LastUpdatedTime >= '${modifiedAfter}'` : '';
  const sql = `SELECT * FROM Payment${where} ORDERBY TxnDate ASC STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const payments = await qboQuery<QBOPayment>(sql, accessToken, realmId);
  return { payments, hasMore: payments.length === PAGE };
}

export async function fetchQBOJournalEntries(
  accessToken: string, realmId: string, startPos: number, modifiedAfter?: string
): Promise<{ entries: QBOJournalEntry[]; hasMore: boolean }> {
  const where = modifiedAfter ? ` WHERE Metadata.LastUpdatedTime >= '${modifiedAfter}'` : '';
  const sql = `SELECT * FROM JournalEntry${where} ORDERBY TxnDate ASC STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const entries = await qboQuery<QBOJournalEntry>(sql, accessToken, realmId);
  return { entries, hasMore: entries.length === PAGE };
}

export async function fetchQBOVendors(
  accessToken: string, realmId: string, startPos: number
): Promise<{ vendors: QBOVendor[]; hasMore: boolean }> {
  const sql = `SELECT * FROM Vendor STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const vendors = await qboQuery<QBOVendor>(sql, accessToken, realmId);
  return { vendors, hasMore: vendors.length === PAGE };
}

export async function fetchQBOCustomers(
  accessToken: string, realmId: string, startPos: number
): Promise<{ customers: QBOCustomer[]; hasMore: boolean }> {
  const sql = `SELECT * FROM Customer STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const customers = await qboQuery<QBOCustomer>(sql, accessToken, realmId);
  return { customers, hasMore: customers.length === PAGE };
}

export async function fetchQBOItems(
  accessToken: string, realmId: string, startPos: number
): Promise<{ items: QBOItem[]; hasMore: boolean }> {
  const sql = `SELECT * FROM Item STARTPOSITION ${startPos} MAXRESULTS ${PAGE}`;
  const items = await qboQuery<QBOItem>(sql, accessToken, realmId);
  return { items, hasMore: items.length === PAGE };
}
