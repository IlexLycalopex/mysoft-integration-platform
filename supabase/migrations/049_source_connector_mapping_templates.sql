-- Migration 049: Source connector field mapping templates
--
-- Creates published system mapping templates for every source→target combination
-- across the three source connectors (Xero, QuickBooks Online, Sage 50cloud)
-- and two target systems (Sage Intacct, Sage X3).
--
-- These are starting-point templates. Tenants clone and adjust them for their
-- specific chart-of-accounts, customer/vendor codes, etc.
--
-- Source connector fields are from the normalised NormalizedRecord.fields output
-- of each source connector (see lib/connectors/*/field-definitions.ts).
--
-- Template UUID scheme: 00000000-0000-0049-{NNNN}-000000000001
--   NNNN = 4-digit template sequence within this migration.
--
-- connector_id in field_mappings refers to the TARGET connector.
-- The source connector is identified by the template name and source_column values.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: XERO → SAGE INTACCT (5 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1  Xero Sales Invoice → Intacct AR Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0001-000000000001',
  NULL,
  'Xero → Intacct: AR Invoice',
  'Maps Xero ACCREC invoice line-level data to Sage Intacct AR Invoice (ARINVOICE). '
    'contact_name is used as CUSTOMERID — ensure customer records match. '
    'line_account_code maps to the revenue GL account.',
  'ar_invoice',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xi-ar-01","source_column":"contact_name","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"xi-ar-02","source_column":"date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"xi-ar-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"xi-ar-04","source_column":"invoice_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"xi-ar-05","source_column":"reference","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"xi-ar-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"xi-ar-07","source_column":"line_account_code","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"xi-ar-08","source_column":"line_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"xi-ar-09","source_column":"line_description","target_field":"MEMO","transform":"none","required":false},
    {"id":"xi-ar-10","source_column":"line_tracking_name","target_field":"DEPARTMENTID","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ar_invoice'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 1.2  Xero Purchase Bill → Intacct AP Bill
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0002-000000000001',
  NULL,
  'Xero → Intacct: AP Bill',
  'Maps Xero ACCPAY bill line-level data to Sage Intacct AP Bill (APBILL). '
    'contact_name is used as VENDORID — ensure vendor records match.',
  'ap_bill',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xb-ap-01","source_column":"contact_name","target_field":"VENDORID","transform":"none","required":true},
    {"id":"xb-ap-02","source_column":"date","target_field":"WHENPOSTED","transform":"date_format","required":true},
    {"id":"xb-ap-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"xb-ap-04","source_column":"invoice_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"xb-ap-05","source_column":"reference","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"xb-ap-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"xb-ap-07","source_column":"line_account_code","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"xb-ap-08","source_column":"line_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"xb-ap-09","source_column":"line_description","target_field":"MEMO","transform":"none","required":false},
    {"id":"xb-ap-10","source_column":"line_tracking_name","target_field":"DEPARTMENTID","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ap_bill'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 1.3  Xero Journal → Intacct Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0003-000000000001',
  NULL,
  'Xero → Intacct: Journal Entry',
  'Maps Xero manual journal lines to Sage Intacct Journal Entry (GLBATCH). '
    'line_net_amount holds the signed value — positive = debit, negative = credit. '
    'JOURNALID must be added manually or via a static default value.',
  'journal_entry',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xj-je-01","source_column":"date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"xj-je-02","source_column":"narration","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"xj-je-03","source_column":"journal_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"xj-je-04","source_column":"line_account_code","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"xj-je-05","source_column":"line_net_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"xj-je-06","source_column":"line_description","target_field":"MEMO","transform":"none","required":false},
    {"id":"xj-je-07","source_column":"line_tracking_name","target_field":"DEPARTMENTID","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'journal_entry'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 1.4  Xero Contact → Intacct Customer
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0004-000000000001',
  NULL,
  'Xero → Intacct: Customer',
  'Maps Xero contact (is_customer=true) to Sage Intacct Customer record. '
    'account_number maps to CUSTOMERID — if blank, use contact_id as a fallback.',
  'customer',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xc-cu-01","source_column":"account_number","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"xc-cu-02","source_column":"name","target_field":"NAME","transform":"none","required":true},
    {"id":"xc-cu-03","source_column":"email","target_field":"EMAIL1","transform":"none","required":false},
    {"id":"xc-cu-04","source_column":"phone","target_field":"PHONE1","transform":"none","required":false},
    {"id":"xc-cu-05","source_column":"tax_number","target_field":"TAXID","transform":"none","required":false},
    {"id":"xc-cu-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"xc-cu-07","source_column":"address_line1","target_field":"MAILADDRESS.ADDRESS1","transform":"none","required":false},
    {"id":"xc-cu-08","source_column":"address_line2","target_field":"MAILADDRESS.ADDRESS2","transform":"none","required":false},
    {"id":"xc-cu-09","source_column":"city","target_field":"MAILADDRESS.CITY","transform":"none","required":false},
    {"id":"xc-cu-10","source_column":"region","target_field":"MAILADDRESS.STATE","transform":"none","required":false},
    {"id":"xc-cu-11","source_column":"postal_code","target_field":"MAILADDRESS.ZIP","transform":"none","required":false},
    {"id":"xc-cu-12","source_column":"country","target_field":"MAILADDRESS.COUNTRY","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'customer'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 1.5  Xero Payment → Intacct AR Payment
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0005-000000000001',
  NULL,
  'Xero → Intacct: AR Payment',
  'Maps Xero payment (RECEIVE type) to Sage Intacct AR Payment (ARPAYMENT). '
    'contact_name maps to CUSTOMERID. invoice_number links the payment to an open invoice.',
  'ar_payment',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xp-arp-01","source_column":"contact_name","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"xp-arp-02","source_column":"payment_date","target_field":"PAYMENTDATE","transform":"date_format","required":true},
    {"id":"xp-arp-03","source_column":"amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"xp-arp-04","source_column":"invoice_number","target_field":"INVOICENO","transform":"none","required":false},
    {"id":"xp-arp-05","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"xp-arp-06","source_column":"reference","target_field":"REFERENCENO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ar_payment'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: QUICKBOOKS ONLINE → SAGE INTACCT (5 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1  QBO Invoice → Intacct AR Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0006-000000000001',
  NULL,
  'QuickBooks → Intacct: AR Invoice',
  'Maps QuickBooks Online invoice line data to Sage Intacct AR Invoice. '
    'customer_name maps to CUSTOMERID — ensure customer codes match between systems. '
    'line_account_ref is the QBO account reference code; review against Intacct chart of accounts.',
  'ar_invoice',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qi-ar-01","source_column":"customer_name","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"qi-ar-02","source_column":"txn_date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"qi-ar-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"qi-ar-04","source_column":"doc_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"qi-ar-05","source_column":"private_note","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"qi-ar-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"qi-ar-07","source_column":"line_account_ref","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"qi-ar-08","source_column":"line_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"qi-ar-09","source_column":"line_description","target_field":"MEMO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ar_invoice'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 2.2  QBO Bill → Intacct AP Bill
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0007-000000000001',
  NULL,
  'QuickBooks → Intacct: AP Bill',
  'Maps QuickBooks Online bill line data to Sage Intacct AP Bill. '
    'vendor_name maps to VENDORID — ensure vendor codes match.',
  'ap_bill',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qb-ap-01","source_column":"vendor_name","target_field":"VENDORID","transform":"none","required":true},
    {"id":"qb-ap-02","source_column":"txn_date","target_field":"WHENPOSTED","transform":"date_format","required":true},
    {"id":"qb-ap-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"qb-ap-04","source_column":"doc_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"qb-ap-05","source_column":"private_note","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"qb-ap-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"qb-ap-07","source_column":"line_account_ref","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"qb-ap-08","source_column":"line_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"qb-ap-09","source_column":"line_description","target_field":"MEMO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ap_bill'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 2.3  QBO Journal Entry → Intacct Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0008-000000000001',
  NULL,
  'QuickBooks → Intacct: Journal Entry',
  'Maps QuickBooks Online journal entry lines to Sage Intacct Journal Entry. '
    'line_amount is the signed amount (positive = debit per QBO line_posting_type). '
    'JOURNALID must be added manually — QBO does not have an equivalent journal symbol.',
  'journal_entry',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qj-je-01","source_column":"txn_date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"qj-je-02","source_column":"narration","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"qj-je-03","source_column":"doc_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"qj-je-04","source_column":"line_account_ref","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"qj-je-05","source_column":"line_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"qj-je-06","source_column":"line_description","target_field":"MEMO","transform":"none","required":false},
    {"id":"qj-je-07","source_column":"line_entity_name","target_field":"CUSTOMERID","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'journal_entry'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 2.4  QBO Customer → Intacct Customer
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0009-000000000001',
  NULL,
  'QuickBooks → Intacct: Customer',
  'Maps QuickBooks Online customer to Sage Intacct Customer record. '
    'customer_name is used for both CUSTOMERID and NAME — clone and replace CUSTOMERID '
    'with a shorter code if your Intacct naming convention requires it.',
  'customer',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qc-cu-01","source_column":"customer_name","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"qc-cu-02","source_column":"customer_name","target_field":"NAME","transform":"none","required":true},
    {"id":"qc-cu-03","source_column":"email","target_field":"EMAIL1","transform":"none","required":false},
    {"id":"qc-cu-04","source_column":"phone","target_field":"PHONE1","transform":"none","required":false},
    {"id":"qc-cu-05","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"qc-cu-06","source_column":"bill_addr_line1","target_field":"MAILADDRESS.ADDRESS1","transform":"none","required":false},
    {"id":"qc-cu-07","source_column":"bill_addr_city","target_field":"MAILADDRESS.CITY","transform":"none","required":false},
    {"id":"qc-cu-08","source_column":"bill_addr_postal_code","target_field":"MAILADDRESS.ZIP","transform":"none","required":false},
    {"id":"qc-cu-09","source_column":"bill_addr_country","target_field":"MAILADDRESS.COUNTRY","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'customer'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 2.5  QBO Vendor → Intacct Vendor
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0010-000000000001',
  NULL,
  'QuickBooks → Intacct: Vendor',
  'Maps QuickBooks Online vendor to Sage Intacct Vendor record. '
    'acct_num maps to VENDORID — if blank, map display_name instead and adjust manually.',
  'vendor',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qv-ve-01","source_column":"acct_num","target_field":"VENDORID","transform":"none","required":true},
    {"id":"qv-ve-02","source_column":"display_name","target_field":"NAME","transform":"none","required":true},
    {"id":"qv-ve-03","source_column":"email","target_field":"EMAIL1","transform":"none","required":false},
    {"id":"qv-ve-04","source_column":"phone","target_field":"PHONE1","transform":"none","required":false},
    {"id":"qv-ve-05","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"qv-ve-06","source_column":"bill_addr_line1","target_field":"MAILADDRESS.ADDRESS1","transform":"none","required":false},
    {"id":"qv-ve-07","source_column":"bill_addr_city","target_field":"MAILADDRESS.CITY","transform":"none","required":false},
    {"id":"qv-ve-08","source_column":"bill_addr_postal_code","target_field":"MAILADDRESS.ZIP","transform":"none","required":false},
    {"id":"qv-ve-09","source_column":"bill_addr_country","target_field":"MAILADDRESS.COUNTRY","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'vendor'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: SAGE 50CLOUD → SAGE INTACCT (4 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1  Sage 50 Sales Invoice → Intacct AR Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0011-000000000001',
  NULL,
  'Sage 50cloud → Intacct: AR Invoice',
  'Maps Sage 50cloud sales invoice lines to Sage Intacct AR Invoice. '
    'contact_name maps to CUSTOMERID. line_ledger_account maps to the revenue GL account code.',
  'ar_invoice',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5i-ar-01","source_column":"contact_name","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"s5i-ar-02","source_column":"date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"s5i-ar-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"s5i-ar-04","source_column":"invoice_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"s5i-ar-05","source_column":"notes","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"s5i-ar-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"s5i-ar-07","source_column":"line_ledger_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"s5i-ar-08","source_column":"line_net_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"s5i-ar-09","source_column":"line_description","target_field":"MEMO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ar_invoice'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 3.2  Sage 50 Purchase Invoice → Intacct AP Bill
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0012-000000000001',
  NULL,
  'Sage 50cloud → Intacct: AP Bill',
  'Maps Sage 50cloud purchase invoice lines to Sage Intacct AP Bill. '
    'contact_name maps to VENDORID. line_ledger_account maps to the expense GL account.',
  'ap_bill',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5p-ap-01","source_column":"contact_name","target_field":"VENDORID","transform":"none","required":true},
    {"id":"s5p-ap-02","source_column":"date","target_field":"WHENPOSTED","transform":"date_format","required":true},
    {"id":"s5p-ap-03","source_column":"due_date","target_field":"WHENDUE","transform":"date_format","required":false},
    {"id":"s5p-ap-04","source_column":"invoice_number","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"s5p-ap-05","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"s5p-ap-06","source_column":"line_ledger_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"s5p-ap-07","source_column":"line_net_amount","target_field":"AMOUNT","transform":"decimal","required":true},
    {"id":"s5p-ap-08","source_column":"line_description","target_field":"MEMO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'ap_bill'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 3.3  Sage 50 Journal → Intacct Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0013-000000000001',
  NULL,
  'Sage 50cloud → Intacct: Journal Entry',
  'Maps Sage 50cloud journal lines to Sage Intacct Journal Entry. '
    'journal_code maps to JOURNALID. line_debit carries the debit amount; '
    'for credit lines use line_credit instead — clone one mapping per debit/credit direction.',
  'journal_entry',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5j-je-01","source_column":"journal_code","target_field":"JOURNALID","transform":"none","required":true},
    {"id":"s5j-je-02","source_column":"date","target_field":"WHENCREATED","transform":"date_format","required":true},
    {"id":"s5j-je-03","source_column":"description","target_field":"DESCRIPTION","transform":"none","required":false},
    {"id":"s5j-je-04","source_column":"reference","target_field":"REFERENCENO","transform":"none","required":false},
    {"id":"s5j-je-05","source_column":"line_ledger_account","target_field":"GLACCOUNTNO","transform":"none","required":true},
    {"id":"s5j-je-06","source_column":"line_debit","target_field":"AMOUNT","transform":"decimal","required":false},
    {"id":"s5j-je-07","source_column":"line_description","target_field":"MEMO","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'journal_entry'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- 3.4  Sage 50 Contact → Intacct Customer
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0014-000000000001',
  NULL,
  'Sage 50cloud → Intacct: Customer',
  'Maps Sage 50cloud contact (customer type) to Sage Intacct Customer record. '
    'reference maps to CUSTOMERID. For supplier contacts use the Vendor template instead.',
  'customer',
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5c-cu-01","source_column":"reference","target_field":"CUSTOMERID","transform":"none","required":true},
    {"id":"s5c-cu-02","source_column":"name","target_field":"NAME","transform":"none","required":true},
    {"id":"s5c-cu-03","source_column":"email","target_field":"EMAIL1","transform":"none","required":false},
    {"id":"s5c-cu-04","source_column":"phone","target_field":"PHONE1","transform":"none","required":false},
    {"id":"s5c-cu-05","source_column":"tax_number","target_field":"TAXID","transform":"none","required":false},
    {"id":"s5c-cu-06","source_column":"currency_code","target_field":"CURRENCY","transform":"none","required":false},
    {"id":"s5c-cu-07","source_column":"address_line_1","target_field":"MAILADDRESS.ADDRESS1","transform":"none","required":false},
    {"id":"s5c-cu-08","source_column":"address_line_2","target_field":"MAILADDRESS.ADDRESS2","transform":"none","required":false},
    {"id":"s5c-cu-09","source_column":"city","target_field":"MAILADDRESS.CITY","transform":"none","required":false},
    {"id":"s5c-cu-10","source_column":"region","target_field":"MAILADDRESS.STATE","transform":"none","required":false},
    {"id":"s5c-cu-11","source_column":"postal_code","target_field":"MAILADDRESS.ZIP","transform":"none","required":false},
    {"id":"s5c-cu-12","source_column":"country","target_field":"MAILADDRESS.COUNTRY","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'customer'
WHERE ec.connector_key = 'intacct'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: XERO → SAGE X3 (4 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1  Xero Sales Invoice → X3 Sales Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0015-000000000001',
  NULL,
  'Xero → Sage X3: Sales Invoice',
  'Maps Xero ACCREC invoice lines to Sage X3 SINVOICE. '
    'contact_name maps to customer_code — must match an existing BPC in X3. '
    'invoice_type is pre-filled as INV; for credit notes map type field or use a static CRN value. '
    'line_item_code must be a valid X3 ITMREF — ensure items exist in X3 first.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xi-x3si-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"xi-x3si-01","source_column":"contact_name","target_field":"customer_code","transform":"none","required":true},
    {"id":"xi-x3si-02","source_column":"date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"xi-x3si-03","source_column":"invoice_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"xi-x3si-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"xi-x3si-05","source_column":"line_item_code","target_field":"item_code","transform":"none","required":true},
    {"id":"xi-x3si-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"xi-x3si-07","source_column":"line_quantity","target_field":"quantity","transform":"decimal","required":true},
    {"id":"xi-x3si-08","source_column":"line_unit_amount","target_field":"unit_price","transform":"decimal","required":true},
    {"id":"xi-x3si-09","source_column":"line_tax_type","target_field":"vat_code","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_sinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 4.2  Xero Purchase Bill → X3 Purchase Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0016-000000000001',
  NULL,
  'Xero → Sage X3: Purchase Invoice',
  'Maps Xero ACCPAY bill lines to Sage X3 PINVOICE. '
    'contact_name maps to supplier_code — must match an existing BPS in X3. '
    'line_item_code must be a valid X3 ITMREF.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xb-x3pi-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"xb-x3pi-01","source_column":"contact_name","target_field":"supplier_code","transform":"none","required":true},
    {"id":"xb-x3pi-02","source_column":"date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"xb-x3pi-03","source_column":"invoice_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"xb-x3pi-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"xb-x3pi-05","source_column":"line_item_code","target_field":"item_code","transform":"none","required":true},
    {"id":"xb-x3pi-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"xb-x3pi-07","source_column":"line_quantity","target_field":"quantity","transform":"decimal","required":true},
    {"id":"xb-x3pi-08","source_column":"line_unit_amount","target_field":"unit_price","transform":"decimal","required":true},
    {"id":"xb-x3pi-09","source_column":"line_tax_type","target_field":"vat_code","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_pinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 4.3  Xero Journal → X3 GL Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0017-000000000001',
  NULL,
  'Xero → Sage X3: GL Journal Entry',
  'Maps Xero manual journal lines to Sage X3 GACCENTRY. '
    'journal_code (JOUENTRY) and debit_credit (SID) are required by X3 but have no direct Xero equivalent — '
    'add static default values for both fields after cloning this template. '
    'line_net_amount is signed: use absolute value for amount and derive debit/credit from sign.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xj-x3gl-01","source_column":"date","target_field":"accounting_date","transform":"date_format","required":true},
    {"id":"xj-x3gl-02","source_column":"narration","target_field":"description","transform":"none","required":false},
    {"id":"xj-x3gl-03","source_column":"reference","target_field":"line_description","transform":"none","required":false},
    {"id":"xj-x3gl-04","source_column":"line_account_code","target_field":"gl_account","transform":"none","required":true},
    {"id":"xj-x3gl-05","source_column":"line_net_amount","target_field":"amount","transform":"decimal","required":true},
    {"id":"xj-x3gl-06","source_column":"line_description","target_field":"line_description","transform":"none","required":false},
    {"id":"xj-x3gl-07","source_column":"line_tracking_name","target_field":"cost_center","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_gaccentry'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 4.4  Xero Contact → X3 Customer (BPC)
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0018-000000000001',
  NULL,
  'Xero → Sage X3: Customer (BPC)',
  'Maps Xero contact (is_customer=true) to Sage X3 BPCUSTOMER. '
    'account_number maps to customer_code — if blank, substitute contact_id. '
    'For supplier contacts use the Sage X3 Supplier (BPS) template.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"xc-x3cu-01","source_column":"account_number","target_field":"customer_code","transform":"none","required":true},
    {"id":"xc-x3cu-02","source_column":"name","target_field":"customer_name","transform":"none","required":true},
    {"id":"xc-x3cu-03","source_column":"tax_number","target_field":"tax_reg_number","transform":"none","required":false},
    {"id":"xc-x3cu-04","source_column":"email","target_field":"email","transform":"none","required":false},
    {"id":"xc-x3cu-05","source_column":"phone","target_field":"phone","transform":"none","required":false},
    {"id":"xc-x3cu-06","source_column":"address_line1","target_field":"address_line1","transform":"none","required":false},
    {"id":"xc-x3cu-07","source_column":"address_line2","target_field":"address_line2","transform":"none","required":false},
    {"id":"xc-x3cu-08","source_column":"city","target_field":"city","transform":"none","required":false},
    {"id":"xc-x3cu-09","source_column":"postal_code","target_field":"postal_code","transform":"none","required":false},
    {"id":"xc-x3cu-10","source_column":"country","target_field":"country","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_bpcustomer'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: QUICKBOOKS ONLINE → SAGE X3 (3 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1  QBO Invoice → X3 Sales Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0019-000000000001',
  NULL,
  'QuickBooks → Sage X3: Sales Invoice',
  'Maps QuickBooks Online invoice lines to Sage X3 SINVOICE. '
    'customer_name maps to customer_code — must match an existing BPC in X3. '
    'line_item_ref is the QBO item reference; ensure items exist in X3 ITMMASTER.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qi-x3si-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"qi-x3si-01","source_column":"customer_name","target_field":"customer_code","transform":"none","required":true},
    {"id":"qi-x3si-02","source_column":"txn_date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"qi-x3si-03","source_column":"doc_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"qi-x3si-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"qi-x3si-05","source_column":"line_item_ref","target_field":"item_code","transform":"none","required":true},
    {"id":"qi-x3si-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"qi-x3si-07","source_column":"line_qty","target_field":"quantity","transform":"decimal","required":true},
    {"id":"qi-x3si-08","source_column":"line_unit_price","target_field":"unit_price","transform":"decimal","required":true},
    {"id":"qi-x3si-09","source_column":"line_tax_code","target_field":"vat_code","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_sinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 5.2  QBO Bill → X3 Purchase Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0020-000000000001',
  NULL,
  'QuickBooks → Sage X3: Purchase Invoice',
  'Maps QuickBooks Online bill lines to Sage X3 PINVOICE. '
    'vendor_name maps to supplier_code — must match an existing BPS in X3.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qb-x3pi-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"qb-x3pi-01","source_column":"vendor_name","target_field":"supplier_code","transform":"none","required":true},
    {"id":"qb-x3pi-02","source_column":"txn_date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"qb-x3pi-03","source_column":"doc_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"qb-x3pi-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"qb-x3pi-05","source_column":"line_item_ref","target_field":"item_code","transform":"none","required":true},
    {"id":"qb-x3pi-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"qb-x3pi-07","source_column":"line_amount","target_field":"unit_price","transform":"decimal","required":true}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_pinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 5.3  QBO Journal Entry → X3 GL Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0021-000000000001',
  NULL,
  'QuickBooks → Sage X3: GL Journal Entry',
  'Maps QuickBooks Online journal entry lines to Sage X3 GACCENTRY. '
    'journal_code (JOUENTRY) and debit_credit (SID) have no QBO equivalent — '
    'add static defaults after cloning. line_posting_type (Debit/Credit) can be mapped to debit_credit.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"qj-x3gl-01","source_column":"txn_date","target_field":"accounting_date","transform":"date_format","required":true},
    {"id":"qj-x3gl-02","source_column":"narration","target_field":"description","transform":"none","required":false},
    {"id":"qj-x3gl-03","source_column":"line_account_ref","target_field":"gl_account","transform":"none","required":true},
    {"id":"qj-x3gl-04","source_column":"line_amount","target_field":"amount","transform":"decimal","required":true},
    {"id":"qj-x3gl-05","source_column":"line_posting_type","target_field":"debit_credit","transform":"none","required":true},
    {"id":"qj-x3gl-06","source_column":"line_description","target_field":"line_description","transform":"none","required":false},
    {"id":"qj-x3gl-07","source_column":"doc_number","target_field":"line_description","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_gaccentry'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: SAGE 50CLOUD → SAGE X3 (4 templates)
-- ─────────────────────────────────────────────────────────────────────────────

-- 6.1  Sage 50 Sales Invoice → X3 Sales Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0022-000000000001',
  NULL,
  'Sage 50cloud → Sage X3: Sales Invoice',
  'Maps Sage 50cloud sales invoice lines to Sage X3 SINVOICE. '
    'contact_name maps to customer_code. '
    'line_ledger_account maps to item_code — review this mapping as ledger codes and '
    'item references rarely match directly between Sage 50 and X3.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5i-x3si-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"s5i-x3si-01","source_column":"contact_name","target_field":"customer_code","transform":"none","required":true},
    {"id":"s5i-x3si-02","source_column":"date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"s5i-x3si-03","source_column":"invoice_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"s5i-x3si-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"s5i-x3si-05","source_column":"line_ledger_account","target_field":"item_code","transform":"none","required":true},
    {"id":"s5i-x3si-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"s5i-x3si-07","source_column":"line_quantity","target_field":"quantity","transform":"decimal","required":true},
    {"id":"s5i-x3si-08","source_column":"line_unit_price","target_field":"unit_price","transform":"decimal","required":true},
    {"id":"s5i-x3si-09","source_column":"line_tax_code","target_field":"vat_code","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_sinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 6.2  Sage 50 Purchase Invoice → X3 Purchase Invoice
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0023-000000000001',
  NULL,
  'Sage 50cloud → Sage X3: Purchase Invoice',
  'Maps Sage 50cloud purchase invoice lines to Sage X3 PINVOICE. '
    'contact_name maps to supplier_code — must match an existing BPS in X3.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5p-x3pi-00","source_column":"","target_field":"invoice_type","transform":"none","required":true,"default_value":"INV"},
    {"id":"s5p-x3pi-01","source_column":"contact_name","target_field":"supplier_code","transform":"none","required":true},
    {"id":"s5p-x3pi-02","source_column":"date","target_field":"invoice_date","transform":"date_format","required":true},
    {"id":"s5p-x3pi-03","source_column":"invoice_number","target_field":"invoice_number","transform":"none","required":false},
    {"id":"s5p-x3pi-04","source_column":"currency_code","target_field":"currency","transform":"none","required":false},
    {"id":"s5p-x3pi-05","source_column":"line_ledger_account","target_field":"item_code","transform":"none","required":true},
    {"id":"s5p-x3pi-06","source_column":"line_description","target_field":"item_description","transform":"none","required":false},
    {"id":"s5p-x3pi-07","source_column":"line_quantity","target_field":"quantity","transform":"decimal","required":true},
    {"id":"s5p-x3pi-08","source_column":"line_unit_price","target_field":"unit_price","transform":"decimal","required":true},
    {"id":"s5p-x3pi-09","source_column":"line_tax_code","target_field":"vat_code","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_pinvoice'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 6.3  Sage 50 Journal → X3 GL Journal Entry
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0024-000000000001',
  NULL,
  'Sage 50cloud → Sage X3: GL Journal Entry',
  'Maps Sage 50cloud journal lines to Sage X3 GACCENTRY. '
    'journal_code maps directly to X3 JOUENTRY. '
    'line_debit / line_credit must be handled with separate mappings per debit/credit direction — '
    'clone this template and swap line_debit for line_credit when processing credit lines.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5j-x3gl-01","source_column":"journal_code","target_field":"journal_code","transform":"none","required":true},
    {"id":"s5j-x3gl-02","source_column":"date","target_field":"accounting_date","transform":"date_format","required":true},
    {"id":"s5j-x3gl-03","source_column":"description","target_field":"description","transform":"none","required":false},
    {"id":"s5j-x3gl-04","source_column":"reference","target_field":"line_description","transform":"none","required":false},
    {"id":"s5j-x3gl-05","source_column":"line_ledger_account","target_field":"gl_account","transform":"none","required":true},
    {"id":"s5j-x3gl-06","source_column":"line_debit","target_field":"amount","transform":"decimal","required":false},
    {"id":"s5j-x3gl-07","source_column":"line_description","target_field":"line_description","transform":"none","required":false},
    {"id":"s5j-x3gl-08","source_column":"currency_code","target_field":"currency","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_gaccentry'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;

-- 6.4  Sage 50 Contact → X3 Customer (BPC)
INSERT INTO field_mappings (
  id, tenant_id, name, description,
  transaction_type, connector_id, object_type_id,
  is_template, template_status, is_default, column_mappings
)
SELECT
  '00000000-0000-0049-0025-000000000001',
  NULL,
  'Sage 50cloud → Sage X3: Customer (BPC)',
  'Maps Sage 50cloud contact (customer type) to Sage X3 BPCUSTOMER. '
    'reference maps to customer_code. For supplier contacts, clone and change the '
    'object type to Supplier (BPS) and map reference to supplier_code instead.',
  NULL,
  ec.id,
  ot.id,
  true, 'published', false,
  '[
    {"id":"s5c-x3cu-01","source_column":"reference","target_field":"customer_code","transform":"none","required":true},
    {"id":"s5c-x3cu-02","source_column":"name","target_field":"customer_name","transform":"none","required":true},
    {"id":"s5c-x3cu-03","source_column":"tax_number","target_field":"tax_reg_number","transform":"none","required":false},
    {"id":"s5c-x3cu-04","source_column":"email","target_field":"email","transform":"none","required":false},
    {"id":"s5c-x3cu-05","source_column":"phone","target_field":"phone","transform":"none","required":false},
    {"id":"s5c-x3cu-06","source_column":"address_line_1","target_field":"address_line1","transform":"none","required":false},
    {"id":"s5c-x3cu-07","source_column":"city","target_field":"city","transform":"none","required":false},
    {"id":"s5c-x3cu-08","source_column":"postal_code","target_field":"postal_code","transform":"none","required":false},
    {"id":"s5c-x3cu-09","source_column":"country","target_field":"country","transform":"none","required":false},
    {"id":"s5c-x3cu-10","source_column":"currency_code","target_field":"currency","transform":"none","required":false}
  ]'::jsonb
FROM endpoint_connectors ec
JOIN endpoint_object_types ot ON ot.connector_id = ec.id AND ot.object_key = 'x3_bpcustomer'
WHERE ec.connector_key = 'sage_x3'
ON CONFLICT (id) DO NOTHING;
