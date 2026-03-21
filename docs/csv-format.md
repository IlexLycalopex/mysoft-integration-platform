# File Format Reference — Mysoft Integration Platform

All uploads share the same column headers regardless of file format. Column names must match exactly (case-insensitive). Required columns must be present and non-empty for every row.

## Supported File Formats

| Extension | Delimiter | Notes |
|-----------|-----------|-------|
| `.csv` | Comma | Default; auto-detected |
| `.xlsx` / `.xls` | Excel binary | First sheet used |
| `.tsv` / `.tab` | Tab | Forced by extension |
| `.psv` | Pipe `\|` | Forced by extension |
| `.txt` / `.dat` / `.log` | Any | PapaParse auto-detection |

> If auto-detection on a `.txt` file results in only one column, rename it to `.psv` or `.tsv` to force the correct delimiter.

**JSON push**: use `POST /api/v1/push-records` to submit records directly as a JSON array — no file needed. See the REST API documentation or in-app Help Centre.

---

**Date formats accepted on all date fields:**

| Format | Example |
|--------|---------|
| `DD/MM/YYYY` | `25/03/2026` (default — UK) |
| `MM/DD/YYYY` | `03/25/2026` (US region) |
| `YYYY-MM-DD` | `2026-03-25` (ISO 8601) |
| `DD-MM-YYYY` | `25-03-2026` |
| `DD.MM.YYYY` | `25.03.2026` |
| Excel serial | `46114` |

Date format is set per field mapping. If your dates are being misinterpreted, check the `date_format` setting in Mappings.

---

## Transaction Types

| Type | Intacct Object | Grouping Rule |
|------|---------------|---------------|
| [Journal Entry](#journal-entry) | `GLBATCH` / `GLENTRY` | `journal_symbol + posting_date + description` → one batch |
| [Payroll Journal](#payroll-journal) | `GLBATCH` / `GLENTRY` | `journal_symbol + pay_date + pay_reference` → one batch |
| [AR Invoice](#ar-invoice) | `ARINVOICE` | `customer_id + invoice_date + reference_no` → one invoice |
| [AP Bill](#ap-bill) | `APBILL` | `vendor_id + bill_date + reference_no` → one bill |
| [Expense Report](#expense-report) | `EEXPENSES` | `employee_id + report_date + reference_no` → one report |
| [AR Payment](#ar-payment) | `ARPYMT` | One payment per row |
| [AP Payment](#ap-payment) | `APPYMT` | One payment per row |
| [Timesheet](#timesheet) | `TIMESHEET` | One timesheet per row |
| [Vendor Import](#vendor-import) | `VENDOR` | One vendor record per row (create/update) |
| [Customer Import](#customer-import) | `CUSTOMER` | One customer record per row (create/update) |

---

## Journal Entry

Creates `GLBATCH` (journal) records with `GLENTRY` detail lines. Rows sharing the same `journal_symbol`, `posting_date`, and `description` are grouped into a single batch.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `journal_symbol` | `JOURNALID` | ✅ | Must match a Journal ID in Intacct (e.g. `GJ`, `PR`) |
| `posting_date` | `WHENCREATED` | ✅ | Date the batch is posted |
| `description` | `DESCRIPTION` | | Batch description — also used as grouping key |
| `reference_no` | `REFERENCENO` | | Batch reference |
| `gl_account` | `GLACCOUNTNO` | ✅ | GL account number |
| `amount` | `AMOUNT` | ✅ | Positive decimal (e.g. `1234.56`) |
| `debit_credit` | `TR_TYPE` | ✅ | `D` or `Debit` → `1`; `C` or `Credit` → `-1` |
| `memo` | `MEMO` | | Line memo |
| `location_id` | `LOCATIONID` | | Multi-entity location (overrides entity in credentials) |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `project_id` | `PROJECTID` | | Project dimension |
| `class_id` | `CLASSID` | | Class dimension |
| `customer_id` | `CUSTOMERID` | | Customer dimension |
| `vendor_id` | `VENDORID` | | Vendor dimension |
| `employee_id` | `EMPLOYEEID` | | Employee dimension |
| `item_id` | `ITEMID` | | Item dimension |
| `currency` | `CURRENCY` | | ISO 4217 (e.g. `GBP`, `USD`) |

**Example:**
```csv
journal_symbol,posting_date,description,gl_account,amount,debit_credit,department_id
GJ,25/03/2026,March wages,5000,50000.00,D,HR
GJ,25/03/2026,March wages,2100,50000.00,C,HR
```

---

## Payroll Journal

Same as Journal Entry but with payroll-friendly column names. Uses `pay_date` and `pay_reference` as grouping keys. Compatible with Sage Payroll, ADP, Moorepay, Cintra, and similar systems.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `journal_symbol` | `JOURNALID` | ✅ | e.g. `PR` (Payroll journal) |
| `pay_date` | `WHENCREATED` | ✅ | Payment date — also used as grouping key |
| `pay_reference` | `REFERENCENO` | | Payroll run reference — also used as grouping key |
| `description` | `DESCRIPTION` | | Batch description |
| `account_code` | `GLACCOUNTNO` | ✅ | GL account |
| `amount` | `AMOUNT` | ✅ | Positive decimal |
| `debit_credit` | `TR_TYPE` | ✅ | `D` / `C` |
| `memo` | `MEMO` | | Line memo |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `employee_id` | `EMPLOYEEID` | | Employee dimension |
| `location_id` | `LOCATIONID` | | Location dimension |
| `project_id` | `PROJECTID` | | Project dimension |
| `class_id` | `CLASSID` | | Class dimension |
| `currency` | `CURRENCY` | | ISO 4217 |

**Example:**
```csv
journal_symbol,pay_date,pay_reference,account_code,amount,debit_credit,employee_id
PR,25/03/2026,MAR26-RUN1,5100,3500.00,D,EMP001
PR,25/03/2026,MAR26-RUN1,2200,3500.00,C,EMP001
```

---

## AR Invoice

Creates `ARINVOICE` records. Rows sharing the same `customer_id`, `invoice_date`, and `reference_no` are grouped into a single invoice with multiple lines.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `customer_id` | `CUSTOMERID` | ✅ | Must exist in Intacct |
| `invoice_date` | `WHENCREATED` | ✅ | Invoice date |
| `due_date` | `WHENDUE` | | Payment due date |
| `payment_term` | `TERMNAME` | | Payment term name (e.g. `Net 30`) |
| `description` | `DESCRIPTION` | | Invoice description |
| `reference_no` | `REFERENCENO` | | Invoice reference / PO number — also used as grouping key |
| `currency` | `CURRENCY` | | ISO 4217 |
| `revenue_account` | `GLACCOUNTNO` | ✅ | Revenue GL account |
| `amount` | `AMOUNT` | ✅ | Line amount (positive) |
| `line_memo` | `MEMO` | | Line description |
| `location_id` | `LOCATIONID` | | Location dimension |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `project_id` | `PROJECTID` | | Project dimension |
| `class_id` | `CLASSID` | | Class dimension |
| `item_id` | `ITEMID` | | Item dimension |

**Example:**
```csv
customer_id,invoice_date,reference_no,revenue_account,amount,line_memo
CUST001,01/03/2026,INV-2026-001,4000,1200.00,Consultancy March
CUST001,01/03/2026,INV-2026-001,4100,300.00,Expenses March
```

---

## AP Bill

Creates `APBILL` records. Rows sharing the same `vendor_id`, `bill_date`, and `reference_no` are grouped into a single bill.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `vendor_id` | `VENDORID` | ✅ | Must exist in Intacct |
| `bill_date` | `WHENPOSTED` | ✅ | Bill date |
| `due_date` | `WHENDUE` | | Payment due date |
| `payment_term` | `TERMNAME` | | Payment term name |
| `description` | `DESCRIPTION` | | Bill description |
| `reference_no` | `REFERENCENO` | | Supplier invoice number — also used as grouping key |
| `currency` | `CURRENCY` | | ISO 4217 |
| `expense_account` | `GLACCOUNTNO` | ✅ | Expense GL account |
| `amount` | `AMOUNT` | ✅ | Line amount (positive) |
| `line_memo` | `MEMO` | | Line description |
| `location_id` | `LOCATIONID` | | Location dimension |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `project_id` | `PROJECTID` | | Project dimension |
| `class_id` | `CLASSID` | | Class dimension |
| `item_id` | `ITEMID` | | Item dimension |

**Example:**
```csv
vendor_id,bill_date,reference_no,expense_account,amount,line_memo
VEND001,15/03/2026,SUP-INV-456,6100,750.00,IT hardware
```

---

## Expense Report

Creates `EEXPENSES` records. Rows sharing `employee_id`, `report_date`, and `reference_no` are grouped into a single expense report.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `employee_id` | `EMPLOYEEID` | ✅ | Must exist in Intacct |
| `report_date` | `WHENCREATED` | ✅ | Report submission date |
| `description` | `DESCRIPTION` | | Report description |
| `reference_no` | `REFERENCENO` | | Report reference — also used as grouping key |
| `currency` | `CURRENCY` | | ISO 4217 |
| `expense_type` | `EXPENSETYPE` | ✅ | Expense type name from Intacct |
| `amount` | `AMOUNT` | ✅ | Positive decimal |
| `expense_date` | `EXPENSEDATE` | | Individual expense item date |
| `memo` | `MEMO` | | Line memo |
| `location_id` | `LOCATIONID` | | Location dimension |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `project_id` | `PROJECTID` | | Project dimension |
| `class_id` | `CLASSID` | | Class dimension |
| `billable` | `BILLABLE` | | `true` / `false` / `1` / `0` |
| `reimbursable` | `REIMBURSABLE` | | `true` / `false` / `1` / `0` |

**Example:**
```csv
employee_id,report_date,reference_no,expense_type,amount,memo
EMP042,28/02/2026,EXP-FEB-042,Travel,87.50,Train to London
EMP042,28/02/2026,EXP-FEB-042,Meals,24.00,Client lunch
```

---

## AR Payment

Creates `ARPYMT` (unapplied cash receipt) records. Each row creates one payment. No grouping. Compatible with Stripe, GoCardless, PayPal, and bank feed exports.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `customer_id` | `CUSTOMERID` | ✅ | Must exist in Intacct |
| `payment_date` | `PAYMENTDATE` | ✅ | Date payment was received |
| `amount` | `AMOUNT` | ✅ | Positive decimal |
| `payment_method` | `PAYMENTMETHOD` | | e.g. `Bank transfer`, `Card` |
| `bank_account_id` | `FINANCIALENTITY` | | Intacct bank account ID |
| `currency` | `CURRENCY` | | ISO 4217 |
| `description` | `DESCRIPTION` | | Payment description |
| `reference_no` | `REFERENCENO` | | Reference / transaction ID |
| `location_id` | `LOCATIONID` | | Location dimension |

**Example:**
```csv
customer_id,payment_date,amount,payment_method,reference_no
CUST001,28/03/2026,1500.00,Bank transfer,BACS-2026-0328
```

---

## AP Payment

Creates `APPYMT` (unapplied vendor payment) records. Each row creates one payment. No grouping. Compatible with bank statement exports and payment run summaries.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `vendor_id` | `VENDORID` | ✅ | Must exist in Intacct |
| `payment_date` | `PAYMENTDATE` | ✅ | Date payment was made |
| `amount` | `AMOUNT` | ✅ | Positive decimal |
| `payment_method` | `PAYMENTMETHOD` | | e.g. `BACS`, `CHAPS` |
| `bank_account_id` | `FINANCIALENTITY` | | Intacct bank account ID |
| `currency` | `CURRENCY` | | ISO 4217 |
| `description` | `DESCRIPTION` | | Payment description |
| `reference_no` | `REFERENCENO` | | Reference / BACS reference |
| `location_id` | `LOCATIONID` | | Location dimension |

**Example:**
```csv
vendor_id,payment_date,amount,payment_method,reference_no
VEND001,31/03/2026,750.00,BACS,PAY-VEND001-MAR26
```

---

## Timesheet

Creates `TIMESHEET` records in Intacct. Each row creates one timesheet with one time entry. For multi-day timesheets, submit one row per day — the processor groups by `employee_id` + `week_start_date` into a single timesheet header.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `employee_id` | `EMPLOYEEID` | ✅ | Must exist in Intacct |
| `week_start_date` | `BEGINDATE` | ✅ | Monday of the timesheet week — also used as grouping key |
| `description` | `DESCRIPTION` | | Timesheet description |
| `project_id` | `PROJECTID` | | Project code |
| `task_id` | `TASKKEY` | | Task within the project |
| `time_type` | `TIMETYPE` | | Time type (e.g. `Regular`, `Overtime`) |
| `hours` | `QTY` | ✅ | Decimal hours (e.g. `7.5`) |
| `memo` | `MEMO` | | Entry memo |
| `location_id` | `LOCATIONID` | | Location dimension |
| `department_id` | `DEPARTMENTID` | | Department dimension |
| `class_id` | `CLASSID` | | Class dimension |

**Example:**
```csv
employee_id,week_start_date,project_id,task_id,hours,memo
EMP001,24/03/2026,PROJ-MIP,DEV,7.5,Integration development
EMP001,25/03/2026,PROJ-MIP,DEV,7.5,Integration development
EMP001,26/03/2026,PROJ-MIP,DOCS,4.0,Documentation
```

---

## Vendor Import

Creates or updates `VENDOR` records in Intacct. Each row is one vendor. Use for initial vendor data migrations or bulk maintenance. Rows are matched to existing vendors by `vendor_id` — existing records are updated.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `vendor_id` | `VENDORID` | ✅ | Unique vendor ID in Intacct |
| `vendor_name` | `NAME` | ✅ | Display name |
| `email` | `EMAIL1` | | Primary email address |
| `phone` | `PHONE1` | | Primary phone number |
| `currency` | `CURRENCY` | | Default currency (ISO 4217) |
| `payment_method` | `PAYMENTMETHOD` | | Default payment method |
| `tax_id` | `TAXID` | | VAT / tax registration number |
| `address_line1` | `ADDRESS1` | | Street address line 1 |
| `address_line2` | `ADDRESS2` | | Street address line 2 |
| `city` | `CITY` | | City |
| `state` | `STATE` | | County / State |
| `zip` | `ZIP` | | Postcode / ZIP |
| `country` | `COUNTRY` | | Country name |
| `notes` | `NOTES` | | Internal notes |

**Example:**
```csv
vendor_id,vendor_name,email,currency,address_line1,city,zip,country
VEND001,Acme Supplies Ltd,accounts@acme.co.uk,GBP,1 Business Park,Manchester,M1 1AA,United Kingdom
```

---

## Customer Import

Creates or updates `CUSTOMER` records in Intacct. Each row is one customer. Use for CRM migrations or batch customer setup.

| Column | Intacct Field | Required | Notes |
|--------|--------------|----------|-------|
| `customer_id` | `CUSTOMERID` | ✅ | Unique customer ID in Intacct |
| `customer_name` | `NAME` | ✅ | Display name |
| `email` | `EMAIL1` | | Primary email address |
| `phone` | `PHONE1` | | Primary phone number |
| `currency` | `CURRENCY` | | Default currency (ISO 4217) |
| `credit_limit` | `CREDITLIMIT` | | Credit limit (decimal) |
| `payment_term` | `TERMNAME` | | Payment term name (e.g. `Net 30`) |
| `tax_id` | `TAXID` | | VAT / tax registration number |
| `address_line1` | `ADDRESS1` | | Street address line 1 |
| `city` | `CITY` | | City |
| `state` | `STATE` | | County / State |
| `zip` | `ZIP` | | Postcode / ZIP |
| `country` | `COUNTRY` | | Country name |
| `notes` | `NOTES` | | Internal notes |

**Example:**
```csv
customer_id,customer_name,email,currency,credit_limit,payment_term
CUST001,Widgets International,ar@widgets.com,GBP,10000.00,Net 30
CUST002,Global Corp,finance@globalcorp.com,USD,25000.00,Net 45
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Required field missing` | A required column is blank or absent | Check column names match exactly; fill all required fields |
| `Invalid date` | Date string not in any accepted format | Confirm format with the date examples above |
| `Invalid amount` | Non-numeric or negative amount | Use positive decimals with no currency symbols (e.g. `1234.56`) |
| `Unbalanced journal` | Debits ≠ Credits within a batch | Check `debit_credit` values and ensure the batch balances to zero |
| `ARINVOICE not found` | Customer ID does not exist in Intacct | Verify the customer exists, or import customers first |
| `APBILL not found` | Vendor ID does not exist in Intacct | Verify the vendor exists, or import vendors first |
| `BOM / encoding error` | File has a BOM or non-UTF-8 encoding | Save as UTF-8 without BOM in Excel: Save As → CSV UTF-8 (Comma delimited) |
| `Duplicate file` | SHA-256 hash matches an existing upload | Same file content already uploaded; check the referenced job |
| `XL03000006` | ISV Sender not authorised for this company | Company Admin → Web Services Authorizations → add Sender ID |
| `BL03000018` | GL account requires a Location dimension | Set Entity ID in Settings → Integrations |
