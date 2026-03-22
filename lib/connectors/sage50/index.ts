import type {
  SourceConnector, SourceConnectorCapabilities, OAuthTokens,
  FetchContext, FetchResult, NormalizedRecord, SourceFieldDefinition,
} from '../source.interface';

import {
  buildSage50AuthUrl, exchangeSage50Code, refreshSage50Token,
  fetchSageSalesInvoices, fetchSagePurchaseInvoices, fetchSageJournals, fetchSageContacts,
  sageGet,
  type SageInvoice, type SageJournal, type SageContact,
} from './client';

import { SAGE50_FIELD_DEFINITIONS } from './field-definitions';

function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeInvoice(inv: SageInvoice): NormalizedRecord[] {
  const base: Record<string, string> = {
    id:                 s(inv.id),
    invoice_number:     s(inv.invoice_number),
    reference:          s(inv.reference),
    contact_id:         s(inv.contact?.id),
    contact_name:       s(inv.contact?.displayed_as),
    contact_ref:        s(inv.contact?.reference),
    date:               s(inv.date),
    due_date:           s(inv.due_date),
    currency_code:      s(inv.currency?.displayed_as),
    status:             s(inv.status?.displayed_as),
    net_amount:         s(inv.net_amount),
    tax_amount:         s(inv.tax_amount),
    total_amount:       s(inv.total_amount),
    outstanding_amount: s(inv.outstanding_amount),
    notes:              s(inv.notes),
  };

  const lines = inv.invoice_lines ?? [];
  if (!lines.length) {
    return [{ sourceId: inv.id, sourceRef: inv.invoice_number, fields: base }];
  }

  return lines.map((line, i) => ({
    sourceId: `${inv.id}:${line.id ?? i}`,
    sourceRef: inv.invoice_number,
    fields: {
      ...base,
      line_description:    s(line.description),
      line_quantity:       s(line.quantity),
      line_unit_price:     s(line.unit_price),
      line_net_amount:     s(line.net_amount),
      line_tax_amount:     s(line.tax_amount),
      line_total_amount:   s(line.total_amount),
      line_ledger_account: s(line.ledger_account?.id),
      line_ledger_name:    s(line.ledger_account?.displayed_as),
      line_tax_code:       s(line.tax_rate?.displayed_as),
      line_number:         s(i + 1),
    },
  }));
}

function normalizeJournal(j: SageJournal): NormalizedRecord[] {
  const base: Record<string, string> = {
    id:           s(j.id),
    date:         s(j.date),
    reference:    s(j.reference),
    description:  s(j.description),
    journal_code: s(j.journal_code?.displayed_as),
    currency_code:s(j.currency?.displayed_as),
  };

  const lines = j.journal_lines ?? [];
  if (!lines.length) {
    return [{ sourceId: j.id, sourceRef: j.reference, fields: base }];
  }

  return lines.map((line, i) => ({
    sourceId: `${j.id}:${line.id ?? i}`,
    sourceRef: j.reference,
    fields: {
      ...base,
      line_description:          s(line.description),
      line_ledger_account:       s(line.ledger_account?.id),
      line_ledger_account_name:  s(line.ledger_account?.displayed_as),
      line_debit:                s(line.debit),
      line_credit:               s(line.credit),
      line_tax_code:             s(line.tax_rate?.displayed_as),
      line_number:               s(i + 1),
    },
  }));
}

function normalizeContact(c: SageContact): NormalizedRecord {
  return {
    sourceId: c.id,
    sourceRef: c.displayed_as,
    fields: {
      id:             s(c.id),
      name:           s(c.displayed_as),
      reference:      s(c.reference),
      contact_type:   s(c.contact_type?.displayed_as),
      status:         s(c.status?.displayed_as),
      email:          s(c.email),
      phone:          s(c.telephone),
      website:        s(c.website),
      address_line_1: s(c.main_address?.address_line_1),
      address_line_2: s(c.main_address?.address_line_2),
      city:           s(c.main_address?.city),
      region:         s(c.main_address?.region),
      postal_code:    s(c.main_address?.postal_code),
      country:        s(c.main_address?.country?.displayed_as),
      currency_code:  s(c.currency?.displayed_as),
      balance:        s(c.balance),
      credit_limit:   s(c.credit_limit),
      tax_number:     s(c.tax_number),
      notes:          s(c.notes),
    },
  };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class Sage50Connector implements SourceConnector {
  readonly capabilities: SourceConnectorCapabilities = {
    connectorKey: 'sage50cloud',
    displayName: 'Sage 50cloud',
    authType: 'oauth2',
    oauthScopes: ['full_access'],
    supportedObjectTypes: [
      'sage50_sales_invoice', 'sage50_purchase_invoice',
      'sage50_journal', 'sage50_contact',
    ],
    supportsDeltaSync: true,
    supportsHealthCheck: true,
  };

  private clientId     = process.env.SAGE50_CLIENT_ID ?? '';
  private clientSecret = process.env.SAGE50_CLIENT_SECRET ?? '';

  getAuthorizationUrl(state: string, redirectUri: string): string {
    return buildSage50AuthUrl(this.clientId, redirectUri, state);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return exchangeSage50Code(code, redirectUri, this.clientId, this.clientSecret);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    return refreshSage50Token(refreshToken, this.clientId, this.clientSecret);
  }

  async healthCheck(credentials: OAuthTokens): Promise<{ ok: boolean; message?: string }> {
    try {
      const page = await sageGet('/business', credentials.accessToken);
      return { ok: !!(page as unknown as Record<string, unknown>).id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchRecords(ctx: FetchContext): Promise<FetchResult> {
    const { objectType, credentials, since } = ctx;
    const accessToken = credentials.accessToken;
    const since_str   = since ? since.toISOString() : undefined;
    const nextUrl     = ctx.pageToken && ctx.pageToken !== '1' ? ctx.pageToken : undefined;

    const records: NormalizedRecord[] = [];
    let nextPageToken: string | undefined;

    switch (objectType) {
      case 'sage50_sales_invoice': {
        const page = await fetchSageSalesInvoices(accessToken, nextUrl, since_str);
        page.$items.forEach((inv) => records.push(...normalizeInvoice(inv)));
        nextPageToken = page.$next;
        break;
      }
      case 'sage50_purchase_invoice': {
        const page = await fetchSagePurchaseInvoices(accessToken, nextUrl, since_str);
        page.$items.forEach((inv) => records.push(...normalizeInvoice(inv)));
        nextPageToken = page.$next;
        break;
      }
      case 'sage50_journal': {
        const page = await fetchSageJournals(accessToken, nextUrl, since_str);
        page.$items.forEach((j) => records.push(...normalizeJournal(j)));
        nextPageToken = page.$next;
        break;
      }
      case 'sage50_contact': {
        const page = await fetchSageContacts(accessToken, nextUrl, since_str);
        page.$items.forEach((c) => records.push(normalizeContact(c)));
        nextPageToken = page.$next;
        break;
      }
      default:
        throw new Error(`Sage 50 connector: unsupported object type "${objectType}"`);
    }

    return {
      records,
      hasMore: !!nextPageToken,
      nextPageToken,
    };
  }

  getFieldDefinitions(objectType: string): SourceFieldDefinition[] {
    return SAGE50_FIELD_DEFINITIONS[objectType] ?? [];
  }
}

export const sage50Connector = new Sage50Connector();
