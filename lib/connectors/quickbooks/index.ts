import type {
  SourceConnector, SourceConnectorCapabilities, OAuthTokens,
  FetchContext, FetchResult, NormalizedRecord, SourceFieldDefinition,
} from '../source.interface';

import {
  buildQBOAuthUrl, exchangeQBOCode, refreshQBOToken,
  fetchQBOInvoices, fetchQBOBills, fetchQBOPayments,
  fetchQBOJournalEntries, fetchQBOVendors, fetchQBOCustomers, fetchQBOItems,
  type QBOInvoice, type QBOBill, type QBOPayment,
  type QBOJournalEntry, type QBOVendor, type QBOCustomer, type QBOItem, type QBOLine,
} from './client';

import { QBO_FIELD_DEFINITIONS } from './field-definitions';

function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeLines(lines: QBOLine[]): Record<string, string>[] {
  return lines
    .filter((l) => l.DetailType !== 'SubTotalLineDetail')
    .map((line, i) => {
      const sales = line.SalesItemLineDetail;
      const je    = line.JournalEntryLineDetail;
      const exp   = line.AccountBasedExpenseLineDetail;
      return {
        line_description:  s(line.Description),
        line_qty:          s(sales?.Qty),
        line_unit_price:   s(sales?.UnitPrice),
        line_amount:       s(line.Amount),
        line_account_ref:  s(exp?.AccountRef?.value ?? je?.AccountRef?.value),
        line_account_name: s(exp?.AccountRef?.name  ?? je?.AccountRef?.name),
        line_item_ref:     s(sales?.ItemRef?.value),
        line_item_name:    s(sales?.ItemRef?.name),
        line_tax_code:     s(sales?.TaxCodeRef?.value),
        line_posting_type: s(je?.PostingType),
        line_entity_type:  s(je?.Entity?.Type),
        line_entity_name:  s(je?.Entity?.EntityRef?.name),
        line_number:       s(i + 1),
      };
    });
}

function normalizeInvoice(inv: QBOInvoice): NormalizedRecord[] {
  const base: Record<string, string> = {
    id:            s(inv.Id),
    doc_number:    s(inv.DocNumber),
    txn_date:      s(inv.TxnDate),
    due_date:      s(inv.DueDate),
    customer_name: s(inv.CustomerRef?.name),
    customer_ref:  s(inv.CustomerRef?.value),
    bill_email:    s(inv.BillEmail?.Address),
    currency_code: s(inv.CurrencyRef?.value),
    exchange_rate: s(inv.ExchangeRate),
    total_amt:     s(inv.TotalAmt),
    balance:       s(inv.Balance),
    private_note:  s(inv.PrivateNote),
  };

  const lineRows = normalizeLines(inv.Line ?? []);
  if (!lineRows.length) {
    return [{ sourceId: inv.Id, sourceRef: inv.DocNumber, fields: base }];
  }
  return lineRows.map((lr) => ({
    sourceId: `${inv.Id}:${lr.line_number}`,
    sourceRef: inv.DocNumber,
    fields: { ...base, ...lr },
  }));
}

function normalizeBill(bill: QBOBill): NormalizedRecord[] {
  const base: Record<string, string> = {
    id:           s(bill.Id),
    doc_number:   s(bill.DocNumber),
    txn_date:     s(bill.TxnDate),
    due_date:     s(bill.DueDate),
    vendor_name:  s(bill.VendorRef?.name),
    vendor_ref:   s(bill.VendorRef?.value),
    currency_code:s(bill.CurrencyRef?.value),
    total_amt:    s(bill.TotalAmt),
    balance:      s(bill.Balance),
    private_note: s(bill.PrivateNote),
  };

  const lineRows = normalizeLines(bill.Line ?? []);
  if (!lineRows.length) {
    return [{ sourceId: bill.Id, sourceRef: bill.DocNumber, fields: base }];
  }
  return lineRows.map((lr) => ({
    sourceId: `${bill.Id}:${lr.line_number}`,
    sourceRef: bill.DocNumber,
    fields: { ...base, ...lr },
  }));
}

function normalizePayment(p: QBOPayment): NormalizedRecord {
  return {
    sourceId: p.Id,
    sourceRef: p.PaymentRefNum,
    fields: {
      id:                   s(p.Id),
      payment_ref_num:      s(p.PaymentRefNum),
      txn_date:             s(p.TxnDate),
      customer_name:        s(p.CustomerRef?.name),
      customer_ref:         s(p.CustomerRef?.value),
      total_amt:            s(p.TotalAmt),
      currency_code:        s(p.CurrencyRef?.value),
      exchange_rate:        s(p.ExchangeRate),
      deposit_to_account:   s(p.DepositToAccountRef?.name),
      private_note:         s(p.PrivateNote),
    },
  };
}

function normalizeJournalEntry(je: QBOJournalEntry): NormalizedRecord[] {
  const base: Record<string, string> = {
    id:            s(je.Id),
    doc_number:    s(je.DocNumber),
    txn_date:      s(je.TxnDate),
    currency_code: s(je.CurrencyRef?.value),
    exchange_rate: s(je.ExchangeRate),
    narration:     s(je.PrivateNote),
  };

  const lineRows = normalizeLines(je.Line ?? []);
  if (!lineRows.length) {
    return [{ sourceId: je.Id, sourceRef: je.DocNumber, fields: base }];
  }
  return lineRows.map((lr) => ({
    sourceId: `${je.Id}:${lr.line_number}`,
    sourceRef: je.DocNumber,
    fields: { ...base, ...lr },
  }));
}

function normalizeVendor(v: QBOVendor): NormalizedRecord {
  return {
    sourceId: v.Id,
    sourceRef: v.DisplayName,
    fields: {
      id:                   s(v.Id),
      display_name:         s(v.DisplayName),
      company_name:         s(v.CompanyName),
      print_on_check_name:  s(v.PrintOnCheckName),
      given_name:           s(v.GivenName),
      family_name:          s(v.FamilyName),
      email:                s(v.PrimaryEmailAddr?.Address),
      phone:                s(v.PrimaryPhone?.FreeFormNumber),
      vendor_1099:          s(v.Vendor1099),
      acct_num:             s(v.AcctNum),
      currency_code:        s(v.CurrencyRef?.value),
      balance:              s(v.Balance),
      bill_addr_line1:      s(v.BillAddr?.Line1),
      bill_addr_city:       s(v.BillAddr?.City),
      bill_addr_country:    s(v.BillAddr?.Country),
      bill_addr_postal_code:s(v.BillAddr?.PostalCode),
    },
  };
}

function normalizeCustomer(c: QBOCustomer): NormalizedRecord {
  return {
    sourceId: c.Id,
    sourceRef: c.DisplayName,
    fields: {
      id:                   s(c.Id),
      display_name:         s(c.DisplayName),
      company_name:         s(c.CompanyName),
      given_name:           s(c.GivenName),
      family_name:          s(c.FamilyName),
      email:                s(c.PrimaryEmailAddr?.Address),
      phone:                s(c.PrimaryPhone?.FreeFormNumber),
      currency_code:        s(c.CurrencyRef?.value),
      balance:              s(c.Balance),
      notes:                s(c.Notes),
      bill_addr_line1:      s(c.BillAddr?.Line1),
      bill_addr_city:       s(c.BillAddr?.City),
      bill_addr_country_sub_division_code: s(c.BillAddr?.CountrySubDivisionCode),
      bill_addr_postal_code:s(c.BillAddr?.PostalCode),
      bill_addr_country:    s(c.BillAddr?.Country),
    },
  };
}

function normalizeItem(item: QBOItem): NormalizedRecord {
  return {
    sourceId: item.Id,
    sourceRef: item.Name,
    fields: {
      id:                   s(item.Id),
      name:                 s(item.Name),
      sku:                  s(item.Sku),
      description:          s(item.Description),
      type:                 s(item.Type),
      unit_price:           s(item.UnitPrice),
      purchase_cost:        s(item.PurchaseCost),
      income_account_ref:   s(item.IncomeAccountRef?.value),
      income_account_name:  s(item.IncomeAccountRef?.name),
      expense_account_ref:  s(item.ExpenseAccountRef?.value),
      qty_on_hand:          s(item.QtyOnHand),
      active:               s(item.Active),
    },
  };
}

// ── Connector ─────────────────────────────────────────────────────────────────

export class QuickBooksConnector implements SourceConnector {
  readonly capabilities: SourceConnectorCapabilities = {
    connectorKey: 'quickbooks_online',
    displayName: 'QuickBooks Online',
    authType: 'oauth2',
    oauthScopes: ['com.intuit.quickbooks.accounting'],
    supportedObjectTypes: [
      'qbo_invoice', 'qbo_bill', 'qbo_payment', 'qbo_journal_entry',
      'qbo_vendor', 'qbo_customer', 'qbo_item',
    ],
    supportsDeltaSync: true,
    supportsHealthCheck: true,
  };

  private clientId     = process.env.QBO_CLIENT_ID ?? '';
  private clientSecret = process.env.QBO_CLIENT_SECRET ?? '';

  getAuthorizationUrl(state: string, redirectUri: string): string {
    return buildQBOAuthUrl(this.clientId, redirectUri, state);
  }

  async exchangeCode(code: string, redirectUri: string, realmId?: string): Promise<OAuthTokens> {
    return exchangeQBOCode(code, redirectUri, this.clientId, this.clientSecret, realmId ?? '');
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    return refreshQBOToken(refreshToken, this.clientId, this.clientSecret);
  }

  async healthCheck(credentials: OAuthTokens): Promise<{ ok: boolean; message?: string }> {
    try {
      const realmId = credentials.extraData?.realm_id ?? '';
      const { qboQuery } = await import('./client');
      const rows = await qboQuery<{ TaxCode: unknown }>('SELECT * FROM CompanyInfo', credentials.accessToken, realmId);
      return { ok: rows.length > 0 };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchRecords(ctx: FetchContext): Promise<FetchResult> {
    const { objectType, credentials, since } = ctx;
    const realmId     = credentials.extraData?.realm_id ?? '';
    const accessToken = credentials.accessToken;
    const modifiedAfter = since ? since.toISOString().slice(0, 19) : undefined;

    const pageToken = ctx.pageToken ?? '1';
    const startPos  = (parseInt(pageToken, 10) - 1) * 100 + 1;
    const records: NormalizedRecord[] = [];
    let hasMore = false;

    switch (objectType) {
      case 'qbo_invoice': {
        const { invoices, hasMore: more } = await fetchQBOInvoices(accessToken, realmId, startPos, modifiedAfter);
        invoices.forEach((inv) => records.push(...normalizeInvoice(inv)));
        hasMore = more;
        break;
      }
      case 'qbo_bill': {
        const { bills, hasMore: more } = await fetchQBOBills(accessToken, realmId, startPos, modifiedAfter);
        bills.forEach((b) => records.push(...normalizeBill(b)));
        hasMore = more;
        break;
      }
      case 'qbo_payment': {
        const { payments, hasMore: more } = await fetchQBOPayments(accessToken, realmId, startPos, modifiedAfter);
        payments.forEach((p) => records.push(normalizePayment(p)));
        hasMore = more;
        break;
      }
      case 'qbo_journal_entry': {
        const { entries, hasMore: more } = await fetchQBOJournalEntries(accessToken, realmId, startPos, modifiedAfter);
        entries.forEach((je) => records.push(...normalizeJournalEntry(je)));
        hasMore = more;
        break;
      }
      case 'qbo_vendor': {
        const { vendors, hasMore: more } = await fetchQBOVendors(accessToken, realmId, startPos);
        vendors.forEach((v) => records.push(normalizeVendor(v)));
        hasMore = more;
        break;
      }
      case 'qbo_customer': {
        const { customers, hasMore: more } = await fetchQBOCustomers(accessToken, realmId, startPos);
        customers.forEach((c) => records.push(normalizeCustomer(c)));
        hasMore = more;
        break;
      }
      case 'qbo_item': {
        const { items, hasMore: more } = await fetchQBOItems(accessToken, realmId, startPos);
        items.forEach((i) => records.push(normalizeItem(i)));
        hasMore = more;
        break;
      }
      default:
        throw new Error(`QuickBooks connector: unsupported object type "${objectType}"`);
    }

    return {
      records,
      hasMore,
      nextPageToken: hasMore ? String(parseInt(pageToken, 10) + 1) : undefined,
    };
  }

  getFieldDefinitions(objectType: string): SourceFieldDefinition[] {
    return QBO_FIELD_DEFINITIONS[objectType] ?? [];
  }
}

export const quickBooksConnector = new QuickBooksConnector();
