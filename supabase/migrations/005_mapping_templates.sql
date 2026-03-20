-- Migration 005: System mapping templates
-- Allows tenant_id to be NULL for system-owned templates,
-- adds is_template flag, RLS policy, and seeds 4 standard templates.

ALTER TABLE public.field_mappings ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.field_mappings ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow all authenticated users to read system templates
CREATE POLICY "Authenticated users can read templates"
  ON public.field_mappings
  FOR SELECT
  USING (is_template = true);

-- ─── Journal Entry template ───────────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  NULL,
  'Standard Journal Entry',
  'Standard template for Sage Intacct General Journal (GLBATCH/GLENTRY) imports',
  'journal_entry',
  false,
  true,
  '[
    {"id":"t-je-1","source_column":"journal_symbol","target_field":"JOURNALID","transform":"none","required":true},
    {"id":"t-je-2","source_column":"posting_date","target_field":"WHENCREATED","transform":"none","required":true},
    {"id":"t-je-3","source_column":"description","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"t-je-4","source_column":"reference_no","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"t-je-5","source_column":"gl_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"t-je-6","source_column":"amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"t-je-7","source_column":"debit_credit","target_field":"TR_TYPE","transform":"tr_type","required":true},
    {"id":"t-je-8","source_column":"memo","target_field":"MEMO","transform":"none","required":false},
    {"id":"t-je-9","source_column":"location_id","target_field":"LOCATIONID","transform":"none","required":false},
    {"id":"t-je-10","source_column":"department_id","target_field":"DEPARTMENTID","transform":"none","required":false},
    {"id":"t-je-11","source_column":"project_id","target_field":"PROJECTID","transform":"none","required":false},
    {"id":"t-je-12","source_column":"class_id","target_field":"CLASSID","transform":"none","required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── AR Invoice template ──────────────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0002-000000000001',
  NULL,
  'Standard AR Invoice',
  'Standard template for Sage Intacct Accounts Receivable Invoice (ARINVOICE) imports',
  'ar_invoice',
  false,
  true,
  '[
    {"id":"t-ar-1","source_column":"customer_id","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"t-ar-2","source_column":"invoice_date","target_field":"WHENCREATED","transform":"none","required":true},
    {"id":"t-ar-3","source_column":"due_date","target_field":"WHENDUE","transform":"none","required":false},
    {"id":"t-ar-4","source_column":"payment_term","target_field":"TERMNAME","transform":"none","required":false},
    {"id":"t-ar-5","source_column":"description","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"t-ar-6","source_column":"reference_no","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"t-ar-7","source_column":"currency","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"t-ar-8","source_column":"revenue_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"t-ar-9","source_column":"amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"t-ar-10","source_column":"line_memo","target_field":"MEMO","transform":"none","required":false},
    {"id":"t-ar-11","source_column":"location_id","target_field":"LOCATIONID","transform":"none","required":false},
    {"id":"t-ar-12","source_column":"department_id","target_field":"DEPARTMENTID","transform":"none","required":false},
    {"id":"t-ar-13","source_column":"project_id","target_field":"PROJECTID","transform":"none","required":false},
    {"id":"t-ar-14","source_column":"class_id","target_field":"CLASSID","transform":"none","required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── AP Bill template ─────────────────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0003-000000000001',
  NULL,
  'Standard AP Bill',
  'Standard template for Sage Intacct Accounts Payable Bill (APBILL) imports',
  'ap_bill',
  false,
  true,
  '[
    {"id":"t-ap-1","source_column":"vendor_id","target_field":"VENDORID","transform":"none","required":true},
    {"id":"t-ap-2","source_column":"bill_date","target_field":"WHENPOSTED","transform":"none","required":true},
    {"id":"t-ap-3","source_column":"due_date","target_field":"WHENDUE","transform":"none","required":false},
    {"id":"t-ap-4","source_column":"payment_term","target_field":"TERMNAME","transform":"none","required":false},
    {"id":"t-ap-5","source_column":"description","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"t-ap-6","source_column":"reference_no","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"t-ap-7","source_column":"currency","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"t-ap-8","source_column":"expense_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"t-ap-9","source_column":"amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"t-ap-10","source_column":"line_memo","target_field":"MEMO","transform":"none","required":false},
    {"id":"t-ap-11","source_column":"location_id","target_field":"LOCATIONID","transform":"none","required":false},
    {"id":"t-ap-12","source_column":"department_id","target_field":"DEPARTMENTID","transform":"none","required":false},
    {"id":"t-ap-13","source_column":"project_id","target_field":"PROJECTID","transform":"none","required":false},
    {"id":"t-ap-14","source_column":"class_id","target_field":"CLASSID","transform":"none","required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── Expense Report template ──────────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0004-000000000001',
  NULL,
  'Standard Expense Report',
  'Standard template for Sage Intacct Expense Report (EEXPENSES) imports',
  'expense_report',
  false,
  true,
  '[
    {"id":"t-er-1","source_column":"employee_id","target_field":"EMPLOYEEID","transform":"none","required":true},
    {"id":"t-er-2","source_column":"report_date","target_field":"WHENCREATED","transform":"none","required":true},
    {"id":"t-er-3","source_column":"description","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"t-er-4","source_column":"reference_no","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"t-er-5","source_column":"currency","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"t-er-6","source_column":"expense_type","target_field":"EXPENSE_TYPE","transform":"none","required":true},
    {"id":"t-er-7","source_column":"amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"t-er-8","source_column":"expense_date","target_field":"EXPENSEDATE","transform":"none","required":false},
    {"id":"t-er-9","source_column":"memo","target_field":"MEMO","transform":"none","required":false},
    {"id":"t-er-10","source_column":"location_id","target_field":"LOCATIONID","transform":"none","required":false},
    {"id":"t-er-11","source_column":"department_id","target_field":"DEPARTMENTID","transform":"none","required":false},
    {"id":"t-er-12","source_column":"project_id","target_field":"PROJECTID","transform":"none","required":false},
    {"id":"t-er-13","source_column":"class_id","target_field":"CLASSID","transform":"none","required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
