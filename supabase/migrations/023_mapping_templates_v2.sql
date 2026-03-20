-- ============================================================
-- Migration 023: Upgrade system mapping templates to v2 pipeline syntax
--
-- Updates the 4 standard system templates to use ColumnMappingEntryV2
-- format (steps array, on_empty, default_value, notes) and sets
-- mapping_version = 2.
--
-- New in v2 system templates:
--   - All date fields: date_format step with locale=auto
--   - All amount fields: strip_currency → decimal pipeline
--   - TR_TYPE: tr_type step
--   - IDs: trim step
--   - on_empty = 'error' for required fields
--   - on_empty = 'null' for optional fields
--   - Descriptive notes per row
-- ============================================================

-- ─── Journal Entry ────────────────────────────────────────────────────────────

UPDATE public.field_mappings
SET
  mapping_version = 2,
  column_mappings = '[
    {
      "id":"t-je-1","source_column":"journal_symbol","target_field":"JOURNALID",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Journal symbol, e.g. GJ or AJ. Must match an existing Intacct journal symbol."
    },
    {
      "id":"t-je-2","source_column":"posting_date","target_field":"WHENCREATED",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Posting date. Accepts DD/MM/YYYY (UK), MM/DD/YYYY (US) or ISO YYYY-MM-DD."
    },
    {
      "id":"t-je-3","source_column":"description","target_field":"DESCRIPTION",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Journal entry description (optional)."
    },
    {
      "id":"t-je-4","source_column":"reference_no","target_field":"REFERENCENO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"External reference number (optional)."
    },
    {
      "id":"t-je-5","source_column":"gl_account","target_field":"GLACCOUNTNO",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"GL account number. Must exist in Intacct."
    },
    {
      "id":"t-je-6","source_column":"amount","target_field":"AMOUNT",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"strip_currency"},{"type":"decimal","precision":2}],
      "notes":"Transaction amount (absolute value). Removes £$€ symbols and commas, then parses to 2 decimal places."
    },
    {
      "id":"t-je-7","source_column":"debit_credit","target_field":"TR_TYPE",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"tr_type"}],
      "notes":"Debit or Credit indicator. Accepts: debit/DR/1 → 1, credit/CR/-1 → -1."
    },
    {
      "id":"t-je-8","source_column":"memo","target_field":"MEMO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Line-level memo (optional)."
    },
    {
      "id":"t-je-9","source_column":"location_id","target_field":"LOCATIONID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Location dimension (optional)."
    },
    {
      "id":"t-je-10","source_column":"department_id","target_field":"DEPARTMENTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Department dimension (optional)."
    },
    {
      "id":"t-je-11","source_column":"project_id","target_field":"PROJECTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Project dimension (optional)."
    },
    {
      "id":"t-je-12","source_column":"class_id","target_field":"CLASSID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Class dimension (optional)."
    }
  ]'::jsonb
WHERE id = '00000000-0000-0000-0001-000000000001';


-- ─── AR Invoice ───────────────────────────────────────────────────────────────

UPDATE public.field_mappings
SET
  mapping_version = 2,
  column_mappings = '[
    {
      "id":"t-ar-1","source_column":"customer_id","target_field":"CUSTOMERID",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Intacct customer ID. Must match an existing customer record."
    },
    {
      "id":"t-ar-2","source_column":"invoice_date","target_field":"WHENCREATED",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Invoice date. Accepts DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD."
    },
    {
      "id":"t-ar-3","source_column":"due_date","target_field":"WHENDUE",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Payment due date (optional)."
    },
    {
      "id":"t-ar-4","source_column":"payment_term","target_field":"TERMNAME",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Payment term name, e.g. Net 30 (optional)."
    },
    {
      "id":"t-ar-5","source_column":"description","target_field":"DESCRIPTION",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Invoice description (optional)."
    },
    {
      "id":"t-ar-6","source_column":"reference_no","target_field":"REFERENCENO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Invoice reference or PO number (optional)."
    },
    {
      "id":"t-ar-7","source_column":"currency","target_field":"CURRENCY",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"},{"type":"uppercase"}],
      "notes":"ISO 4217 currency code, e.g. GBP or USD (optional)."
    },
    {
      "id":"t-ar-8","source_column":"revenue_account","target_field":"GLACCOUNTNO",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Revenue GL account number."
    },
    {
      "id":"t-ar-9","source_column":"amount","target_field":"AMOUNT",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"strip_currency"},{"type":"decimal","precision":2}],
      "notes":"Invoice line amount. Strips currency symbols and parses to 2dp."
    },
    {
      "id":"t-ar-10","source_column":"line_memo","target_field":"MEMO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Line item description (optional)."
    },
    {
      "id":"t-ar-11","source_column":"location_id","target_field":"LOCATIONID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ar-12","source_column":"department_id","target_field":"DEPARTMENTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ar-13","source_column":"project_id","target_field":"PROJECTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ar-14","source_column":"class_id","target_field":"CLASSID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    }
  ]'::jsonb
WHERE id = '00000000-0000-0000-0002-000000000001';


-- ─── AP Bill ──────────────────────────────────────────────────────────────────

UPDATE public.field_mappings
SET
  mapping_version = 2,
  column_mappings = '[
    {
      "id":"t-ap-1","source_column":"vendor_id","target_field":"VENDORID",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Intacct vendor ID. Must match an existing vendor record."
    },
    {
      "id":"t-ap-2","source_column":"bill_date","target_field":"WHENPOSTED",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Bill posting date. Accepts DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD."
    },
    {
      "id":"t-ap-3","source_column":"due_date","target_field":"WHENDUE",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Payment due date (optional)."
    },
    {
      "id":"t-ap-4","source_column":"payment_term","target_field":"TERMNAME",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-5","source_column":"description","target_field":"DESCRIPTION",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-6","source_column":"reference_no","target_field":"REFERENCENO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}],
      "notes":"Vendor invoice number or bill reference (optional)."
    },
    {
      "id":"t-ap-7","source_column":"currency","target_field":"CURRENCY",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"},{"type":"uppercase"}],
      "notes":"ISO 4217 currency code (optional)."
    },
    {
      "id":"t-ap-8","source_column":"expense_account","target_field":"GLACCOUNTNO",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Expense GL account number."
    },
    {
      "id":"t-ap-9","source_column":"amount","target_field":"AMOUNT",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"strip_currency"},{"type":"decimal","precision":2}],
      "notes":"Bill amount. Strips currency symbols and parses to 2dp."
    },
    {
      "id":"t-ap-10","source_column":"line_memo","target_field":"MEMO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-11","source_column":"location_id","target_field":"LOCATIONID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-12","source_column":"department_id","target_field":"DEPARTMENTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-13","source_column":"project_id","target_field":"PROJECTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-ap-14","source_column":"class_id","target_field":"CLASSID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    }
  ]'::jsonb
WHERE id = '00000000-0000-0000-0003-000000000001';


-- ─── Expense Report ───────────────────────────────────────────────────────────

UPDATE public.field_mappings
SET
  mapping_version = 2,
  column_mappings = '[
    {
      "id":"t-er-1","source_column":"employee_id","target_field":"EMPLOYEEID",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Intacct employee ID. Must match an existing employee record."
    },
    {
      "id":"t-er-2","source_column":"report_date","target_field":"WHENCREATED",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Report date. Accepts DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD."
    },
    {
      "id":"t-er-3","source_column":"description","target_field":"DESCRIPTION",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-4","source_column":"reference_no","target_field":"REFERENCENO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-5","source_column":"currency","target_field":"CURRENCY",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"},{"type":"uppercase"}],
      "notes":"ISO 4217 currency code (optional)."
    },
    {
      "id":"t-er-6","source_column":"expense_type","target_field":"EXPENSE_TYPE",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"trim"}],
      "notes":"Expense type / category. Must match an existing expense type in Intacct."
    },
    {
      "id":"t-er-7","source_column":"amount","target_field":"AMOUNT",
      "required":true,"transform":"none","on_empty":"error",
      "steps":[{"type":"strip_currency"},{"type":"decimal","precision":2}],
      "notes":"Expense amount. Strips currency symbols and parses to 2dp."
    },
    {
      "id":"t-er-8","source_column":"expense_date","target_field":"EXPENSEDATE",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"date_format","locale":"auto"}],
      "notes":"Date the expense was incurred (optional, defaults to report date)."
    },
    {
      "id":"t-er-9","source_column":"memo","target_field":"MEMO",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-10","source_column":"location_id","target_field":"LOCATIONID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-11","source_column":"department_id","target_field":"DEPARTMENTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-12","source_column":"project_id","target_field":"PROJECTID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    },
    {
      "id":"t-er-13","source_column":"class_id","target_field":"CLASSID",
      "required":false,"transform":"none","on_empty":"null",
      "steps":[{"type":"trim"}]
    }
  ]'::jsonb
WHERE id = '00000000-0000-0000-0004-000000000001';
