/**
 * Sage Intacct target field definitions per transaction type.
 * Used to populate the target field dropdown in the mapping editor.
 */

export interface IntacctField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  group: 'header' | 'line';
}

export const INTACCT_FIELDS: Record<string, IntacctField[]> = {
  journal_entry: [
    // Header
    { key: 'JOURNALID',       label: 'Journal ID',          description: 'Journal symbol (e.g. GJ, AJ)',                 required: true,  group: 'header' },
    { key: 'WHENCREATED',     label: 'Posting Date',         description: 'Date the entry is posted (MM/DD/YYYY)',         required: true,  group: 'header' },
    { key: 'DESCRIPTION',     label: 'Description',          description: 'Journal entry description',                    required: false, group: 'header' },
    { key: 'REFERENCENO',     label: 'Reference No',         description: 'External reference number',                    required: false, group: 'header' },
    { key: 'REVERSEDATE',     label: 'Reverse Date',         description: 'Date of auto-reversal entry (MM/DD/YYYY)',      required: false, group: 'header' },
    { key: 'SUPDOCID',        label: 'Supporting Doc ID',    description: 'Attached supporting document ID',              required: false, group: 'header' },
    // Line
    { key: 'GLACCOUNTNO',     label: 'GL Account No',        description: 'General ledger account number',                required: true,  group: 'line' },
    { key: 'AMOUNT',          label: 'Amount',               description: 'Absolute transaction amount',                  required: true,  group: 'line' },
    { key: 'TR_TYPE',         label: 'Transaction Type',     description: '1 = Debit, -1 = Credit (use tr_type transform)', required: true, group: 'line' },
    { key: 'MEMO',            label: 'Memo',                 description: 'Line-level memo/description',                  required: false, group: 'line' },
    { key: 'CURRENCY',        label: 'Currency',             description: 'ISO 4217 currency code',                       required: false, group: 'line' },
    { key: 'EXCH_RATE_TYPE',  label: 'Exchange Rate Type',   description: 'Exchange rate type',                           required: false, group: 'line' },
    { key: 'LOCATIONID',      label: 'Location ID',          description: 'Location dimension',                           required: false, group: 'line' },
    { key: 'DEPARTMENTID',    label: 'Department ID',        description: 'Department dimension',                         required: false, group: 'line' },
    { key: 'PROJECTID',       label: 'Project ID',           description: 'Project dimension',                            required: false, group: 'line' },
    { key: 'TASKID',          label: 'Task ID',              description: 'Task dimension',                               required: false, group: 'line' },
    { key: 'CUSTOMERID',      label: 'Customer ID',          description: 'Customer dimension',                           required: false, group: 'line' },
    { key: 'VENDORID',        label: 'Vendor ID',            description: 'Vendor dimension',                             required: false, group: 'line' },
    { key: 'EMPLOYEEID',      label: 'Employee ID',          description: 'Employee dimension',                           required: false, group: 'line' },
    { key: 'ITEMID',          label: 'Item ID',              description: 'Item/product dimension',                       required: false, group: 'line' },
    { key: 'CLASSID',         label: 'Class ID',             description: 'Class dimension',                              required: false, group: 'line' },
    { key: 'WAREHOUSEID',     label: 'Warehouse ID',         description: 'Warehouse dimension',                          required: false, group: 'line' },
    { key: 'CONTRACTID',      label: 'Contract ID',          description: 'Contract dimension',                           required: false, group: 'line' },
  ],
  ar_invoice: [
    // Header
    { key: 'CUSTOMERID',      label: 'Customer ID',          description: 'Intacct customer record ID',                  required: true,  group: 'header' },
    { key: 'WHENCREATED',     label: 'Invoice Date',         description: 'Date of the invoice (MM/DD/YYYY)',             required: true,  group: 'header' },
    { key: 'WHENDUE',         label: 'Due Date',             description: 'Payment due date (MM/DD/YYYY)',                required: false, group: 'header' },
    { key: 'TERMNAME',        label: 'Payment Term',         description: 'Payment term name (e.g. Net 30)',              required: false, group: 'header' },
    { key: 'DESCRIPTION',     label: 'Description',          description: 'Invoice description',                         required: false, group: 'header' },
    { key: 'REFERENCENO',     label: 'Reference No',         description: 'Invoice reference / PO number',               required: false, group: 'header' },
    { key: 'CURRENCY',        label: 'Currency',             description: 'Invoice currency (ISO 4217)',                  required: false, group: 'header' },
    { key: 'SUPDOCID',        label: 'Supporting Doc ID',    description: 'Attached supporting document ID',             required: false, group: 'header' },
    // Line
    { key: 'GLACCOUNTNO',     label: 'Revenue Account',      description: 'Revenue GL account for the line',             required: true,  group: 'line' },
    { key: 'AMOUNT',          label: 'Amount',               description: 'Line item amount (excl. tax)',                 required: true,  group: 'line' },
    { key: 'MEMO',            label: 'Line Memo',            description: 'Line item description',                       required: false, group: 'line' },
    { key: 'LOCATIONID',      label: 'Location ID',          description: 'Location dimension',                          required: false, group: 'line' },
    { key: 'DEPARTMENTID',    label: 'Department ID',        description: 'Department dimension',                        required: false, group: 'line' },
    { key: 'PROJECTID',       label: 'Project ID',           description: 'Project dimension',                           required: false, group: 'line' },
    { key: 'TASKID',          label: 'Task ID',              description: 'Task dimension',                              required: false, group: 'line' },
    { key: 'CLASSID',         label: 'Class ID',             description: 'Class dimension',                             required: false, group: 'line' },
    { key: 'WAREHOUSEID',     label: 'Warehouse ID',         description: 'Warehouse dimension',                         required: false, group: 'line' },
  ],
  ap_bill: [
    // Header
    { key: 'VENDORID',        label: 'Vendor ID',            description: 'Intacct vendor record ID',                    required: true,  group: 'header' },
    { key: 'WHENPOSTED',      label: 'Bill Date',            description: 'Date the bill is posted (MM/DD/YYYY)',         required: true,  group: 'header' },
    { key: 'WHENDUE',         label: 'Due Date',             description: 'Payment due date (MM/DD/YYYY)',                required: false, group: 'header' },
    { key: 'TERMNAME',        label: 'Payment Term',         description: 'Payment term name (e.g. Net 30)',              required: false, group: 'header' },
    { key: 'DESCRIPTION',     label: 'Description',          description: 'Bill description',                            required: false, group: 'header' },
    { key: 'REFERENCENO',     label: 'Reference No',         description: 'Bill reference / vendor invoice no.',         required: false, group: 'header' },
    { key: 'CURRENCY',        label: 'Currency',             description: 'Bill currency (ISO 4217)',                     required: false, group: 'header' },
    { key: 'SUPDOCID',        label: 'Supporting Doc ID',    description: 'Attached supporting document ID',             required: false, group: 'header' },
    { key: 'PAYMENTPRIORITY', label: 'Payment Priority',     description: 'Payment priority (e.g. Normal, High)',        required: false, group: 'header' },
    // Line
    { key: 'GLACCOUNTNO',     label: 'Expense Account',      description: 'Expense GL account for the line',             required: true,  group: 'line' },
    { key: 'AMOUNT',          label: 'Amount',               description: 'Line item amount',                            required: true,  group: 'line' },
    { key: 'MEMO',            label: 'Line Memo',            description: 'Line item description',                       required: false, group: 'line' },
    { key: 'LOCATIONID',      label: 'Location ID',          description: 'Location dimension',                          required: false, group: 'line' },
    { key: 'DEPARTMENTID',    label: 'Department ID',        description: 'Department dimension',                        required: false, group: 'line' },
    { key: 'PROJECTID',       label: 'Project ID',           description: 'Project dimension',                           required: false, group: 'line' },
    { key: 'TASKID',          label: 'Task ID',              description: 'Task dimension',                              required: false, group: 'line' },
    { key: 'CLASSID',         label: 'Class ID',             description: 'Class dimension',                             required: false, group: 'line' },
    { key: 'WAREHOUSEID',     label: 'Warehouse ID',         description: 'Warehouse dimension',                         required: false, group: 'line' },
  ],
  expense_report: [
    // Header
    { key: 'EMPLOYEEID',      label: 'Employee ID',          description: 'Intacct employee record ID',                  required: true,  group: 'header' },
    { key: 'WHENCREATED',     label: 'Report Date',          description: 'Date of the expense report (MM/DD/YYYY)',     required: true,  group: 'header' },
    { key: 'DESCRIPTION',     label: 'Description',          description: 'Expense report description',                  required: false, group: 'header' },
    { key: 'REFERENCENO',     label: 'Reference No',         description: 'External reference',                          required: false, group: 'header' },
    { key: 'CURRENCY',        label: 'Currency',             description: 'Report currency (ISO 4217)',                   required: false, group: 'header' },
    // Line
    { key: 'EXPENSE_TYPE',    label: 'Expense Type',         description: 'Expense type / category name',                required: true,  group: 'line' },
    { key: 'AMOUNT',          label: 'Amount',               description: 'Expense amount',                              required: true,  group: 'line' },
    { key: 'EXPENSEDATE',     label: 'Expense Date',         description: 'Date expense was incurred (MM/DD/YYYY)',       required: false, group: 'line' },
    { key: 'MEMO',            label: 'Memo',                 description: 'Line-level description',                      required: false, group: 'line' },
    { key: 'LOCATIONID',      label: 'Location ID',          description: 'Location dimension',                          required: false, group: 'line' },
    { key: 'DEPARTMENTID',    label: 'Department ID',        description: 'Department dimension',                        required: false, group: 'line' },
    { key: 'PROJECTID',       label: 'Project ID',           description: 'Project dimension',                           required: false, group: 'line' },
    { key: 'CLASSID',         label: 'Class ID',             description: 'Class dimension',                             required: false, group: 'line' },
  ],
  timesheet: [
    // Header
    { key: 'EMPLOYEEID',      label: 'Employee ID',          description: 'Intacct employee record ID',                  required: true,  group: 'header' },
    { key: 'BEGINDATE',       label: 'Begin Date',           description: 'Timesheet start date (MM/DD/YYYY)',           required: true,  group: 'header' },
    { key: 'ENDDATE',         label: 'End Date',             description: 'Timesheet end date (MM/DD/YYYY)',             required: true,  group: 'header' },
    { key: 'DESCRIPTION',     label: 'Description',          description: 'Timesheet description',                       required: false, group: 'header' },
    // Line
    { key: 'LINENO',          label: 'Line No',              description: 'Line number within the timesheet',            required: false, group: 'line' },
    { key: 'HOURS',           label: 'Hours',                description: 'Number of hours for this line',               required: true,  group: 'line' },
    { key: 'TASKID',          label: 'Task ID',              description: 'Task dimension',                              required: false, group: 'line' },
    { key: 'TIMETYPE',        label: 'Time Type',            description: 'Time type (e.g. Regular, Overtime)',          required: false, group: 'line' },
    { key: 'PROJECTID',       label: 'Project ID',           description: 'Project dimension',                           required: false, group: 'line' },
    { key: 'CUSTOMERID',      label: 'Customer ID',          description: 'Customer dimension',                          required: false, group: 'line' },
    { key: 'DEPARTMENTID',    label: 'Department ID',        description: 'Department dimension',                        required: false, group: 'line' },
    { key: 'LOCATIONID',      label: 'Location ID',          description: 'Location dimension',                          required: false, group: 'line' },
  ],
  vendor: [
    // Header
    { key: 'VENDORID',                label: 'Vendor ID',          description: 'Unique Intacct vendor ID',              required: true,  group: 'header' },
    { key: 'NAME',                    label: 'Name',               description: 'Vendor display name',                   required: true,  group: 'header' },
    { key: 'STATUS',                  label: 'Status',             description: 'active or inactive',                    required: false, group: 'header' },
    { key: 'EMAIL1',                  label: 'Email',              description: 'Primary email address',                 required: false, group: 'header' },
    { key: 'PHONE1',                  label: 'Phone',              description: 'Primary phone number',                  required: false, group: 'header' },
    { key: 'TERMNAME',                label: 'Payment Term',       description: 'Payment term name (e.g. Net 30)',        required: false, group: 'header' },
    { key: 'CURRENCY',                label: 'Currency',           description: 'Default currency (ISO 4217)',            required: false, group: 'header' },
    { key: 'TAXID',                   label: 'Tax ID',             description: 'VAT / tax identification number',       required: false, group: 'header' },
    // Line (address)
    { key: 'MAILADDRESS.ADDRESS1',    label: 'Address Line 1',     description: 'Street address line 1',                 required: false, group: 'line' },
    { key: 'MAILADDRESS.ADDRESS2',    label: 'Address Line 2',     description: 'Street address line 2',                 required: false, group: 'line' },
    { key: 'MAILADDRESS.CITY',        label: 'City',               description: 'City',                                  required: false, group: 'line' },
    { key: 'MAILADDRESS.STATE',       label: 'State / County',     description: 'State or county',                       required: false, group: 'line' },
    { key: 'MAILADDRESS.ZIP',         label: 'Postcode / ZIP',     description: 'Postal code',                           required: false, group: 'line' },
    { key: 'MAILADDRESS.COUNTRY',     label: 'Country',            description: 'Country name',                          required: false, group: 'line' },
  ],
  customer: [
    // Header
    { key: 'CUSTOMERID',              label: 'Customer ID',        description: 'Unique Intacct customer ID',            required: true,  group: 'header' },
    { key: 'NAME',                    label: 'Name',               description: 'Customer display name',                 required: true,  group: 'header' },
    { key: 'STATUS',                  label: 'Status',             description: 'active or inactive',                    required: false, group: 'header' },
    { key: 'EMAIL1',                  label: 'Email',              description: 'Primary email address',                 required: false, group: 'header' },
    { key: 'PHONE1',                  label: 'Phone',              description: 'Primary phone number',                  required: false, group: 'header' },
    { key: 'TERMNAME',                label: 'Payment Term',       description: 'Payment term name (e.g. Net 30)',        required: false, group: 'header' },
    { key: 'CURRENCY',                label: 'Currency',           description: 'Default currency (ISO 4217)',            required: false, group: 'header' },
    { key: 'TAXID',                   label: 'Tax ID',             description: 'VAT / tax identification number',       required: false, group: 'header' },
    // Line (address)
    { key: 'MAILADDRESS.ADDRESS1',    label: 'Address Line 1',     description: 'Street address line 1',                 required: false, group: 'line' },
    { key: 'MAILADDRESS.ADDRESS2',    label: 'Address Line 2',     description: 'Street address line 2',                 required: false, group: 'line' },
    { key: 'MAILADDRESS.CITY',        label: 'City',               description: 'City',                                  required: false, group: 'line' },
    { key: 'MAILADDRESS.STATE',       label: 'State / County',     description: 'State or county',                       required: false, group: 'line' },
    { key: 'MAILADDRESS.ZIP',         label: 'Postcode / ZIP',     description: 'Postal code',                           required: false, group: 'line' },
    { key: 'MAILADDRESS.COUNTRY',     label: 'Country',            description: 'Country name',                          required: false, group: 'line' },
  ],
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  journal_entry:  'Journal Entry',
  ar_invoice:     'AR Invoice',
  ap_bill:        'AP Bill',
  expense_report: 'Expense Report',
  ar_payment:     'AR Payment',
  ap_payment:     'AP Payment',
  timesheet:      'Timesheet',
  vendor:         'Vendor Import',
  customer:       'Customer Import',
};

export const TRANSFORM_LABELS: Record<string, string> = {
  none:        'No transform',
  trim:        'Trim whitespace',
  date_format: 'Date format (MM/DD/YYYY → YYYY-MM-DD)',
  decimal:     'Parse as decimal number',
  boolean:     'Parse as boolean (yes/no → true/false)',
  tr_type:     'Debit/Credit → 1/-1 (for TR_TYPE field)',
};
