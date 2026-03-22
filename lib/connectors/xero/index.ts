/**
 * Xero Source Connector
 *
 * Implements SourceConnector for the Xero Accounting API.
 * OAuth 2.0 (authorization_code flow with offline_access scope for refresh tokens).
 * One record is produced per LINE ITEM for invoices/bills/journals
 * (document-level fields are repeated on each row).
 */

import type {
  SourceConnector,
  SourceConnectorCapabilities,
  OAuthTokens,
  FetchContext,
  FetchResult,
  NormalizedRecord,
  SourceFieldDefinition,
} from '../source.interface';

import {
  buildXeroAuthUrl,
  exchangeXeroCode,
  refreshXeroToken,
  getXeroTenants,
  fetchXeroInvoices,
  fetchXeroPayments,
  fetchXeroJournals,
  fetchXeroContacts,
  fetchXeroItems,
  type XeroInvoice,
  type XeroJournal,
  type XeroContact,
  type XeroItem,
  type XeroPayment,
} from './client';

import { XERO_FIELD_DEFINITIONS } from './field-definitions';

function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeInvoice(inv: XeroInvoice): NormalizedRecord[] {
  const base: Record<string, string> = {
    invoice_id:             s(inv.InvoiceID),
    invoice_number:         s(inv.InvoiceNumber),
    reference:              s(inv.Reference),
    type:                   s(inv.Type),
    status:                 s(inv.Status),
    contact_id:             s(inv.Contact?.ContactID),
    contact_name:           s(inv.Contact?.Name),
    contact_email:          s(inv.Contact?.EmailAddress),
    contact_account_number: s(inv.Contact?.AccountNumber),
    date:                   s(inv.Date),
    due_date:               s(inv.DueDate),
    currency_code:          s(inv.CurrencyCode),
    currency_rate:          s(inv.CurrencyRate),
    sub_total:              s(inv.SubTotal),
    total_tax:              s(inv.TotalTax),
    total:                  s(inv.Total),
    amount_due:             s(inv.AmountDue),
    amount_paid:            s(inv.AmountPaid),
  };

  const lines = inv.LineItems ?? [];
  if (!lines.length) {
    return [{ sourceId: inv.InvoiceID, sourceRef: inv.InvoiceNumber, fields: base }];
  }

  return lines.map((line, i) => ({
    sourceId: `${inv.InvoiceID}:${line.LineItemID ?? i}`,
    sourceRef: inv.InvoiceNumber,
    fields: {
      ...base,
      line_item_id:       s(line.LineItemID),
      line_description:   s(line.Description),
      line_quantity:      s(line.Quantity),
      line_unit_amount:   s(line.UnitAmount),
      line_account_code:  s(line.AccountCode),
      line_item_code:     s(line.ItemCode),
      line_tax_type:      s(line.TaxType),
      line_tax_amount:    s(line.TaxAmount),
      line_amount:        s(line.LineAmount),
      line_tracking_name: s(line.Tracking?.[0]?.Name),
      line_tracking_option: s(line.Tracking?.[0]?.Option),
      line_number:        s(i + 1),
    },
  }));
}

function normalizeJournal(j: XeroJournal): NormalizedRecord[] {
  const base: Record<string, string> = {
    journal_id:          s(j.JournalID),
    journal_number:      s(j.JournalNumber),
    narration:           s(j.Narration),
    date:                s(j.JournalDate),
    reference:           s(j.Reference),
    show_on_cash_basis:  s(j.ShowOnCashBasisReports),
  };

  const lines = j.JournalLines ?? [];
  if (!lines.length) {
    return [{ sourceId: j.JournalID, sourceRef: `J-${j.JournalNumber}`, fields: base }];
  }

  return lines.map((line, i) => ({
    sourceId: `${j.JournalID}:${line.JournalLineID ?? i}`,
    sourceRef: `J-${j.JournalNumber}`,
    fields: {
      ...base,
      line_account_code:  s(line.AccountCode),
      line_account_name:  s(line.AccountName),
      line_account_type:  s(line.AccountType),
      line_description:   s(line.Description),
      line_net_amount:    s(line.NetAmount),
      line_gross_amount:  s(line.GrossAmount),
      line_tax_amount:    s(line.TaxAmount),
      line_tax_type:      s(line.TaxType),
      line_is_net:        s(line.IsBlank ? false : true),
      line_tracking_name: s(line.TrackingCategories?.[0]?.Name),
      line_number:        s(i + 1),
    },
  }));
}

function normalizeContact(c: XeroContact): NormalizedRecord {
  const postal = c.Addresses?.find((a) => a.AddressType === 'POBOX')
    ?? c.Addresses?.[0];
  const phone = c.Phones?.find((p) => p.PhoneType === 'DEFAULT')
    ?? c.Phones?.[0];

  return {
    sourceId: c.ContactID,
    sourceRef: c.Name,
    fields: {
      contact_id:           s(c.ContactID),
      name:                 s(c.Name),
      account_number:       s(c.AccountNumber),
      tax_number:           s(c.TaxNumber),
      email:                s(c.EmailAddress),
      phone:                s(phone?.PhoneNumber),
      is_customer:          s(c.IsCustomer),
      is_supplier:          s(c.IsSupplier),
      contact_status:       s(c.ContactStatus),
      address_line1:        s(postal?.AddressLine1),
      address_line2:        s(postal?.AddressLine2),
      city:                 s(postal?.City),
      region:               s(postal?.Region),
      postal_code:          s(postal?.PostalCode),
      country:              s(postal?.Country),
      bank_account_number:  s(c.BankAccountDetails),
    },
  };
}

function normalizePayment(p: XeroPayment): NormalizedRecord {
  return {
    sourceId: p.PaymentID,
    sourceRef: p.Reference,
    fields: {
      payment_id:          s(p.PaymentID),
      type:                s(p.Type),
      status:              s(p.Status),
      reference:           s(p.Reference),
      payment_date:        s(p.Date),
      amount:              s(p.Amount),
      currency_code:       s(p.CurrencyCode),
      currency_rate:       s(p.CurrencyRate),
      bank_account_code:   s(p.Account?.Code),
      bank_account_name:   s(p.Account?.Name),
      invoice_number:      s(p.Invoice?.InvoiceNumber),
      invoice_id:          s(p.Invoice?.InvoiceID),
      contact_name:        s(p.Contact?.Name),
      is_reconciled:       s(p.IsReconciled),
    },
  };
}

function normalizeItem(item: XeroItem): NormalizedRecord {
  return {
    sourceId: item.ItemID,
    sourceRef: item.Code,
    fields: {
      item_id:           s(item.ItemID),
      code:              s(item.Code),
      name:              s(item.Name),
      description:       s(item.Description),
      purchase_description: s(item.PurchaseDescription),
      is_tracked:        s(item.IsTrackedAsInventory),
      is_sold:           s(item.IsSold),
      is_purchased:      s(item.IsPurchased),
      sales_price:       s(item.SalesDetails?.UnitPrice),
      sales_account:     s(item.SalesDetails?.AccountCode),
      purchase_price:    s(item.PurchaseDetails?.UnitPrice),
      purchase_account:  s(item.PurchaseDetails?.AccountCode),
      quantity_on_hand:  s(item.QuantityOnHand),
    },
  };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class XeroConnector implements SourceConnector {
  readonly capabilities: SourceConnectorCapabilities = {
    connectorKey: 'xero',
    displayName: 'Xero',
    authType: 'oauth2',
    oauthScopes: [
      'openid', 'profile', 'email',
      'accounting.transactions',
      'accounting.contacts',
      'offline_access',
    ],
    supportedObjectTypes: [
      'xero_invoice', 'xero_bill', 'xero_credit_note',
      'xero_payment', 'xero_journal', 'xero_contact', 'xero_item',
    ],
    supportsDeltaSync: true,
    supportsHealthCheck: true,
  };

  private clientId     = process.env.XERO_CLIENT_ID ?? '';
  private clientSecret = process.env.XERO_CLIENT_SECRET ?? '';

  getAuthorizationUrl(state: string, redirectUri: string): string {
    return buildXeroAuthUrl(this.clientId, redirectUri, state);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return exchangeXeroCode(code, redirectUri, this.clientId, this.clientSecret);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    return refreshXeroToken(refreshToken, this.clientId, this.clientSecret);
  }

  async healthCheck(credentials: OAuthTokens): Promise<{ ok: boolean; message?: string }> {
    try {
      const tenants = await getXeroTenants(credentials.accessToken);
      if (!tenants.length) return { ok: false, message: 'No Xero organisations found' };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchRecords(ctx: FetchContext): Promise<FetchResult> {
    const { objectType, credentials, since } = ctx;
    const xeroTenantId = credentials.extraData?.xero_tenant_id ?? '';
    const accessToken  = credentials.accessToken;
    const modifiedAfter = since ? since.toISOString() : undefined;

    const records: NormalizedRecord[] = [];
    let hasMore = false;
    const pageToken = ctx.pageToken ?? '1';
    const page = parseInt(pageToken, 10);

    switch (objectType) {
      case 'xero_invoice': {
        const { invoices, hasMore: more } = await fetchXeroInvoices(
          accessToken, xeroTenantId, 'ACCREC', modifiedAfter, page
        );
        invoices.forEach((inv) => records.push(...normalizeInvoice(inv)));
        hasMore = more;
        break;
      }
      case 'xero_bill': {
        const { invoices, hasMore: more } = await fetchXeroInvoices(
          accessToken, xeroTenantId, 'ACCPAY', modifiedAfter, page
        );
        invoices.forEach((inv) => records.push(...normalizeInvoice(inv)));
        hasMore = more;
        break;
      }
      case 'xero_credit_note': {
        // Credit notes use the same invoice endpoint with Type=ACCRECCREDIT or ACCPAYCREDIT
        const arCN = await fetchXeroInvoices(accessToken, xeroTenantId, 'ACCREC', modifiedAfter, page);
        const apCN = await fetchXeroInvoices(accessToken, xeroTenantId, 'ACCPAY', modifiedAfter, page);
        [...arCN.invoices, ...apCN.invoices]
          .filter((i) => i.Type.includes('CREDIT'))
          .forEach((inv) => records.push(...normalizeInvoice(inv)));
        hasMore = arCN.hasMore || apCN.hasMore;
        break;
      }
      case 'xero_payment': {
        const { payments, hasMore: more } = await fetchXeroPayments(
          accessToken, xeroTenantId, modifiedAfter, page
        );
        payments.forEach((p) => records.push(normalizePayment(p)));
        hasMore = more;
        break;
      }
      case 'xero_journal': {
        const offset = (page - 1) * 100;
        const { journals, hasMore: more } = await fetchXeroJournals(
          accessToken, xeroTenantId, offset
        );
        journals.forEach((j) => records.push(...normalizeJournal(j)));
        hasMore = more;
        break;
      }
      case 'xero_contact': {
        const { contacts, hasMore: more } = await fetchXeroContacts(
          accessToken, xeroTenantId, modifiedAfter, page
        );
        contacts.forEach((c) => records.push(normalizeContact(c)));
        hasMore = more;
        break;
      }
      case 'xero_item': {
        const items = await fetchXeroItems(accessToken, xeroTenantId);
        items.forEach((item) => records.push(normalizeItem(item)));
        hasMore = false;
        break;
      }
      default:
        throw new Error(`Xero connector: unsupported object type "${objectType}"`);
    }

    return {
      records,
      hasMore,
      nextPageToken: hasMore ? String(page + 1) : undefined,
    };
  }

  getFieldDefinitions(objectType: string): SourceFieldDefinition[] {
    return XERO_FIELD_DEFINITIONS[objectType] ?? [];
  }
}

export const xeroConnector = new XeroConnector();
