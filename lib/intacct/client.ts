/**
 * Sage Intacct XML API client.
 * Intacct uses XML-over-HTTPS. Each request is a structured XML envelope.
 */
import { XMLParser } from 'fast-xml-parser';
import type { IntacctCredentials, IntacctResponse, IntacctError } from './types';

const INTACCT_API_URL = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // 'error' and 'result' must always be arrays (Intacct wraps multiple errors/results).
  // 'location' must also be an array so readByQuery results parse consistently whether
  // there is 1 or N location records.
  isArray: (name) => ['error', 'result', 'location', 'LOCATION'].includes(name),
});

function buildControl(controlId: string, creds: IntacctCredentials): string {
  const senderId       = creds.senderId;
  const senderPassword = creds.senderPassword;
  if (!senderId || !senderPassword) {
    throw new Error(
      'Intacct sender credentials are not configured. ' +
      'A platform administrator must set them under Platform → Settings.'
    );
  }
  return `<control>
    <senderid>${esc(senderId)}</senderid>
    <password>${esc(senderPassword)}</password>
    <controlid>${esc(controlId)}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>`;
}

function buildAuth(creds: IntacctCredentials): string {
  // <locationid> scopes the request to a specific entity in multi-entity companies.
  // It must appear AFTER <password> in the Intacct XML schema.
  const locationLine = creds.entityId
    ? `\n      <locationid>${esc(creds.entityId)}</locationid>`
    : '';
  return `<authentication>
    <login>
      <userid>${esc(creds.userId)}</userid>
      <companyid>${esc(creds.companyId)}</companyid>
      <password>${esc(creds.userPassword)}</password>${locationLine}
    </login>
  </authentication>`;
}

function buildRequest(creds: IntacctCredentials, controlId: string, functionXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  ${buildControl(controlId, creds)}
  <operation transaction="false">
    ${buildAuth(creds)}
    <content>
      <function controlid="${esc(controlId)}">
        ${functionXml}
      </function>
    </content>
  </operation>
</request>`;
}

async function postXml(xml: string, controlId: string): Promise<IntacctResponse> {
  const requestXml = xml.slice(0, 2000); // Capture request for diagnostics
  const res = await fetch(INTACCT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
    body: xml,
  });

  const text = await res.text();
  const rawXml = text.slice(0, 1500); // Capture response for diagnostics
  const parsed = parser.parse(text);

  const response = parsed?.response;
  if (!response) {
    return { success: false, controlId, rawXml, requestXml, errors: [{ errorno: 'PARSE_ERROR', description: 'Could not parse Intacct response' }] };
  }

  const control = response.control;
  if (control?.status === 'failure') {
    return { success: false, controlId, rawXml, requestXml, errors: extractErrors(control.errormessage?.error) };
  }

  const operation = response.operation;

  // Check authentication — failure here means sender not authorised for this company.
  // The errormessage sits on operation directly (not on result) in this case.
  const auth = operation?.authentication;
  if (auth?.status === 'failure') {
    return { success: false, controlId, rawXml, requestXml, errors: extractErrors(operation?.errormessage?.error) };
  }

  const result = Array.isArray(operation?.result) ? operation.result[0] : operation?.result;
  if (result?.status === 'failure') {
    return { success: false, controlId, rawXml, requestXml, errors: extractErrors(result.errormessage?.error) };
  }

  const rawData = result?.data;
  const data: Record<string, unknown>[] = rawData
    ? (Array.isArray(rawData) ? rawData : [rawData])
    : [];

  // Extract Intacct RECORDNO.
  // Intacct XML API v3 create responses return the new record key in <key> on the
  // <result> node directly — NOT inside a <data> block. We check that first, then
  // fall back to walking data[] for older/alternate response shapes.
  let recordNo: string | undefined;

  // 1. <result><key>186</key></result>  ← standard create response
  if (result?.key != null) {
    recordNo = String(result.key);
  }

  // 2. <result><data><glbatch><RECORDNO>186</RECORDNO></glbatch></data></result>
  if (!recordNo) {
    const first = data[0];
    if (first) {
      for (const key of Object.keys(first)) {
        const inner = first[key];
        if (inner && typeof inner === 'object' && 'RECORDNO' in (inner as Record<string, unknown>)) {
          recordNo = String((inner as Record<string, unknown>).RECORDNO);
          break;
        }
      }
      if (!recordNo && 'RECORDNO' in first) {
        recordNo = String(first.RECORDNO);
      }
    }
  }

  return { success: true, controlId, data, recordNo, rawResult: result, rawXml, requestXml };
}

function extractErrors(errorNode: unknown): IntacctError[] {
  if (!errorNode) return [];
  const arr = Array.isArray(errorNode) ? errorNode : [errorNode];
  return arr.map((e: Record<string, string>) => ({
    errorno: e.errorno ?? 'UNKNOWN',
    description: e.description ?? '',
    description2: e.description2,
    correction: e.correction,
  }));
}

/** Test credentials by calling getAPISession */
export async function testConnection(creds: IntacctCredentials): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();
  return postXml(buildRequest(creds, controlId, `<getAPISession />`), controlId);
}

export interface IntacctLocation {
  LOCATIONID: string;
  NAME: string;
  STATUS?: string;
  PARENTID?: string;
}

/** Read all locations from Intacct */
export async function readLocations(creds: IntacctCredentials): Promise<{
  success: boolean;
  locations?: IntacctLocation[];
  error?: string;
  rawResponseXml?: string;
  rawResultData?: unknown;
}> {
  const controlId = crypto.randomUUID();
  // Use '1=1' query to reliably return all records (empty query string can be rejected)
  const functionXml = `
    <readByQuery>
      <object>LOCATION</object>
      <fields>LOCATIONID,NAME,STATUS,PARENTID</fields>
      <query>1=1</query>
      <pagesize>100</pagesize>
    </readByQuery>`;
  const result = await postXml(buildRequest(creds, controlId, functionXml), controlId);
  if (!result.success) {
    return {
      success: false,
      error: result.errors?.[0]?.description2 ?? result.errors?.[0]?.description ?? 'Query failed',
      rawResponseXml: result.rawXml,
    };
  }

  // With isArray including 'location', fast-xml-parser always returns location as an array.
  // result.data = [dataElement], dataElement.location = IntacctLocation[]
  const locations: IntacctLocation[] = [];
  const dataEl = result.data?.[0] as Record<string, unknown> | undefined;
  const rawResultData = dataEl; // expose for diagnostics

  const locs = (dataEl?.location ?? dataEl?.LOCATION) as Record<string, unknown>[] | undefined;
  if (Array.isArray(locs)) {
    for (const loc of locs) {
      if (loc.LOCATIONID) {
        locations.push({
          LOCATIONID: String(loc.LOCATIONID),
          NAME: String(loc.NAME ?? ''),
          STATUS: loc.STATUS ? String(loc.STATUS) : undefined,
          PARENTID: loc.PARENTID ? String(loc.PARENTID) : undefined,
        });
      }
    }
  }

  return { success: true, locations, rawResponseXml: result.rawXml, rawResultData };
}

export interface JournalEntryLine {
  accountNo: string;
  amount: string;
  trType: '1' | '-1';
  memo?: string;
  locationId?: string;
  departmentId?: string;
  projectId?: string;
  customerId?: string;
  vendorId?: string;
  employeeId?: string;
  itemId?: string;
  classId?: string;
}

export interface JournalEntry {
  journalId: string;
  postingDate: string;
  description?: string;
  referenceNo?: string;
  lines: JournalEntryLine[];
}

/** Create a single journal entry (GLBATCH) */
export async function createJournalEntry(
  creds: IntacctCredentials,
  entry: JournalEntry
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const lineXml = entry.lines.map((l) => `
    <GLENTRY>
      <ACCOUNTNO>${esc(l.accountNo)}</ACCOUNTNO>
      <TR_TYPE>${l.trType}</TR_TYPE>
      <AMOUNT>${esc(l.amount)}</AMOUNT>
      ${l.memo         ? `<MEMO>${esc(l.memo)}</MEMO>` : ''}
      ${l.locationId   ? `<LOCATIONID>${esc(l.locationId)}</LOCATIONID>` : ''}
      ${l.departmentId ? `<DEPARTMENTID>${esc(l.departmentId)}</DEPARTMENTID>` : ''}
      ${l.projectId    ? `<PROJECTID>${esc(l.projectId)}</PROJECTID>` : ''}
      ${l.customerId   ? `<CUSTOMERID>${esc(l.customerId)}</CUSTOMERID>` : ''}
      ${l.vendorId     ? `<VENDORID>${esc(l.vendorId)}</VENDORID>` : ''}
      ${l.employeeId   ? `<EMPLOYEEID>${esc(l.employeeId)}</EMPLOYEEID>` : ''}
      ${l.itemId       ? `<ITEMID>${esc(l.itemId)}</ITEMID>` : ''}
      ${l.classId      ? `<CLASSID>${esc(l.classId)}</CLASSID>` : ''}
    </GLENTRY>`).join('');

  const functionXml = `
    <create>
      <GLBATCH>
        <JOURNAL>${esc(entry.journalId)}</JOURNAL>
        <BATCH_DATE>${esc(entry.postingDate)}</BATCH_DATE>
        ${entry.description ? `<BATCH_TITLE>${esc(entry.description)}</BATCH_TITLE>` : ''}
        ${entry.referenceNo ? `<REFERENCENO>${esc(entry.referenceNo)}</REFERENCENO>` : ''}
        <ENTRIES>
          ${lineXml}
        </ENTRIES>
      </GLBATCH>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

export interface ArInvoiceLine {
  accountNo: string;
  amount: string;
  memo?: string;
  locationId?: string;
  departmentId?: string;
  projectId?: string;
  classId?: string;
}

export interface ArInvoice {
  customerId: string;
  postingDate: string;
  dueDate?: string;
  description?: string;
  referenceNo?: string;
  currency?: string;
  lines: ArInvoiceLine[];
}

/** Create an AR Invoice (ARINVOICE) */
export async function createArInvoice(
  creds: IntacctCredentials,
  invoice: ArInvoice
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const lineXml = invoice.lines.map((l) => `
    <LINEITEM>
      <GLACCOUNTNO>${esc(l.accountNo)}</GLACCOUNTNO>
      <AMOUNT>${esc(l.amount)}</AMOUNT>
      ${l.memo         ? `<MEMO>${esc(l.memo)}</MEMO>` : ''}
      ${l.locationId   ? `<LOCATIONID>${esc(l.locationId)}</LOCATIONID>` : ''}
      ${l.departmentId ? `<DEPARTMENTID>${esc(l.departmentId)}</DEPARTMENTID>` : ''}
      ${l.projectId    ? `<PROJECTID>${esc(l.projectId)}</PROJECTID>` : ''}
      ${l.classId      ? `<CLASSID>${esc(l.classId)}</CLASSID>` : ''}
    </LINEITEM>`).join('');

  const functionXml = `
    <create>
      <ARINVOICE>
        <CUSTOMERID>${esc(invoice.customerId)}</CUSTOMERID>
        <WHENCREATED>${esc(invoice.postingDate)}</WHENCREATED>
        ${invoice.dueDate     ? `<WHENDUE>${esc(invoice.dueDate)}</WHENDUE>` : ''}
        ${invoice.description ? `<DESCRIPTION>${esc(invoice.description)}</DESCRIPTION>` : ''}
        ${invoice.referenceNo ? `<REFERENCENO>${esc(invoice.referenceNo)}</REFERENCENO>` : ''}
        ${invoice.currency    ? `<CURRENCY>${esc(invoice.currency)}</CURRENCY>` : ''}
        <INVOICEITEMS>
          ${lineXml}
        </INVOICEITEMS>
      </ARINVOICE>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

export interface ApBillLine {
  accountNo: string;
  amount: string;
  memo?: string;
  locationId?: string;
  departmentId?: string;
  projectId?: string;
  classId?: string;
}

export interface ApBill {
  vendorId: string;
  postingDate: string;
  dueDate?: string;
  description?: string;
  referenceNo?: string;
  currency?: string;
  lines: ApBillLine[];
}

/** Create an AP Bill (APBILL) */
export async function createApBill(
  creds: IntacctCredentials,
  bill: ApBill
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const lineXml = bill.lines.map((l) => `
    <APBILLITEM>
      <GLACCOUNTNO>${esc(l.accountNo)}</GLACCOUNTNO>
      <AMOUNT>${esc(l.amount)}</AMOUNT>
      ${l.memo         ? `<MEMO>${esc(l.memo)}</MEMO>` : ''}
      ${l.locationId   ? `<LOCATIONID>${esc(l.locationId)}</LOCATIONID>` : ''}
      ${l.departmentId ? `<DEPARTMENTID>${esc(l.departmentId)}</DEPARTMENTID>` : ''}
      ${l.projectId    ? `<PROJECTID>${esc(l.projectId)}</PROJECTID>` : ''}
      ${l.classId      ? `<CLASSID>${esc(l.classId)}</CLASSID>` : ''}
    </APBILLITEM>`).join('');

  const functionXml = `
    <create>
      <APBILL>
        <VENDORID>${esc(bill.vendorId)}</VENDORID>
        <WHENPOSTED>${esc(bill.postingDate)}</WHENPOSTED>
        ${bill.dueDate     ? `<WHENDUE>${esc(bill.dueDate)}</WHENDUE>` : ''}
        ${bill.description ? `<DESCRIPTION>${esc(bill.description)}</DESCRIPTION>` : ''}
        ${bill.referenceNo ? `<REFERENCENO>${esc(bill.referenceNo)}</REFERENCENO>` : ''}
        ${bill.currency    ? `<CURRENCY>${esc(bill.currency)}</CURRENCY>` : ''}
        <APBILLITEMS>
          ${lineXml}
        </APBILLITEMS>
      </APBILL>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── AR Payment ────────────────────────────────────────────────────────────────

export interface ArPayment {
  customerId: string;
  paymentDate: string;    // YYYY-MM-DD
  amount: string;
  paymentMethod?: string; // e.g. 'EFT', 'Check', 'Cash', 'Credit card'
  bankAccountId?: string; // FINANCIALENTITY
  description?: string;
  referenceNo?: string;
  currency?: string;
  locationId?: string;
}

/** Create an unapplied AR Payment / cash receipt (ARPYMT) */
export async function createArPayment(
  creds: IntacctCredentials,
  payment: ArPayment
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();
  const functionXml = `
    <create>
      <ARPYMT>
        <PAYMENTMETHOD>${esc(payment.paymentMethod ?? 'EFT')}</PAYMENTMETHOD>
        ${payment.bankAccountId ? `<FINANCIALENTITY>${esc(payment.bankAccountId)}</FINANCIALENTITY>` : ''}
        <CUSTOMERID>${esc(payment.customerId)}</CUSTOMERID>
        <PAYMENTDATE>${esc(payment.paymentDate)}</PAYMENTDATE>
        <BASECURRAMOUNT>${esc(payment.amount)}</BASECURRAMOUNT>
        ${payment.currency    ? `<CURRENCY>${esc(payment.currency)}</CURRENCY>` : ''}
        ${payment.description ? `<DESCRIPTION>${esc(payment.description)}</DESCRIPTION>` : ''}
        ${payment.referenceNo ? `<REFERENCENO>${esc(payment.referenceNo)}</REFERENCENO>` : ''}
        ${payment.locationId  ? `<LOCATIONID>${esc(payment.locationId)}</LOCATIONID>` : ''}
      </ARPYMT>
    </create>`;
  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── AP Payment ────────────────────────────────────────────────────────────────

export interface ApPayment {
  vendorId: string;
  paymentDate: string;    // YYYY-MM-DD
  amount: string;
  paymentMethod?: string;
  bankAccountId?: string;
  description?: string;
  referenceNo?: string;
  currency?: string;
  locationId?: string;
}

/** Create an unapplied AP Payment (APPYMT) */
export async function createApPayment(
  creds: IntacctCredentials,
  payment: ApPayment
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();
  const functionXml = `
    <create>
      <APPYMT>
        <PAYMENTMETHOD>${esc(payment.paymentMethod ?? 'EFT')}</PAYMENTMETHOD>
        ${payment.bankAccountId ? `<FINANCIALENTITY>${esc(payment.bankAccountId)}</FINANCIALENTITY>` : ''}
        <VENDORID>${esc(payment.vendorId)}</VENDORID>
        <PAYMENTDATE>${esc(payment.paymentDate)}</PAYMENTDATE>
        <BASECURRAMOUNT>${esc(payment.amount)}</BASECURRAMOUNT>
        ${payment.currency    ? `<CURRENCY>${esc(payment.currency)}</CURRENCY>` : ''}
        ${payment.description ? `<DESCRIPTION>${esc(payment.description)}</DESCRIPTION>` : ''}
        ${payment.referenceNo ? `<REFERENCENO>${esc(payment.referenceNo)}</REFERENCENO>` : ''}
        ${payment.locationId  ? `<LOCATIONID>${esc(payment.locationId)}</LOCATIONID>` : ''}
      </APPYMT>
    </create>`;
  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── Expense Report ────────────────────────────────────────────────────────────

export interface ExpenseReportLine {
  expenseType: string;    // must match an Intacct expense type
  amount: string;
  expenseDate?: string;   // YYYY-MM-DD; defaults to report date
  memo?: string;
  locationId?: string;
  departmentId?: string;
  projectId?: string;
  classId?: string;
  billable?: boolean;
  reimbursable?: boolean;
}

export interface ExpenseReport {
  employeeId: string;
  reportDate: string;     // YYYY-MM-DD
  description?: string;
  referenceNo?: string;
  currency?: string;
  lines: ExpenseReportLine[];
}

/** Create an Expense Report (EEXPENSES) */
export async function createExpenseReport(
  creds: IntacctCredentials,
  report: ExpenseReport
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const [ry, rm, rd] = report.reportDate.split('-');

  const lineXml = report.lines.map((l) => {
    const [ey, em, ed] = (l.expenseDate ?? report.reportDate).split('-');
    return `
    <EEXPENSESITEM>
      <EXPENSETYPE>${esc(l.expenseType)}</EXPENSETYPE>
      <AMOUNT>${esc(l.amount)}</AMOUNT>
      <EXPENSEDATE>
        <year>${esc(ey ?? ry)}</year>
        <month>${esc(em ?? rm)}</month>
        <day>${esc(ed ?? rd)}</day>
      </EXPENSEDATE>
      ${l.memo         ? `<MEMO>${esc(l.memo)}</MEMO>` : ''}
      ${l.locationId   ? `<LOCATIONID>${esc(l.locationId)}</LOCATIONID>` : ''}
      ${l.departmentId ? `<DEPARTMENTID>${esc(l.departmentId)}</DEPARTMENTID>` : ''}
      ${l.projectId    ? `<PROJECTID>${esc(l.projectId)}</PROJECTID>` : ''}
      ${l.classId      ? `<CLASSID>${esc(l.classId)}</CLASSID>` : ''}
      ${l.billable     !== undefined ? `<BILLABLE>${l.billable ? 'true' : 'false'}</BILLABLE>` : ''}
      ${l.reimbursable !== undefined ? `<REIMBURSABLE>${l.reimbursable ? 'true' : 'false'}</REIMBURSABLE>` : ''}
    </EEXPENSESITEM>`;
  }).join('');

  const functionXml = `
    <create>
      <EEXPENSES>
        <EMPLOYEEID>${esc(report.employeeId)}</EMPLOYEEID>
        <DATECREATED>
          <year>${esc(ry)}</year>
          <month>${esc(rm)}</month>
          <day>${esc(rd)}</day>
        </DATECREATED>
        ${report.description ? `<DESCRIPTION>${esc(report.description)}</DESCRIPTION>` : ''}
        ${report.referenceNo ? `<REFERENCENO>${esc(report.referenceNo)}</REFERENCENO>` : ''}
        ${report.currency    ? `<CURRENCY>${esc(report.currency)}</CURRENCY>` : ''}
        <EEXPENSESITEMS>
          ${lineXml}
        </EEXPENSESITEMS>
      </EEXPENSES>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── Timesheet ─────────────────────────────────────────────────────────────────

export interface TimesheetLine {
  projectId?: string;
  taskId?: string;
  timetype?: string;
  quantity: string;  // hours
  memo?: string;
  locationId?: string;
  departmentId?: string;
  classId?: string;
}

export interface TimesheetEntry {
  employeeId: string;
  weekStartDate: string; // YYYY-MM-DD
  description?: string;
  lines: TimesheetLine[];
}

/** Create a Timesheet (TIMESHEET) */
export async function createTimesheet(
  creds: IntacctCredentials,
  entry: TimesheetEntry
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const lineXml = entry.lines.map((l) => `
    <TIMESHEETENTRY>
      ${l.projectId    ? `<PROJECTID>${esc(l.projectId)}</PROJECTID>` : ''}
      ${l.taskId       ? `<TASKKEY>${esc(l.taskId)}</TASKKEY>` : ''}
      ${l.timetype     ? `<TIMETYPE>${esc(l.timetype)}</TIMETYPE>` : ''}
      <QTY>${esc(l.quantity)}</QTY>
      ${l.memo         ? `<MEMO>${esc(l.memo)}</MEMO>` : ''}
      ${l.locationId   ? `<LOCATIONID>${esc(l.locationId)}</LOCATIONID>` : ''}
      ${l.departmentId ? `<DEPARTMENTID>${esc(l.departmentId)}</DEPARTMENTID>` : ''}
      ${l.classId      ? `<CLASSID>${esc(l.classId)}</CLASSID>` : ''}
    </TIMESHEETENTRY>`).join('');

  const functionXml = `
    <create>
      <TIMESHEET>
        <EMPLOYEEID>${esc(entry.employeeId)}</EMPLOYEEID>
        <BEGINDATE>${esc(entry.weekStartDate)}</BEGINDATE>
        ${entry.description ? `<DESCRIPTION>${esc(entry.description)}</DESCRIPTION>` : ''}
        <TIMESHEETENTRIES>
          ${lineXml}
        </TIMESHEETENTRIES>
      </TIMESHEET>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── Vendor ────────────────────────────────────────────────────────────────────

export interface Vendor {
  vendorId: string;
  name: string;
  email?: string;
  phone?: string;
  currency?: string;
  paymentMethod?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  taxId?: string;
  notes?: string;
}

/** Create a Vendor (VENDOR) */
export async function createVendor(
  creds: IntacctCredentials,
  vendor: Vendor
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const functionXml = `
    <create>
      <VENDOR>
        <VENDORID>${esc(vendor.vendorId)}</VENDORID>
        <NAME>${esc(vendor.name)}</NAME>
        ${vendor.email         ? `<EMAIL1>${esc(vendor.email)}</EMAIL1>` : ''}
        ${vendor.phone         ? `<PHONE1>${esc(vendor.phone)}</PHONE1>` : ''}
        ${vendor.currency      ? `<CURRENCY>${esc(vendor.currency)}</CURRENCY>` : ''}
        ${vendor.paymentMethod ? `<PAYMENTMETHOD>${esc(vendor.paymentMethod)}</PAYMENTMETHOD>` : ''}
        ${vendor.taxId         ? `<TAXID>${esc(vendor.taxId)}</TAXID>` : ''}
        ${vendor.notes         ? `<NOTES>${esc(vendor.notes)}</NOTES>` : ''}
        <DISPLAYCONTACT>
          <MAILADDRESS>
            ${vendor.addressLine1 ? `<ADDRESS1>${esc(vendor.addressLine1)}</ADDRESS1>` : ''}
            ${vendor.addressLine2 ? `<ADDRESS2>${esc(vendor.addressLine2)}</ADDRESS2>` : ''}
            ${vendor.city         ? `<CITY>${esc(vendor.city)}</CITY>` : ''}
            ${vendor.state        ? `<STATE>${esc(vendor.state)}</STATE>` : ''}
            ${vendor.zip          ? `<ZIP>${esc(vendor.zip)}</ZIP>` : ''}
            ${vendor.country      ? `<COUNTRY>${esc(vendor.country)}</COUNTRY>` : ''}
          </MAILADDRESS>
        </DISPLAYCONTACT>
      </VENDOR>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface Customer {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  currency?: string;
  creditLimit?: string;
  paymentTerm?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  taxId?: string;
  notes?: string;
}

/** Create a Customer (CUSTOMER) */
export async function createCustomer(
  creds: IntacctCredentials,
  customer: Customer
): Promise<IntacctResponse> {
  const controlId = crypto.randomUUID();

  const functionXml = `
    <create>
      <CUSTOMER>
        <CUSTOMERID>${esc(customer.customerId)}</CUSTOMERID>
        <NAME>${esc(customer.name)}</NAME>
        ${customer.email       ? `<EMAIL1>${esc(customer.email)}</EMAIL1>` : ''}
        ${customer.phone       ? `<PHONE1>${esc(customer.phone)}</PHONE1>` : ''}
        ${customer.currency    ? `<CURRENCY>${esc(customer.currency)}</CURRENCY>` : ''}
        ${customer.creditLimit ? `<CREDITLIMIT>${esc(customer.creditLimit)}</CREDITLIMIT>` : ''}
        ${customer.paymentTerm ? `<TERMNAME>${esc(customer.paymentTerm)}</TERMNAME>` : ''}
        ${customer.taxId       ? `<TAXID>${esc(customer.taxId)}</TAXID>` : ''}
        ${customer.notes       ? `<NOTES>${esc(customer.notes)}</NOTES>` : ''}
        <DISPLAYCONTACT>
          <MAILADDRESS>
            ${customer.addressLine1 ? `<ADDRESS1>${esc(customer.addressLine1)}</ADDRESS1>` : ''}
            ${customer.addressLine2 ? `<ADDRESS2>${esc(customer.addressLine2)}</ADDRESS2>` : ''}
            ${customer.city         ? `<CITY>${esc(customer.city)}</CITY>` : ''}
            ${customer.state        ? `<STATE>${esc(customer.state)}</STATE>` : ''}
            ${customer.zip          ? `<ZIP>${esc(customer.zip)}</ZIP>` : ''}
            ${customer.country      ? `<COUNTRY>${esc(customer.country)}</COUNTRY>` : ''}
          </MAILADDRESS>
        </DISPLAYCONTACT>
      </CUSTOMER>
    </create>`;

  return postXml(buildRequest(creds, controlId, functionXml), controlId);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
