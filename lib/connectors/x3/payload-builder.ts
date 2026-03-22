/**
 * Sage X3 Payload Builder
 *
 * Converts the mapped field→value record from the transform step into
 * the specific JSON payload shapes expected by the X3 Syracuse REST/GraphQL API.
 *
 * Date handling: X3 accepts YYYYMMDD. Input may be YYYY-MM-DD or YYYYMMDD.
 * Debit/Credit: input accepts 'DEBIT'/'CREDIT', 'D'/'C', or '40'/'50'.
 */

import type { BuildPayloadContext } from '../connector.interface';
import type {
  X3Payload,
  X3JournalEntry, X3GlLine,
  X3SalesInvoice, X3SalesLine,
  X3PurchaseInvoice, X3PurchaseLine,
  X3Customer, X3Supplier, X3Item, X3Payment,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(m: Record<string, string>, field: string, label: string): string {
  const v = m[field]?.trim();
  if (!v) throw new Error(`${field} (${label}) is required for this X3 object type`);
  return v;
}

function opt(m: Record<string, string>, field: string): string | undefined {
  return m[field]?.trim() || undefined;
}

function num(m: Record<string, string>, field: string, label: string): number {
  const raw = req(m, field, label);
  const n = parseFloat(raw.replace(/,/g, ''));
  if (isNaN(n)) throw new Error(`${field} (${label}) must be a number, got "${raw}"`);
  return n;
}

function optNum(m: Record<string, string>, field: string): number | undefined {
  const v = m[field]?.trim();
  if (!v) return undefined;
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

/** Normalise a date string to X3 YYYYMMDD format */
function toX3Date(raw: string): string {
  const clean = raw.trim();
  if (!clean) throw new Error(`Invalid date value: "${raw}"`);
  // Already YYYYMMDD
  if (/^\d{8}$/.test(clean)) return clean;
  // YYYY-MM-DD or YYYY/MM/DD
  const iso = clean.replace(/[-/]/g, '');
  if (/^\d{8}$/.test(iso)) return iso;
  // DD/MM/YYYY (UK format)
  const ukMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ukMatch) return `${ukMatch[3]}${ukMatch[2]}${ukMatch[1]}`;
  // MM/DD/YYYY (US format)
  const usMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (usMatch) return `${usMatch[3]}${usMatch[1]}${usMatch[2]}`;
  throw new Error(`Cannot parse date "${raw}" — use YYYY-MM-DD`);
}

/** Convert DEBIT/CREDIT/D/C/40/50 to X3 SID value (40=debit, 50=credit) */
function toX3Side(raw: string): number {
  const upper = raw.trim().toUpperCase();
  if (upper === '40' || upper === 'D' || upper === 'DEBIT' || upper === 'DR') return 40;
  if (upper === '50' || upper === 'C' || upper === 'CREDIT' || upper === 'CR') return 50;
  throw new Error(`debit_credit must be DEBIT or CREDIT, got "${raw}"`);
}

// ── Builders ──────────────────────────────────────────────────────────────────

function buildGlJournalEntry(m: Record<string, string>): X3JournalEntry {
  const line: X3GlLine = {
    ACC:    req(m, 'gl_account',    'GL Account'),
    SID:    toX3Side(req(m, 'debit_credit', 'Debit / Credit')),
    AMTCUR: num(m, 'amount',        'Amount'),
    DESLIN: opt(m, 'line_description'),
    FCY:    opt(m, 'cost_center'),
    QTY:    optNum(m, 'quantity'),
  };

  // Strip undefined properties
  if (line.DESLIN === undefined) delete line.DESLIN;
  if (line.FCY    === undefined) delete line.FCY;
  if (line.QTY    === undefined) delete line.QTY;

  const entry: X3JournalEntry = {
    JOUENTRY: req(m, 'journal_code',     'Journal Code'),
    ACCDAT:   toX3Date(req(m, 'accounting_date', 'Accounting Date')),
    GRPLIN:   [{ GACCLIN: [line] }],
  };

  const des    = opt(m, 'description');
  const cur    = opt(m, 'currency');
  const rate   = optNum(m, 'exchange_rate');
  if (des)  entry.DES    = des;
  if (cur)  entry.CUR    = cur;
  if (rate !== undefined) entry.RATMLT = rate;

  return entry;
}

function buildSalesInvoice(m: Record<string, string>): X3SalesInvoice {
  const line: X3SalesLine = {
    ITMREF: req(m, 'item_code',   'Item Code'),
    QTY:    num(m, 'quantity',    'Quantity'),
    GROPRI: num(m, 'unit_price',  'Unit Price'),
    ITMDES:      opt(m, 'item_description'),
    DISCRGVAL1:  optNum(m, 'discount_pct'),
    VACITM1:     opt(m, 'vat_code'),
  };
  if (!line.ITMDES)     delete line.ITMDES;
  if (line.DISCRGVAL1 === undefined) delete line.DISCRGVAL1;
  if (!line.VACITM1)    delete line.VACITM1;

  const inv: X3SalesInvoice = {
    SIVTYP: req(m, 'invoice_type',   'Invoice Type'),
    BPCINV: req(m, 'customer_code',  'Customer Code'),
    INVDAT: toX3Date(req(m, 'invoice_date', 'Invoice Date')),
    SDHLIN: [line],
  };

  const accdat = opt(m, 'accounting_date');
  const num_   = opt(m, 'invoice_number');
  const cur    = opt(m, 'currency');
  const site   = opt(m, 'site');
  if (accdat) inv.ACCDAT = toX3Date(accdat);
  if (num_)   inv.NUM    = num_;
  if (cur)    inv.CUR    = cur;
  if (site)   inv.SALFCY = site;

  return inv;
}

function buildPurchaseInvoice(m: Record<string, string>): X3PurchaseInvoice {
  const line: X3PurchaseLine = {
    ITMREF: req(m, 'item_code',   'Item Code'),
    QTY:    num(m, 'quantity',    'Quantity'),
    GROPRI: num(m, 'unit_price',  'Unit Price'),
    ITMDES:  opt(m, 'item_description'),
    VACITM1: opt(m, 'vat_code'),
  };
  if (!line.ITMDES)  delete line.ITMDES;
  if (!line.VACITM1) delete line.VACITM1;

  const inv: X3PurchaseInvoice = {
    PIVTYP: req(m, 'invoice_type',   'Invoice Type'),
    BPSINV: req(m, 'supplier_code',  'Supplier Code'),
    INVDAT: toX3Date(req(m, 'invoice_date', 'Invoice Date')),
    PDHLIN: [line],
  };

  const accdat = opt(m, 'accounting_date');
  const cur    = opt(m, 'currency');
  const site   = opt(m, 'site');
  if (accdat) inv.ACCDAT = toX3Date(accdat);
  if (cur)    inv.CUR    = cur;
  if (site)   inv.PRHFCY = site;

  return inv;
}

function buildCustomer(m: Record<string, string>): X3Customer {
  const cust: X3Customer = {
    BPCNUM: req(m, 'customer_code', 'Customer Code'),
    BPCNAM: req(m, 'customer_name', 'Customer Name'),
  };

  const addr: X3Customer['BPCADD'] = {
    ADD1:   opt(m, 'address_line1'),
    ADD2:   opt(m, 'address_line2'),
    CTY:    opt(m, 'city'),
    POSCOD: opt(m, 'postal_code'),
    CRY:    opt(m, 'country'),
  };
  if (Object.values(addr).some(Boolean)) {
    cust.BPCADD = addr;
  }

  const stc = opt(m, 'tax_reg_number');
  const cur = opt(m, 'currency');
  const pte = opt(m, 'payment_terms');
  const grp = opt(m, 'customer_group');
  const tel = opt(m, 'phone');
  const web = opt(m, 'email');
  if (stc) cust.STCNUM = stc;
  if (cur) cust.CUR    = cur;
  if (pte) cust.PTE    = pte;
  if (grp) cust.BPCGRU = grp;
  if (tel) cust.TEL    = tel;
  if (web) cust.WEB    = web;

  return cust;
}

function buildSupplier(m: Record<string, string>): X3Supplier {
  const supp: X3Supplier = {
    BPSNUM: req(m, 'supplier_code', 'Supplier Code'),
    BPSNAM: req(m, 'supplier_name', 'Supplier Name'),
  };

  const addr: X3Supplier['BPSADD'] = {
    ADD1:   opt(m, 'address_line1'),
    CTY:    opt(m, 'city'),
    POSCOD: opt(m, 'postal_code'),
    CRY:    opt(m, 'country'),
  };
  if (Object.values(addr).some(Boolean)) supp.BPSADD = addr;

  const stc = opt(m, 'tax_reg_number');
  const cur = opt(m, 'currency');
  const pte = opt(m, 'payment_terms');
  const grp = opt(m, 'supplier_group');
  const tel = opt(m, 'phone');
  const web = opt(m, 'email');
  if (stc) supp.STCNUM = stc;
  if (cur) supp.CUR    = cur;
  if (pte) supp.PTE    = pte;
  if (grp) supp.BPSGRU = grp;
  if (tel) supp.TEL    = tel;
  if (web) supp.WEB    = web;

  return supp;
}

function buildItem(m: Record<string, string>): X3Item {
  const item: X3Item = {
    ITMREF:  req(m, 'item_code',    'Item Code'),
    ITMDES1: req(m, 'description1', 'Description 1'),
  };

  const d2  = opt(m, 'description2');
  const typ = opt(m, 'item_type');
  const tcl = opt(m, 'product_line');
  const stu = opt(m, 'unit_of_measure');
  const vac = opt(m, 'tax_code');
  const sta = opt(m, 'active');
  if (d2)  item.ITMDES2 = d2;
  if (typ) item.ITMTYP  = typ;
  if (tcl) item.TCLCOD  = tcl;
  if (stu) item.STU     = stu;
  if (vac) item.VACITM  = vac;
  if (sta) item.ITMSTA  = sta;

  return item;
}

function buildPayment(m: Record<string, string>): X3Payment {
  const pay: X3Payment = {
    PAYTYP: req(m, 'payment_type',      'Payment Type'),
    BPR:    req(m, 'business_partner',  'Business Partner'),
    PAYDAT: toX3Date(req(m, 'payment_date', 'Payment Date')),
    AMTCUR: num(m, 'amount',            'Amount'),
  };

  const bprtyp = opt(m, 'partner_type');
  const cur    = opt(m, 'currency');
  const bank   = opt(m, 'bank_account');
  const vcr    = opt(m, 'invoice_ref');
  const des    = opt(m, 'description');
  if (bprtyp) pay.BPRTYP = bprtyp;
  if (cur)    pay.CURPAY  = cur;
  if (bank)   pay.BANNUM  = bank;
  if (vcr)    pay.BPRVCR  = vcr;
  if (des)    pay.DES     = des;

  return pay;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function buildX3Payload(ctx: BuildPayloadContext): X3Payload {
  const { objectType, mappedFields: m } = ctx;

  switch (objectType) {
    case 'x3_gaccentry':
      return { type: 'x3_gaccentry', objectName: 'GACCENTRY', data: buildGlJournalEntry(m) };
    case 'x3_sinvoice':
      return { type: 'x3_sinvoice', objectName: 'SINVOICE', data: buildSalesInvoice(m) };
    case 'x3_pinvoice':
      return { type: 'x3_pinvoice', objectName: 'PINVOICE', data: buildPurchaseInvoice(m) };
    case 'x3_bpcustomer':
      return { type: 'x3_bpcustomer', objectName: 'BPCUSTOMER', data: buildCustomer(m) };
    case 'x3_bpsupplier':
      return { type: 'x3_bpsupplier', objectName: 'BPSUPPLIER', data: buildSupplier(m) };
    case 'x3_itmmaster':
      return { type: 'x3_itmmaster', objectName: 'ITMMASTER', data: buildItem(m) };
    case 'x3_payment':
      return { type: 'x3_payment', objectName: 'PAYMENT', data: buildPayment(m) };
    default:
      throw new Error(`Object type '${objectType}' is not supported by the Sage X3 connector`);
  }
}
