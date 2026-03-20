/**
 * Intacct Payload Builder
 *
 * Builds connector-specific request payloads from mapped field→value records.
 * Extracted from processor.ts — all Intacct-specific field mapping logic lives here.
 * The orchestration engine is fully agnostic of these shapes.
 */

import type { BuildPayloadContext } from '../connector.interface';
import type {
  JournalEntry, JournalEntryLine,
  ArInvoice, ArInvoiceLine,
  ApBill, ApBillLine,
  ArPayment, ApPayment,
  ExpenseReport, ExpenseReportLine,
  TimesheetEntry, TimesheetLine,
  Vendor, Customer,
} from '@/lib/intacct/client';

export type IntacctPayload =
  | { type: 'journal_entry';   data: JournalEntry }
  | { type: 'ar_invoice';      data: ArInvoice }
  | { type: 'ap_bill';         data: ApBill }
  | { type: 'ar_payment';      data: ArPayment }
  | { type: 'ap_payment';      data: ApPayment }
  | { type: 'expense_report';  data: ExpenseReport }
  | { type: 'timesheet';       data: TimesheetEntry }
  | { type: 'vendor';          data: Vendor }
  | { type: 'customer';        data: Customer };

/**
 * Build the Intacct-specific payload from mapped fields.
 * Throws with a clear message if required fields are missing.
 */
export function buildIntacctPayload(ctx: BuildPayloadContext): IntacctPayload {
  const { objectType, mappedFields: m, entityId } = ctx;

  switch (objectType) {
    case 'journal_entry':   return buildJournalEntry(m, entityId);
    case 'ar_invoice':      return buildArInvoice(m, entityId);
    case 'ap_bill':         return buildApBill(m, entityId);
    case 'ar_payment':      return buildArPayment(m, entityId);
    case 'ap_payment':      return buildApPayment(m, entityId);
    case 'expense_report':  return buildExpenseReport(m, entityId);
    case 'timesheet':       return buildTimesheet(m, entityId);
    case 'vendor':          return buildVendor(m);
    case 'customer':        return buildCustomer(m);
    default:
      throw new Error(`Transaction type '${objectType}' is not supported by the Intacct connector`);
  }
}

// ── Builders ──────────────────────────────────────────────────────────────────

function req(m: Record<string, string>, field: string, label: string): string {
  const v = m[field];
  if (!v) throw new Error(`${field} (${label}) is required`);
  return v;
}

function buildJournalEntry(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'journal_entry'; data: JournalEntry } {
  // Journal entries require at least JOURNALID + WHENCREATED + lines
  const journalId   = req(m, 'JOURNALID',   'journal symbol');
  const postingDate = req(m, 'WHENCREATED', 'posting date');

  const rawTrType = m['TR_TYPE'];
  const trType: '1' | '-1' = rawTrType === '-1' ? '-1' : '1';

  const line: JournalEntryLine = {
    accountNo:    req(m, 'GLACCOUNTNO', 'GL account'),
    amount:       req(m, 'AMOUNT',      'amount'),
    trType,
    memo:         m['MEMO']         || undefined,
    locationId:   m['LOCATIONID']   || entityId || undefined,
    departmentId: m['DEPARTMENTID'] || undefined,
    projectId:    m['PROJECTID']    || undefined,
    customerId:   m['CUSTOMERID']   || undefined,
    vendorId:     m['VENDORID']     || undefined,
    employeeId:   m['EMPLOYEEID']   || undefined,
    itemId:       m['ITEMID']       || undefined,
    classId:      m['CLASSID']      || undefined,
  };

  return {
    type: 'journal_entry',
    data: {
      journalId,
      postingDate,
      description:  m['DESCRIPTION'] || undefined,
      referenceNo:  m['REFERENCENO'] || undefined,
      lines: [line],
    },
  };
}

function buildArInvoice(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'ar_invoice'; data: ArInvoice } {
  const line: ArInvoiceLine = {
    accountNo:    req(m, 'GLACCOUNTNO', 'GL account'),
    amount:       req(m, 'AMOUNT',      'amount'),
    memo:         m['MEMO']         || undefined,
    locationId:   m['LOCATIONID']   || entityId || undefined,
    departmentId: m['DEPARTMENTID'] || undefined,
    projectId:    m['PROJECTID']    || undefined,
    classId:      m['CLASSID']      || undefined,
  };

  return {
    type: 'ar_invoice',
    data: {
      customerId:  req(m, 'CUSTOMERID',  'customer ID'),
      postingDate: req(m, 'WHENCREATED', 'posting date'),
      dueDate:     m['WHENDUE']     || undefined,
      description: m['DESCRIPTION'] || undefined,
      referenceNo: m['REFERENCENO'] || undefined,
      currency:    m['CURRENCY']    || undefined,
      lines: [line],
    },
  };
}

function buildApBill(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'ap_bill'; data: ApBill } {
  const line: ApBillLine = {
    accountNo:    req(m, 'GLACCOUNTNO', 'GL account'),
    amount:       req(m, 'AMOUNT',      'amount'),
    memo:         m['MEMO']         || undefined,
    locationId:   m['LOCATIONID']   || entityId || undefined,
    departmentId: m['DEPARTMENTID'] || undefined,
    projectId:    m['PROJECTID']    || undefined,
    classId:      m['CLASSID']      || undefined,
  };

  return {
    type: 'ap_bill',
    data: {
      vendorId:    req(m, 'VENDORID',   'vendor ID'),
      postingDate: req(m, 'WHENPOSTED', 'posting date'),
      dueDate:     m['WHENDUE']     || undefined,
      description: m['DESCRIPTION'] || undefined,
      referenceNo: m['REFERENCENO'] || undefined,
      currency:    m['CURRENCY']    || undefined,
      lines: [line],
    },
  };
}

function buildArPayment(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'ar_payment'; data: ArPayment } {
  return {
    type: 'ar_payment',
    data: {
      customerId:    req(m, 'CUSTOMERID',  'customer ID'),
      paymentDate:   req(m, 'PAYMENTDATE', 'payment date'),
      amount:        req(m, 'AMOUNT',      'amount'),
      paymentMethod: m['PAYMENTMETHOD']  || undefined,
      bankAccountId: m['FINANCIALENTITY']|| undefined,
      description:   m['DESCRIPTION']    || undefined,
      referenceNo:   m['REFERENCENO']    || undefined,
      currency:      m['CURRENCY']       || undefined,
      locationId:    m['LOCATIONID']     || entityId || undefined,
    },
  };
}

function buildApPayment(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'ap_payment'; data: ApPayment } {
  return {
    type: 'ap_payment',
    data: {
      vendorId:      req(m, 'VENDORID',    'vendor ID'),
      paymentDate:   req(m, 'PAYMENTDATE', 'payment date'),
      amount:        req(m, 'AMOUNT',      'amount'),
      paymentMethod: m['PAYMENTMETHOD']  || undefined,
      bankAccountId: m['FINANCIALENTITY']|| undefined,
      description:   m['DESCRIPTION']    || undefined,
      referenceNo:   m['REFERENCENO']    || undefined,
      currency:      m['CURRENCY']       || undefined,
      locationId:    m['LOCATIONID']     || entityId || undefined,
    },
  };
}

function buildExpenseReport(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'expense_report'; data: ExpenseReport } {
  const line: ExpenseReportLine = {
    expenseType:  req(m, 'EXPENSETYPE', 'expense type'),
    amount:       req(m, 'AMOUNT',      'amount'),
    expenseDate:  m['EXPENSEDATE']   || undefined,
    memo:         m['MEMO']          || undefined,
    locationId:   m['LOCATIONID']    || entityId || undefined,
    departmentId: m['DEPARTMENTID']  || undefined,
    projectId:    m['PROJECTID']     || undefined,
    classId:      m['CLASSID']       || undefined,
    billable:     m['BILLABLE']      ? m['BILLABLE']      === 'true' : undefined,
    reimbursable: m['REIMBURSABLE']  ? m['REIMBURSABLE']  === 'true' : undefined,
  };

  return {
    type: 'expense_report',
    data: {
      employeeId:  req(m, 'EMPLOYEEID',  'employee ID'),
      reportDate:  req(m, 'WHENCREATED', 'report date'),
      description: m['DESCRIPTION'] || undefined,
      referenceNo: m['REFERENCENO'] || undefined,
      currency:    m['CURRENCY']    || undefined,
      lines: [line],
    },
  };
}

function buildTimesheet(
  m: Record<string, string>,
  entityId?: string | null
): { type: 'timesheet'; data: TimesheetEntry } {
  const line: TimesheetLine = {
    projectId:    m['PROJECTID']    || undefined,
    taskId:       m['TASKKEY']      || undefined,
    timetype:     m['TIMETYPE']     || undefined,
    quantity:     req(m, 'QTY', 'hours (QTY)'),
    memo:         m['MEMO']         || undefined,
    locationId:   m['LOCATIONID']   || entityId || undefined,
    departmentId: m['DEPARTMENTID'] || undefined,
    classId:      m['CLASSID']      || undefined,
  };

  return {
    type: 'timesheet',
    data: {
      employeeId:    req(m, 'EMPLOYEEID', 'employee ID'),
      weekStartDate: req(m, 'BEGINDATE',  'week start date'),
      description:   m['DESCRIPTION'] || undefined,
      lines: [line],
    },
  };
}

function buildVendor(m: Record<string, string>): { type: 'vendor'; data: Vendor } {
  return {
    type: 'vendor',
    data: {
      vendorId:      req(m, 'VENDORID', 'vendor ID'),
      name:          req(m, 'NAME',     'vendor name'),
      email:         m['EMAIL1']        || undefined,
      phone:         m['PHONE1']        || undefined,
      currency:      m['CURRENCY']      || undefined,
      paymentMethod: m['PAYMENTMETHOD'] || undefined,
      taxId:         m['TAXID']         || undefined,
      notes:         m['NOTES']         || undefined,
      addressLine1:  m['ADDRESS1']      || undefined,
      addressLine2:  m['ADDRESS2']      || undefined,
      city:          m['CITY']          || undefined,
      state:         m['STATE']         || undefined,
      zip:           m['ZIP']           || undefined,
      country:       m['COUNTRY']       || undefined,
    },
  };
}

function buildCustomer(m: Record<string, string>): { type: 'customer'; data: Customer } {
  return {
    type: 'customer',
    data: {
      customerId:   req(m, 'CUSTOMERID', 'customer ID'),
      name:         req(m, 'NAME',       'customer name'),
      email:        m['EMAIL1']      || undefined,
      phone:        m['PHONE1']      || undefined,
      currency:     m['CURRENCY']    || undefined,
      creditLimit:  m['CREDITLIMIT'] || undefined,
      paymentTerm:  m['TERMNAME']    || undefined,
      taxId:        m['TAXID']       || undefined,
      notes:        m['NOTES']       || undefined,
      addressLine1: m['ADDRESS1']    || undefined,
      addressLine2: m['ADDRESS2']    || undefined,
      city:         m['CITY']        || undefined,
      state:        m['STATE']       || undefined,
      zip:          m['ZIP']         || undefined,
      country:      m['COUNTRY']     || undefined,
    },
  };
}
