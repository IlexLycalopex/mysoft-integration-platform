-- ============================================================
-- Mysoft Integration Platform — Connector Registry
-- Migration 032: endpoint_connectors, endpoint_object_types,
--                field_mappings extensibility
--
-- Design principles:
--   • Zero breaking changes — all existing data untouched
--   • transaction_type made nullable TEXT (was constrained enum)
--   • object_type_id FK links to registry (new custom types)
--   • Existing rows: object_type_id = NULL, transaction_type unchanged
--
-- ROLLBACK PLAN (run in reverse order if needed):
--   1. ALTER TABLE public.field_mappings DROP COLUMN IF EXISTS object_type_id;
--   2. ALTER TABLE public.endpoint_object_types DROP POLICY IF EXISTS "platform_admins_manage_object_types";
--   3. ALTER TABLE public.endpoint_connectors DROP POLICY IF EXISTS "platform_admins_manage_connectors";
--   4. DROP TABLE IF EXISTS public.endpoint_object_types;
--   5. DROP TABLE IF EXISTS public.endpoint_connectors;
--   6. Re-add original CHECK constraint on field_mappings.transaction_type
--      (see bottom of this file for original constraint SQL)
-- ============================================================

-- ── 1. Relax transaction_type to nullable TEXT ────────────────────────────────
-- The original column had a hardcoded CHECK (one of 9 values).
-- We drop that constraint so custom connectors can use their own object keys.
-- Existing rows are untouched; the 9 system types continue to work exactly as before.

DO $$
DECLARE
  _constraint_name text;
BEGIN
  SELECT conname INTO _constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.field_mappings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%transaction_type%';

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.field_mappings DROP CONSTRAINT %I', _constraint_name);
  END IF;
END $$;

ALTER TABLE public.field_mappings
  ALTER COLUMN transaction_type DROP NOT NULL;

-- ── 2. endpoint_connectors ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.endpoint_connectors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key    text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  description      text,
  logo_url         text,
  is_system        boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  config_schema    jsonb,
  capabilities     jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order       int  NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_endpoint_connectors_key
  ON public.endpoint_connectors(connector_key);

-- ── 3. endpoint_object_types ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.endpoint_object_types (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id     uuid NOT NULL REFERENCES public.endpoint_connectors(id) ON DELETE CASCADE,
  object_key       text NOT NULL,
  display_name     text NOT NULL,
  description      text,
  is_system        boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  field_schema     jsonb,
  api_object_name  text,
  pipeline_config  jsonb,
  sort_order       int  NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connector_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_endpoint_object_types_connector
  ON public.endpoint_object_types(connector_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_object_types_key
  ON public.endpoint_object_types(connector_id, object_key);

-- ── 4. FK on field_mappings ───────────────────────────────────────────────────

ALTER TABLE public.field_mappings
  ADD COLUMN IF NOT EXISTS object_type_id uuid
    REFERENCES public.endpoint_object_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_mappings_object_type_id
  ON public.field_mappings(object_type_id);

-- ── 5. RLS policies ───────────────────────────────────────────────────────────

ALTER TABLE public.endpoint_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_object_types ENABLE ROW LEVEL SECURITY;

-- Connectors: platform admins full access; everyone else read-only on active records
CREATE POLICY "platform_admins_manage_connectors"
  ON public.endpoint_connectors
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "authenticated_read_active_connectors"
  ON public.endpoint_connectors
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "platform_admins_manage_object_types"
  ON public.endpoint_object_types
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "authenticated_read_active_object_types"
  ON public.endpoint_object_types
  FOR SELECT
  USING (is_active = true);

-- ── 6. Seed: Sage Intacct connector ──────────────────────────────────────────

INSERT INTO public.endpoint_connectors
  (connector_key, display_name, description, is_system, is_active, capabilities, sort_order)
VALUES (
  'intacct',
  'Sage Intacct',
  'Sage Intacct cloud accounting — journal entries, invoices, bills, expense reports, payments, timesheets, vendors and customers.',
  true,
  true,
  '{
    "connectorType": "intacct",
    "displayName": "Sage Intacct",
    "supportsDryRun": true,
    "supportsUpsert": false,
    "supportsAttachments": false,
    "supportsFieldDiscovery": true,
    "fieldDiscoveryRequiresAuth": true,
    "supportsHealthCheck": true
  }'::jsonb,
  10
)
ON CONFLICT (connector_key) DO NOTHING;

-- ── 7. Seed: Intacct object types ─────────────────────────────────────────────
-- Using a DO block so we can reference the connector id by key.

DO $$
DECLARE
  _connector_id uuid;
BEGIN
  SELECT id INTO _connector_id FROM public.endpoint_connectors WHERE connector_key = 'intacct';
  IF _connector_id IS NULL THEN RETURN; END IF;

  -- journal_entry
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'journal_entry', 'Journal Entry', 'General ledger journal entries', true, true, 'GLJOURNAL', 10,
    '{
      "fields": [
        {"key":"JOURNALID","label":"Journal ID","description":"Journal symbol (e.g. GJ, AJ)","required":true,"group":"header"},
        {"key":"WHENCREATED","label":"Posting Date","description":"Date the entry is posted (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"DESCRIPTION","label":"Description","description":"Journal entry description","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"External reference number","required":false,"group":"header"},
        {"key":"REVERSEDATE","label":"Reverse Date","description":"Date of auto-reversal entry (MM/DD/YYYY)","required":false,"group":"header"},
        {"key":"SUPDOCID","label":"Supporting Doc ID","description":"Attached supporting document ID","required":false,"group":"header"},
        {"key":"GLACCOUNTNO","label":"GL Account No","description":"General ledger account number","required":true,"group":"line"},
        {"key":"AMOUNT","label":"Amount","description":"Absolute transaction amount","required":true,"group":"line"},
        {"key":"TR_TYPE","label":"Transaction Type","description":"1 = Debit, -1 = Credit (use tr_type transform)","required":true,"group":"line"},
        {"key":"MEMO","label":"Memo","description":"Line-level memo/description","required":false,"group":"line"},
        {"key":"CURRENCY","label":"Currency","description":"ISO 4217 currency code","required":false,"group":"line"},
        {"key":"EXCH_RATE_TYPE","label":"Exchange Rate Type","description":"Exchange rate type","required":false,"group":"line"},
        {"key":"LOCATIONID","label":"Location ID","description":"Location dimension","required":false,"group":"line"},
        {"key":"DEPARTMENTID","label":"Department ID","description":"Department dimension","required":false,"group":"line"},
        {"key":"PROJECTID","label":"Project ID","description":"Project dimension","required":false,"group":"line"},
        {"key":"TASKID","label":"Task ID","description":"Task dimension","required":false,"group":"line"},
        {"key":"CUSTOMERID","label":"Customer ID","description":"Customer dimension","required":false,"group":"line"},
        {"key":"VENDORID","label":"Vendor ID","description":"Vendor dimension","required":false,"group":"line"},
        {"key":"EMPLOYEEID","label":"Employee ID","description":"Employee dimension","required":false,"group":"line"},
        {"key":"ITEMID","label":"Item ID","description":"Item/product dimension","required":false,"group":"line"},
        {"key":"CLASSID","label":"Class ID","description":"Class dimension","required":false,"group":"line"},
        {"key":"WAREHOUSEID","label":"Warehouse ID","description":"Warehouse dimension","required":false,"group":"line"},
        {"key":"CONTRACTID","label":"Contract ID","description":"Contract dimension","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- ar_invoice
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'ar_invoice', 'AR Invoice', 'Accounts receivable invoices', true, true, 'ARINVOICE', 20,
    '{
      "fields": [
        {"key":"CUSTOMERID","label":"Customer ID","description":"Intacct customer record ID","required":true,"group":"header"},
        {"key":"WHENCREATED","label":"Invoice Date","description":"Date of the invoice (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"WHENDUE","label":"Due Date","description":"Payment due date (MM/DD/YYYY)","required":false,"group":"header"},
        {"key":"TERMNAME","label":"Payment Term","description":"Payment term name (e.g. Net 30)","required":false,"group":"header"},
        {"key":"DESCRIPTION","label":"Description","description":"Invoice description","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"Invoice reference / PO number","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Invoice currency (ISO 4217)","required":false,"group":"header"},
        {"key":"SUPDOCID","label":"Supporting Doc ID","description":"Attached supporting document ID","required":false,"group":"header"},
        {"key":"GLACCOUNTNO","label":"Revenue Account","description":"Revenue GL account for the line","required":true,"group":"line"},
        {"key":"AMOUNT","label":"Amount","description":"Line item amount (excl. tax)","required":true,"group":"line"},
        {"key":"MEMO","label":"Line Memo","description":"Line item description","required":false,"group":"line"},
        {"key":"LOCATIONID","label":"Location ID","description":"Location dimension","required":false,"group":"line"},
        {"key":"DEPARTMENTID","label":"Department ID","description":"Department dimension","required":false,"group":"line"},
        {"key":"PROJECTID","label":"Project ID","description":"Project dimension","required":false,"group":"line"},
        {"key":"TASKID","label":"Task ID","description":"Task dimension","required":false,"group":"line"},
        {"key":"CLASSID","label":"Class ID","description":"Class dimension","required":false,"group":"line"},
        {"key":"WAREHOUSEID","label":"Warehouse ID","description":"Warehouse dimension","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- ap_bill
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'ap_bill', 'AP Bill', 'Accounts payable bills', true, true, 'APBILL', 30,
    '{
      "fields": [
        {"key":"VENDORID","label":"Vendor ID","description":"Intacct vendor record ID","required":true,"group":"header"},
        {"key":"WHENPOSTED","label":"Bill Date","description":"Date the bill is posted (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"WHENDUE","label":"Due Date","description":"Payment due date (MM/DD/YYYY)","required":false,"group":"header"},
        {"key":"TERMNAME","label":"Payment Term","description":"Payment term name (e.g. Net 30)","required":false,"group":"header"},
        {"key":"DESCRIPTION","label":"Description","description":"Bill description","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"Bill reference / vendor invoice no.","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Bill currency (ISO 4217)","required":false,"group":"header"},
        {"key":"SUPDOCID","label":"Supporting Doc ID","description":"Attached supporting document ID","required":false,"group":"header"},
        {"key":"PAYMENTPRIORITY","label":"Payment Priority","description":"Payment priority (e.g. Normal, High)","required":false,"group":"header"},
        {"key":"GLACCOUNTNO","label":"Expense Account","description":"Expense GL account for the line","required":true,"group":"line"},
        {"key":"AMOUNT","label":"Amount","description":"Line item amount","required":true,"group":"line"},
        {"key":"MEMO","label":"Line Memo","description":"Line item description","required":false,"group":"line"},
        {"key":"LOCATIONID","label":"Location ID","description":"Location dimension","required":false,"group":"line"},
        {"key":"DEPARTMENTID","label":"Department ID","description":"Department dimension","required":false,"group":"line"},
        {"key":"PROJECTID","label":"Project ID","description":"Project dimension","required":false,"group":"line"},
        {"key":"TASKID","label":"Task ID","description":"Task dimension","required":false,"group":"line"},
        {"key":"CLASSID","label":"Class ID","description":"Class dimension","required":false,"group":"line"},
        {"key":"WAREHOUSEID","label":"Warehouse ID","description":"Warehouse dimension","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- expense_report
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'expense_report', 'Expense Report', 'Employee expense reports', true, true, 'EEXPENSES', 40,
    '{
      "fields": [
        {"key":"EMPLOYEEID","label":"Employee ID","description":"Intacct employee record ID","required":true,"group":"header"},
        {"key":"WHENCREATED","label":"Report Date","description":"Date of the expense report (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"DESCRIPTION","label":"Description","description":"Expense report description","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"External reference","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Report currency (ISO 4217)","required":false,"group":"header"},
        {"key":"EXPENSE_TYPE","label":"Expense Type","description":"Expense type / category name","required":true,"group":"line"},
        {"key":"AMOUNT","label":"Amount","description":"Expense amount","required":true,"group":"line"},
        {"key":"EXPENSEDATE","label":"Expense Date","description":"Date expense was incurred (MM/DD/YYYY)","required":false,"group":"line"},
        {"key":"MEMO","label":"Memo","description":"Line-level description","required":false,"group":"line"},
        {"key":"LOCATIONID","label":"Location ID","description":"Location dimension","required":false,"group":"line"},
        {"key":"DEPARTMENTID","label":"Department ID","description":"Department dimension","required":false,"group":"line"},
        {"key":"PROJECTID","label":"Project ID","description":"Project dimension","required":false,"group":"line"},
        {"key":"CLASSID","label":"Class ID","description":"Class dimension","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- ar_payment
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'ar_payment', 'AR Payment', 'Accounts receivable payments', true, true, 'ARPAYMENT', 50,
    '{
      "fields": [
        {"key":"CUSTOMERID","label":"Customer ID","description":"Intacct customer record ID","required":true,"group":"header"},
        {"key":"PAYMENTDATE","label":"Payment Date","description":"Date of payment (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"PAYMENTMETHOD","label":"Payment Method","description":"Method of payment (e.g. Printed Check)","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Payment currency (ISO 4217)","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"Payment reference number","required":false,"group":"header"},
        {"key":"AMOUNT","label":"Amount","description":"Payment amount","required":true,"group":"line"},
        {"key":"INVOICENO","label":"Invoice No","description":"Invoice number being paid","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- ap_payment
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'ap_payment', 'AP Payment', 'Accounts payable payments', true, true, 'APPAYMENT', 60,
    '{
      "fields": [
        {"key":"VENDORID","label":"Vendor ID","description":"Intacct vendor record ID","required":true,"group":"header"},
        {"key":"PAYMENTDATE","label":"Payment Date","description":"Date of payment (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"PAYMENTMETHOD","label":"Payment Method","description":"Method of payment","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Payment currency (ISO 4217)","required":false,"group":"header"},
        {"key":"REFERENCENO","label":"Reference No","description":"Payment reference number","required":false,"group":"header"},
        {"key":"AMOUNT","label":"Amount","description":"Payment amount","required":true,"group":"line"},
        {"key":"BILLNO","label":"Bill No","description":"Bill number being paid","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- timesheet
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'timesheet', 'Timesheet', 'Employee timesheets', true, true, 'TIMESHEET', 70,
    '{
      "fields": [
        {"key":"EMPLOYEEID","label":"Employee ID","description":"Intacct employee record ID","required":true,"group":"header"},
        {"key":"BEGINDATE","label":"Begin Date","description":"Timesheet start date (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"ENDDATE","label":"End Date","description":"Timesheet end date (MM/DD/YYYY)","required":true,"group":"header"},
        {"key":"DESCRIPTION","label":"Description","description":"Timesheet description","required":false,"group":"header"},
        {"key":"LINENO","label":"Line No","description":"Line number within the timesheet","required":false,"group":"line"},
        {"key":"HOURS","label":"Hours","description":"Number of hours for this line","required":true,"group":"line"},
        {"key":"TASKID","label":"Task ID","description":"Task dimension","required":false,"group":"line"},
        {"key":"TIMETYPE","label":"Time Type","description":"Time type (e.g. Regular, Overtime)","required":false,"group":"line"},
        {"key":"PROJECTID","label":"Project ID","description":"Project dimension","required":false,"group":"line"},
        {"key":"CUSTOMERID","label":"Customer ID","description":"Customer dimension","required":false,"group":"line"},
        {"key":"DEPARTMENTID","label":"Department ID","description":"Department dimension","required":false,"group":"line"},
        {"key":"LOCATIONID","label":"Location ID","description":"Location dimension","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- vendor
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'vendor', 'Vendor Import', 'Vendor master data', true, true, 'VENDOR', 80,
    '{
      "fields": [
        {"key":"VENDORID","label":"Vendor ID","description":"Unique Intacct vendor ID","required":true,"group":"header"},
        {"key":"NAME","label":"Name","description":"Vendor display name","required":true,"group":"header"},
        {"key":"STATUS","label":"Status","description":"active or inactive","required":false,"group":"header"},
        {"key":"EMAIL1","label":"Email","description":"Primary email address","required":false,"group":"header"},
        {"key":"PHONE1","label":"Phone","description":"Primary phone number","required":false,"group":"header"},
        {"key":"TERMNAME","label":"Payment Term","description":"Payment term name (e.g. Net 30)","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Default currency (ISO 4217)","required":false,"group":"header"},
        {"key":"TAXID","label":"Tax ID","description":"VAT / tax identification number","required":false,"group":"header"},
        {"key":"MAILADDRESS.ADDRESS1","label":"Address Line 1","description":"Street address line 1","required":false,"group":"line"},
        {"key":"MAILADDRESS.ADDRESS2","label":"Address Line 2","description":"Street address line 2","required":false,"group":"line"},
        {"key":"MAILADDRESS.CITY","label":"City","description":"City","required":false,"group":"line"},
        {"key":"MAILADDRESS.STATE","label":"State / County","description":"State or county","required":false,"group":"line"},
        {"key":"MAILADDRESS.ZIP","label":"Postcode / ZIP","description":"Postal code","required":false,"group":"line"},
        {"key":"MAILADDRESS.COUNTRY","label":"Country","description":"Country name","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

  -- customer
  INSERT INTO public.endpoint_object_types
    (connector_id, object_key, display_name, description, is_system, is_active, api_object_name, sort_order, field_schema)
  VALUES (_connector_id, 'customer', 'Customer Import', 'Customer master data', true, true, 'CUSTOMER', 90,
    '{
      "fields": [
        {"key":"CUSTOMERID","label":"Customer ID","description":"Unique Intacct customer ID","required":true,"group":"header"},
        {"key":"NAME","label":"Name","description":"Customer display name","required":true,"group":"header"},
        {"key":"STATUS","label":"Status","description":"active or inactive","required":false,"group":"header"},
        {"key":"EMAIL1","label":"Email","description":"Primary email address","required":false,"group":"header"},
        {"key":"PHONE1","label":"Phone","description":"Primary phone number","required":false,"group":"header"},
        {"key":"TERMNAME","label":"Payment Term","description":"Payment term name (e.g. Net 30)","required":false,"group":"header"},
        {"key":"CURRENCY","label":"Currency","description":"Default currency (ISO 4217)","required":false,"group":"header"},
        {"key":"TAXID","label":"Tax ID","description":"VAT / tax identification number","required":false,"group":"header"},
        {"key":"MAILADDRESS.ADDRESS1","label":"Address Line 1","description":"Street address line 1","required":false,"group":"line"},
        {"key":"MAILADDRESS.ADDRESS2","label":"Address Line 2","description":"Street address line 2","required":false,"group":"line"},
        {"key":"MAILADDRESS.CITY","label":"City","description":"City","required":false,"group":"line"},
        {"key":"MAILADDRESS.STATE","label":"State / County","description":"State or county","required":false,"group":"line"},
        {"key":"MAILADDRESS.ZIP","label":"Postcode / ZIP","description":"Postal code","required":false,"group":"line"},
        {"key":"MAILADDRESS.COUNTRY","label":"Country","description":"Country name","required":false,"group":"line"}
      ]
    }'::jsonb)
  ON CONFLICT (connector_id, object_key) DO NOTHING;

END $$;

-- ── Original CHECK constraint (for rollback reference) ───────────────────────
-- ALTER TABLE public.field_mappings
--   ADD CONSTRAINT field_mappings_transaction_type_check
--   CHECK (transaction_type IN (
--     'journal_entry','ar_invoice','ap_bill','expense_report',
--     'ar_payment','ap_payment','timesheet','vendor','customer'
--   ));
