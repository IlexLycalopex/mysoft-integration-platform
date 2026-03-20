-- Migration 013: Extended system mapping templates
-- 1. Update all existing templates: add date_format on date fields, trim on strings, extra dimensions
-- 2. Add new templates: Payroll Journal, AR Payment, AP Payment

-- ─── Update Standard Journal Entry ───────────────────────────────────────────
UPDATE public.field_mappings
SET
  description  = 'Standard template for Sage Intacct General Journal (GLBATCH/GLENTRY) imports. Supports UK and US date formats.',
  column_mappings = '[
    {"id":"t-je-1",  "source_column":"journal_symbol",  "target_field":"JOURNALID",    "transform":"trim",        "required":true},
    {"id":"t-je-2",  "source_column":"posting_date",    "target_field":"WHENCREATED",  "transform":"date_format", "required":true},
    {"id":"t-je-3",  "source_column":"description",     "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-je-4",  "source_column":"reference_no",    "target_field":"REFERENCENO",  "transform":"trim",        "required":false},
    {"id":"t-je-5",  "source_column":"gl_account",      "target_field":"GLACCOUNTNO",  "transform":"trim",        "required":true},
    {"id":"t-je-6",  "source_column":"amount",          "target_field":"AMOUNT",       "transform":"decimal",     "required":true},
    {"id":"t-je-7",  "source_column":"debit_credit",    "target_field":"TR_TYPE",      "transform":"tr_type",     "required":true},
    {"id":"t-je-8",  "source_column":"memo",            "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-je-9",  "source_column":"location_id",     "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-je-10", "source_column":"department_id",   "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-je-11", "source_column":"project_id",      "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-je-12", "source_column":"class_id",        "target_field":"CLASSID",      "transform":"trim",        "required":false},
    {"id":"t-je-13", "source_column":"customer_id",     "target_field":"CUSTOMERID",   "transform":"trim",        "required":false},
    {"id":"t-je-14", "source_column":"vendor_id",       "target_field":"VENDORID",     "transform":"trim",        "required":false},
    {"id":"t-je-15", "source_column":"employee_id",     "target_field":"EMPLOYEEID",   "transform":"trim",        "required":false},
    {"id":"t-je-16", "source_column":"item_id",         "target_field":"ITEMID",       "transform":"trim",        "required":false},
    {"id":"t-je-17", "source_column":"currency",        "target_field":"CURRENCY",     "transform":"trim",        "required":false}
  ]'::jsonb
WHERE id = '00000000-0000-0000-0001-000000000001';

-- ─── Update Standard AR Invoice ───────────────────────────────────────────────
UPDATE public.field_mappings
SET
  description  = 'Standard template for Sage Intacct Accounts Receivable Invoice (ARINVOICE) imports. Supports UK and US date formats.',
  column_mappings = '[
    {"id":"t-ar-1",  "source_column":"customer_id",     "target_field":"CUSTOMERID",   "transform":"trim",        "required":true},
    {"id":"t-ar-2",  "source_column":"invoice_date",    "target_field":"WHENCREATED",  "transform":"date_format", "required":true},
    {"id":"t-ar-3",  "source_column":"due_date",        "target_field":"WHENDUE",      "transform":"date_format", "required":false},
    {"id":"t-ar-4",  "source_column":"payment_term",    "target_field":"TERMNAME",     "transform":"trim",        "required":false},
    {"id":"t-ar-5",  "source_column":"description",     "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-ar-6",  "source_column":"reference_no",    "target_field":"REFERENCENO",  "transform":"trim",        "required":false},
    {"id":"t-ar-7",  "source_column":"currency",        "target_field":"CURRENCY",     "transform":"trim",        "required":false},
    {"id":"t-ar-8",  "source_column":"revenue_account", "target_field":"GLACCOUNTNO",  "transform":"trim",        "required":true},
    {"id":"t-ar-9",  "source_column":"amount",          "target_field":"AMOUNT",       "transform":"decimal",     "required":true},
    {"id":"t-ar-10", "source_column":"line_memo",       "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-ar-11", "source_column":"location_id",     "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-ar-12", "source_column":"department_id",   "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-ar-13", "source_column":"project_id",      "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-ar-14", "source_column":"class_id",        "target_field":"CLASSID",      "transform":"trim",        "required":false},
    {"id":"t-ar-15", "source_column":"item_id",         "target_field":"ITEMID",       "transform":"trim",        "required":false}
  ]'::jsonb
WHERE id = '00000000-0000-0000-0002-000000000001';

-- ─── Update Standard AP Bill ──────────────────────────────────────────────────
UPDATE public.field_mappings
SET
  description  = 'Standard template for Sage Intacct Accounts Payable Bill (APBILL) imports. Supports UK and US date formats.',
  column_mappings = '[
    {"id":"t-ap-1",  "source_column":"vendor_id",       "target_field":"VENDORID",     "transform":"trim",        "required":true},
    {"id":"t-ap-2",  "source_column":"bill_date",       "target_field":"WHENPOSTED",   "transform":"date_format", "required":true},
    {"id":"t-ap-3",  "source_column":"due_date",        "target_field":"WHENDUE",      "transform":"date_format", "required":false},
    {"id":"t-ap-4",  "source_column":"payment_term",    "target_field":"TERMNAME",     "transform":"trim",        "required":false},
    {"id":"t-ap-5",  "source_column":"description",     "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-ap-6",  "source_column":"reference_no",    "target_field":"REFERENCENO",  "transform":"trim",        "required":false},
    {"id":"t-ap-7",  "source_column":"currency",        "target_field":"CURRENCY",     "transform":"trim",        "required":false},
    {"id":"t-ap-8",  "source_column":"expense_account", "target_field":"GLACCOUNTNO",  "transform":"trim",        "required":true},
    {"id":"t-ap-9",  "source_column":"amount",          "target_field":"AMOUNT",       "transform":"decimal",     "required":true},
    {"id":"t-ap-10", "source_column":"line_memo",       "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-ap-11", "source_column":"location_id",     "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-ap-12", "source_column":"department_id",   "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-ap-13", "source_column":"project_id",      "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-ap-14", "source_column":"class_id",        "target_field":"CLASSID",      "transform":"trim",        "required":false},
    {"id":"t-ap-15", "source_column":"item_id",         "target_field":"ITEMID",       "transform":"trim",        "required":false}
  ]'::jsonb
WHERE id = '00000000-0000-0000-0003-000000000001';

-- ─── Update Standard Expense Report ──────────────────────────────────────────
UPDATE public.field_mappings
SET
  description  = 'Standard template for Sage Intacct Expense Report (EEXPENSES) imports. Supports UK and US date formats.',
  column_mappings = '[
    {"id":"t-er-1",  "source_column":"employee_id",     "target_field":"EMPLOYEEID",   "transform":"trim",        "required":true},
    {"id":"t-er-2",  "source_column":"report_date",     "target_field":"WHENCREATED",  "transform":"date_format", "required":true},
    {"id":"t-er-3",  "source_column":"description",     "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-er-4",  "source_column":"reference_no",    "target_field":"REFERENCENO",  "transform":"trim",        "required":false},
    {"id":"t-er-5",  "source_column":"currency",        "target_field":"CURRENCY",     "transform":"trim",        "required":false},
    {"id":"t-er-6",  "source_column":"expense_type",    "target_field":"EXPENSETYPE",  "transform":"trim",        "required":true},
    {"id":"t-er-7",  "source_column":"amount",          "target_field":"AMOUNT",       "transform":"decimal",     "required":true},
    {"id":"t-er-8",  "source_column":"expense_date",    "target_field":"EXPENSEDATE",  "transform":"date_format", "required":false},
    {"id":"t-er-9",  "source_column":"memo",            "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-er-10", "source_column":"location_id",     "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-er-11", "source_column":"department_id",   "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-er-12", "source_column":"project_id",      "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-er-13", "source_column":"class_id",        "target_field":"CLASSID",      "transform":"trim",        "required":false},
    {"id":"t-er-14", "source_column":"billable",        "target_field":"BILLABLE",     "transform":"boolean",     "required":false},
    {"id":"t-er-15", "source_column":"reimbursable",    "target_field":"REIMBURSABLE", "transform":"boolean",     "required":false}
  ]'::jsonb
WHERE id = '00000000-0000-0000-0004-000000000001';

-- ─── Payroll Journal ──────────────────────────────────────────────────────────
-- Maps payroll system exports (Sage Payroll, ADP, Moorepay, Cintra, etc.) to
-- Intacct journal entries. Uses pay_date, payroll-friendly column names, and
-- includes EMPLOYEEID and CLASSID for payroll analysis dimensions.
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0005-000000000001',
  NULL,
  'Payroll Journal',
  'Maps payroll system exports to Sage Intacct journal entries (GLBATCH). Supports pay_date, payroll account codes, employee and department dimensions. Compatible with Sage Payroll, ADP, Moorepay, and similar systems.',
  'journal_entry',
  false,
  true,
  '[
    {"id":"t-pj-1",  "source_column":"journal_symbol",  "target_field":"JOURNALID",    "transform":"trim",        "required":true},
    {"id":"t-pj-2",  "source_column":"pay_date",        "target_field":"WHENCREATED",  "transform":"date_format", "required":true},
    {"id":"t-pj-3",  "source_column":"pay_reference",   "target_field":"REFERENCENO",  "transform":"trim",        "required":false},
    {"id":"t-pj-4",  "source_column":"description",     "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-pj-5",  "source_column":"account_code",    "target_field":"GLACCOUNTNO",  "transform":"trim",        "required":true},
    {"id":"t-pj-6",  "source_column":"amount",          "target_field":"AMOUNT",       "transform":"decimal",     "required":true},
    {"id":"t-pj-7",  "source_column":"debit_credit",    "target_field":"TR_TYPE",      "transform":"tr_type",     "required":true},
    {"id":"t-pj-8",  "source_column":"memo",            "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-pj-9",  "source_column":"department_id",   "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-pj-10", "source_column":"employee_id",     "target_field":"EMPLOYEEID",   "transform":"trim",        "required":false},
    {"id":"t-pj-11", "source_column":"location_id",     "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-pj-12", "source_column":"project_id",      "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-pj-13", "source_column":"class_id",        "target_field":"CLASSID",      "transform":"trim",        "required":false},
    {"id":"t-pj-14", "source_column":"currency",        "target_field":"CURRENCY",     "transform":"trim",        "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  column_mappings  = EXCLUDED.column_mappings;

-- ─── AR Payment / Cash Receipt ────────────────────────────────────────────────
-- Maps payment processor exports (Stripe, GoCardless, PayPal, bank feeds) to
-- Intacct unapplied AR payments (ARPYMT). Each row = one payment.
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0006-000000000001',
  NULL,
  'AR Payment / Cash Receipt',
  'Maps payment processor exports (Stripe, GoCardless, bank) to Sage Intacct unapplied AR payments (ARPYMT). Each row creates one cash receipt against a customer. Supports UK and US date formats.',
  'ar_payment',
  false,
  true,
  '[
    {"id":"t-arp-1",  "source_column":"customer_id",     "target_field":"CUSTOMERID",     "transform":"trim",        "required":true},
    {"id":"t-arp-2",  "source_column":"payment_date",    "target_field":"PAYMENTDATE",    "transform":"date_format", "required":true},
    {"id":"t-arp-3",  "source_column":"amount",          "target_field":"AMOUNT",         "transform":"decimal",     "required":true},
    {"id":"t-arp-4",  "source_column":"payment_method",  "target_field":"PAYMENTMETHOD",  "transform":"trim",        "required":false},
    {"id":"t-arp-5",  "source_column":"bank_account_id", "target_field":"FINANCIALENTITY","transform":"trim",        "required":false},
    {"id":"t-arp-6",  "source_column":"currency",        "target_field":"CURRENCY",       "transform":"trim",        "required":false},
    {"id":"t-arp-7",  "source_column":"description",     "target_field":"DESCRIPTION",    "transform":"trim",        "required":false},
    {"id":"t-arp-8",  "source_column":"reference_no",    "target_field":"REFERENCENO",    "transform":"trim",        "required":false},
    {"id":"t-arp-9",  "source_column":"location_id",     "target_field":"LOCATIONID",     "transform":"trim",        "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  column_mappings  = EXCLUDED.column_mappings;

-- ─── AP Payment ───────────────────────────────────────────────────────────────
-- Maps payment run exports or bank statement lines to Intacct unapplied AP
-- payments (APPYMT). Each row = one vendor payment.
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0007-000000000001',
  NULL,
  'AP Payment',
  'Maps payment run exports or bank statement lines to Sage Intacct unapplied AP payments (APPYMT). Each row creates one payment against a vendor. Supports UK and US date formats.',
  'ap_payment',
  false,
  true,
  '[
    {"id":"t-app-1",  "source_column":"vendor_id",       "target_field":"VENDORID",       "transform":"trim",        "required":true},
    {"id":"t-app-2",  "source_column":"payment_date",    "target_field":"PAYMENTDATE",    "transform":"date_format", "required":true},
    {"id":"t-app-3",  "source_column":"amount",          "target_field":"AMOUNT",         "transform":"decimal",     "required":true},
    {"id":"t-app-4",  "source_column":"payment_method",  "target_field":"PAYMENTMETHOD",  "transform":"trim",        "required":false},
    {"id":"t-app-5",  "source_column":"bank_account_id", "target_field":"FINANCIALENTITY","transform":"trim",        "required":false},
    {"id":"t-app-6",  "source_column":"currency",        "target_field":"CURRENCY",       "transform":"trim",        "required":false},
    {"id":"t-app-7",  "source_column":"description",     "target_field":"DESCRIPTION",    "transform":"trim",        "required":false},
    {"id":"t-app-8",  "source_column":"reference_no",    "target_field":"REFERENCENO",    "transform":"trim",        "required":false},
    {"id":"t-app-9",  "source_column":"location_id",     "target_field":"LOCATIONID",     "transform":"trim",        "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  column_mappings  = EXCLUDED.column_mappings;
