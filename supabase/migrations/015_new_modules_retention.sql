-- Migration 015: New modules (Timesheet, Vendor, Customer) + data retention

-- ── Data retention column ─────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS file_retention_days INTEGER NOT NULL DEFAULT 90;

-- ── Track file deletion on jobs ───────────────────────────────────────────────
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS file_deleted_at TIMESTAMPTZ;

-- ── System template: Timesheet ────────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0008-000000000001',
  NULL,
  'Timesheet',
  'Standard template for Sage Intacct Timesheet (TIMESHEET) imports. Each row creates one timesheet with one entry. Supports UK and US date formats.',
  'timesheet',
  false,
  true,
  '[
    {"id":"t-ts-1",  "source_column":"employee_id",    "target_field":"EMPLOYEEID",   "transform":"trim",        "required":true},
    {"id":"t-ts-2",  "source_column":"week_start_date","target_field":"BEGINDATE",    "transform":"date_format", "required":true},
    {"id":"t-ts-3",  "source_column":"description",    "target_field":"DESCRIPTION",  "transform":"trim",        "required":false},
    {"id":"t-ts-4",  "source_column":"project_id",     "target_field":"PROJECTID",    "transform":"trim",        "required":false},
    {"id":"t-ts-5",  "source_column":"task_id",        "target_field":"TASKKEY",      "transform":"trim",        "required":false},
    {"id":"t-ts-6",  "source_column":"time_type",      "target_field":"TIMETYPE",     "transform":"trim",        "required":false},
    {"id":"t-ts-7",  "source_column":"hours",          "target_field":"QTY",          "transform":"decimal",     "required":true},
    {"id":"t-ts-8",  "source_column":"memo",           "target_field":"MEMO",         "transform":"trim",        "required":false},
    {"id":"t-ts-9",  "source_column":"location_id",    "target_field":"LOCATIONID",   "transform":"trim",        "required":false},
    {"id":"t-ts-10", "source_column":"department_id",  "target_field":"DEPARTMENTID", "transform":"trim",        "required":false},
    {"id":"t-ts-11", "source_column":"class_id",       "target_field":"CLASSID",      "transform":"trim",        "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  column_mappings = EXCLUDED.column_mappings;

-- ── System template: Vendor Import ────────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-0009-000000000001',
  NULL,
  'Vendor Import',
  'Standard template for importing vendors into Sage Intacct (VENDOR). Each row creates or updates one vendor record.',
  'vendor',
  false,
  true,
  '[
    {"id":"t-v-1",  "source_column":"vendor_id",      "target_field":"VENDORID",     "transform":"trim",    "required":true},
    {"id":"t-v-2",  "source_column":"vendor_name",    "target_field":"NAME",         "transform":"trim",    "required":true},
    {"id":"t-v-3",  "source_column":"email",          "target_field":"EMAIL1",       "transform":"trim",    "required":false},
    {"id":"t-v-4",  "source_column":"phone",          "target_field":"PHONE1",       "transform":"trim",    "required":false},
    {"id":"t-v-5",  "source_column":"currency",       "target_field":"CURRENCY",     "transform":"trim",    "required":false},
    {"id":"t-v-6",  "source_column":"payment_method", "target_field":"PAYMENTMETHOD","transform":"trim",    "required":false},
    {"id":"t-v-7",  "source_column":"tax_id",         "target_field":"TAXID",        "transform":"trim",    "required":false},
    {"id":"t-v-8",  "source_column":"address_line1",  "target_field":"ADDRESS1",     "transform":"trim",    "required":false},
    {"id":"t-v-9",  "source_column":"address_line2",  "target_field":"ADDRESS2",     "transform":"trim",    "required":false},
    {"id":"t-v-10", "source_column":"city",           "target_field":"CITY",         "transform":"trim",    "required":false},
    {"id":"t-v-11", "source_column":"state",          "target_field":"STATE",        "transform":"trim",    "required":false},
    {"id":"t-v-12", "source_column":"zip",            "target_field":"ZIP",          "transform":"trim",    "required":false},
    {"id":"t-v-13", "source_column":"country",        "target_field":"COUNTRY",      "transform":"trim",    "required":false},
    {"id":"t-v-14", "source_column":"notes",          "target_field":"NOTES",        "transform":"trim",    "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  column_mappings = EXCLUDED.column_mappings;

-- ── System template: Customer Import ─────────────────────────────────────────
INSERT INTO public.field_mappings (id, tenant_id, name, description, transaction_type, is_default, is_template, column_mappings)
VALUES (
  '00000000-0000-0000-000a-000000000001',
  NULL,
  'Customer Import',
  'Standard template for importing customers into Sage Intacct (CUSTOMER). Each row creates or updates one customer record.',
  'customer',
  false,
  true,
  '[
    {"id":"t-c-1",  "source_column":"customer_id",   "target_field":"CUSTOMERID",  "transform":"trim",    "required":true},
    {"id":"t-c-2",  "source_column":"customer_name", "target_field":"NAME",        "transform":"trim",    "required":true},
    {"id":"t-c-3",  "source_column":"email",         "target_field":"EMAIL1",      "transform":"trim",    "required":false},
    {"id":"t-c-4",  "source_column":"phone",         "target_field":"PHONE1",      "transform":"trim",    "required":false},
    {"id":"t-c-5",  "source_column":"currency",      "target_field":"CURRENCY",    "transform":"trim",    "required":false},
    {"id":"t-c-6",  "source_column":"credit_limit",  "target_field":"CREDITLIMIT", "transform":"decimal", "required":false},
    {"id":"t-c-7",  "source_column":"payment_term",  "target_field":"TERMNAME",    "transform":"trim",    "required":false},
    {"id":"t-c-8",  "source_column":"tax_id",        "target_field":"TAXID",       "transform":"trim",    "required":false},
    {"id":"t-c-9",  "source_column":"address_line1", "target_field":"ADDRESS1",    "transform":"trim",    "required":false},
    {"id":"t-c-10", "source_column":"city",          "target_field":"CITY",        "transform":"trim",    "required":false},
    {"id":"t-c-11", "source_column":"state",         "target_field":"STATE",       "transform":"trim",    "required":false},
    {"id":"t-c-12", "source_column":"zip",           "target_field":"ZIP",         "transform":"trim",    "required":false},
    {"id":"t-c-13", "source_column":"country",       "target_field":"COUNTRY",     "transform":"trim",    "required":false},
    {"id":"t-c-14", "source_column":"notes",         "target_field":"NOTES",       "transform":"trim",    "required":false}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  column_mappings = EXCLUDED.column_mappings;
