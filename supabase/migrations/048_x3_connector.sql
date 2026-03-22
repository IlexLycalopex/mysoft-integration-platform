-- Migration 048: Sage X3 target connector — activate and populate field schemas
-- Sage X3 was registered as an inactive stub in migration 036.
-- This migration activates it and fills in full field schemas for all 7 object types.

-- Activate the connector
UPDATE endpoint_connectors
SET
  is_active     = true,
  is_system     = false,
  display_name  = 'Sage X3',
  description   = 'Sage X3 (Enterprise Management) — target ERP via Syracuse REST/GraphQL API. Requires X3 v12+ with API access enabled.',
  config_schema = '{
    "auth_type": "basic",
    "fields": [
      {"key":"base_url",   "label":"Server URL",       "type":"text",     "required":true,  "placeholder":"https://x3server.example.com"},
      {"key":"solution",   "label":"Solution Code",    "type":"text",     "required":true,  "placeholder":"SEED"},
      {"key":"folder",     "label":"Folder Code",      "type":"text",     "required":true,  "placeholder":"SEED"},
      {"key":"username",   "label":"API Username",     "type":"text",     "required":true},
      {"key":"password",   "label":"API Password",     "type":"password", "required":true},
      {"key":"api_version","label":"API Version",      "type":"text",     "required":false, "placeholder":"v1 (default)"},
      {"key":"use_graphql","label":"Use GraphQL API",  "type":"boolean",  "required":false, "description":"Use GraphQL mutations instead of REST POST for create operations"}
    ]
  }'::jsonb,
  capabilities  = '{
    "connectorType":           "sage_x3",
    "displayName":             "Sage X3",
    "supportedObjectTypes":    ["x3_gaccentry","x3_sinvoice","x3_pinvoice","x3_bpcustomer","x3_bpsupplier","x3_itmmaster","x3_payment"],
    "supportsDryRun":          true,
    "supportsUpsert":          false,
    "supportsAttachments":     false,
    "supportsFieldDiscovery":  false,
    "fieldDiscoveryRequiresAuth": false,
    "supportsHealthCheck":     true
  }'::jsonb,
  sort_order    = 220
WHERE connector_key = 'sage_x3';

-- Activate all X3 object types
UPDATE endpoint_object_types SET is_active = true
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3');

-- Update object type metadata and field schemas
-- x3_gaccentry — GL Journal Entry
UPDATE endpoint_object_types
SET
  display_name     = 'GL Journal Entry',
  description      = 'Sage X3 GACCENTRY — general ledger manual journal entries (single-line per row)',
  api_object_name  = 'GACCENTRY',
  sort_order       = 10,
  field_schema     = '{
    "fields": [
      {"key":"journal_code",      "label":"Journal Code",        "group":"Header",  "required":true,  "dataType":"string",  "description":"X3 JOUENTRY — journal type code e.g. ACH, ANO"},
      {"key":"accounting_date",   "label":"Accounting Date",     "group":"Header",  "required":true,  "dataType":"date",    "description":"ACCDAT — format YYYY-MM-DD or YYYYMMDD"},
      {"key":"description",       "label":"Description",         "group":"Header",  "required":false, "dataType":"string",  "description":"DES — journal header description"},
      {"key":"currency",          "label":"Currency Code",       "group":"Header",  "required":false, "dataType":"string",  "description":"CUR — ISO 4217 currency code e.g. GBP"},
      {"key":"exchange_rate",     "label":"Exchange Rate",       "group":"Header",  "required":false, "dataType":"decimal", "description":"RATMLT — exchange rate to base currency"},
      {"key":"gl_account",        "label":"GL Account",          "group":"Line",    "required":true,  "dataType":"string",  "description":"GRPLIN[0].GACCLIN[0].ACC — account number"},
      {"key":"debit_credit",      "label":"Debit / Credit",      "group":"Line",    "required":true,  "dataType":"string",  "description":"SID — DEBIT or CREDIT (or 40/50)"},
      {"key":"amount",            "label":"Amount",              "group":"Line",    "required":true,  "dataType":"decimal", "description":"AMTCUR — amount in transaction currency"},
      {"key":"line_description",  "label":"Line Description",    "group":"Line",    "required":false, "dataType":"string",  "description":"DESLIN — line-level description"},
      {"key":"cost_center",       "label":"Cost Centre",         "group":"Line",    "required":false, "dataType":"string",  "description":"FCY — analytical dimension / cost centre"},
      {"key":"quantity",          "label":"Quantity",            "group":"Line",    "required":false, "dataType":"decimal", "description":"QTY — quantity for statistical accounts"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_gaccentry';

-- x3_sinvoice — Sales Invoice
UPDATE endpoint_object_types
SET
  display_name     = 'Sales Invoice',
  description      = 'Sage X3 SINVOICE — customer billing invoices and credit notes',
  api_object_name  = 'SINVOICE',
  sort_order       = 20,
  field_schema     = '{
    "fields": [
      {"key":"invoice_type",      "label":"Invoice Type",        "group":"Header",  "required":true,  "dataType":"string",  "description":"SIVTYP — INV (invoice) or CRN (credit note)"},
      {"key":"customer_code",     "label":"Customer Code",       "group":"Header",  "required":true,  "dataType":"string",  "description":"BPCINV — Sage X3 customer code"},
      {"key":"invoice_date",      "label":"Invoice Date",        "group":"Header",  "required":true,  "dataType":"date",    "description":"INVDAT — format YYYY-MM-DD"},
      {"key":"accounting_date",   "label":"Accounting Date",     "group":"Header",  "required":false, "dataType":"date",    "description":"ACCDAT — defaults to invoice date"},
      {"key":"invoice_number",    "label":"Invoice Number",      "group":"Header",  "required":false, "dataType":"string",  "description":"NUM — leave blank to auto-number"},
      {"key":"currency",          "label":"Currency Code",       "group":"Header",  "required":false, "dataType":"string",  "description":"CUR — ISO 4217"},
      {"key":"site",              "label":"Site Code",           "group":"Header",  "required":false, "dataType":"string",  "description":"SALFCY — selling site/entity code"},
      {"key":"item_code",         "label":"Item Code",           "group":"Line",    "required":true,  "dataType":"string",  "description":"SDHLIN[0].ITMREF — Sage X3 item reference"},
      {"key":"item_description",  "label":"Item Description",    "group":"Line",    "required":false, "dataType":"string",  "description":"SDHLIN[0].ITMDES — overrides item master description"},
      {"key":"quantity",          "label":"Quantity",            "group":"Line",    "required":true,  "dataType":"decimal", "description":"SDHLIN[0].QTY"},
      {"key":"unit_price",        "label":"Unit Price",          "group":"Line",    "required":true,  "dataType":"decimal", "description":"SDHLIN[0].GROPRI — gross unit price"},
      {"key":"discount_pct",      "label":"Discount %",          "group":"Line",    "required":false, "dataType":"decimal", "description":"SDHLIN[0].DISCRGVAL1"},
      {"key":"vat_code",          "label":"VAT Code",            "group":"Line",    "required":false, "dataType":"string",  "description":"SDHLIN[0].VACITM1 — tax code"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_sinvoice';

-- x3_pinvoice — Purchase Invoice
UPDATE endpoint_object_types
SET
  display_name     = 'Purchase Invoice',
  description      = 'Sage X3 PINVOICE — supplier/vendor invoices and credit notes',
  api_object_name  = 'PINVOICE',
  sort_order       = 30,
  field_schema     = '{
    "fields": [
      {"key":"invoice_type",      "label":"Invoice Type",        "group":"Header",  "required":true,  "dataType":"string",  "description":"PIVTYP — INV or CRN"},
      {"key":"supplier_code",     "label":"Supplier Code",       "group":"Header",  "required":true,  "dataType":"string",  "description":"BPSINV — Sage X3 supplier/vendor code"},
      {"key":"invoice_date",      "label":"Invoice Date",        "group":"Header",  "required":true,  "dataType":"date",    "description":"INVDAT — format YYYY-MM-DD"},
      {"key":"accounting_date",   "label":"Accounting Date",     "group":"Header",  "required":false, "dataType":"date",    "description":"ACCDAT — defaults to invoice date"},
      {"key":"invoice_number",    "label":"Supplier Invoice No.", "group":"Header", "required":false, "dataType":"string",  "description":"BPSINV external reference"},
      {"key":"currency",          "label":"Currency Code",       "group":"Header",  "required":false, "dataType":"string",  "description":"CUR — ISO 4217"},
      {"key":"site",              "label":"Site Code",           "group":"Header",  "required":false, "dataType":"string",  "description":"PRHFCY — purchasing site/entity code"},
      {"key":"item_code",         "label":"Item Code",           "group":"Line",    "required":true,  "dataType":"string",  "description":"PDHLIN[0].ITMREF"},
      {"key":"item_description",  "label":"Item Description",    "group":"Line",    "required":false, "dataType":"string",  "description":"PDHLIN[0].ITMDES"},
      {"key":"quantity",          "label":"Quantity",            "group":"Line",    "required":true,  "dataType":"decimal", "description":"PDHLIN[0].QTY"},
      {"key":"unit_price",        "label":"Unit Price",          "group":"Line",    "required":true,  "dataType":"decimal", "description":"PDHLIN[0].GROPRI"},
      {"key":"vat_code",          "label":"VAT Code",            "group":"Line",    "required":false, "dataType":"string",  "description":"PDHLIN[0].VACITM1"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_pinvoice';

-- x3_bpcustomer — Customer
UPDATE endpoint_object_types
SET
  display_name     = 'Customer (BPC)',
  description      = 'Sage X3 BPCUSTOMER — create or update business partner customers',
  api_object_name  = 'BPCUSTOMER',
  sort_order       = 40,
  field_schema     = '{
    "fields": [
      {"key":"customer_code",   "label":"Customer Code",     "group":"Identity", "required":true,  "dataType":"string",  "description":"BPCNUM — unique customer code"},
      {"key":"customer_name",   "label":"Customer Name",     "group":"Identity", "required":true,  "dataType":"string",  "description":"BPCNAM"},
      {"key":"tax_reg_number",  "label":"Tax / VAT Number",  "group":"Identity", "required":false, "dataType":"string",  "description":"STCNUM"},
      {"key":"currency",        "label":"Currency Code",     "group":"Finance",  "required":false, "dataType":"string",  "description":"CUR — default trading currency"},
      {"key":"payment_terms",   "label":"Payment Terms",     "group":"Finance",  "required":false, "dataType":"string",  "description":"PTE — payment terms code"},
      {"key":"customer_group",  "label":"Customer Group",    "group":"Finance",  "required":false, "dataType":"string",  "description":"BPCGRU — pricing/discount group"},
      {"key":"address_line1",   "label":"Address Line 1",   "group":"Address",  "required":false, "dataType":"string",  "description":"BPCADD.ADD1"},
      {"key":"address_line2",   "label":"Address Line 2",   "group":"Address",  "required":false, "dataType":"string",  "description":"BPCADD.ADD2"},
      {"key":"city",            "label":"City",              "group":"Address",  "required":false, "dataType":"string",  "description":"BPCADD.CTY"},
      {"key":"postal_code",     "label":"Postal Code",       "group":"Address",  "required":false, "dataType":"string",  "description":"BPCADD.POSCOD"},
      {"key":"country",         "label":"Country Code",      "group":"Address",  "required":false, "dataType":"string",  "description":"BPCADD.CRY — ISO 3166 e.g. GB, US, FR"},
      {"key":"phone",           "label":"Phone",             "group":"Contact",  "required":false, "dataType":"string",  "description":"TEL"},
      {"key":"email",           "label":"Email",             "group":"Contact",  "required":false, "dataType":"string",  "description":"WEB — website/email field"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_bpcustomer';

-- x3_bpsupplier — Supplier
UPDATE endpoint_object_types
SET
  display_name     = 'Supplier (BPS)',
  description      = 'Sage X3 BPSUPPLIER — create or update business partner suppliers',
  api_object_name  = 'BPSUPPLIER',
  sort_order       = 50,
  field_schema     = '{
    "fields": [
      {"key":"supplier_code",   "label":"Supplier Code",     "group":"Identity", "required":true,  "dataType":"string",  "description":"BPSNUM — unique supplier code"},
      {"key":"supplier_name",   "label":"Supplier Name",     "group":"Identity", "required":true,  "dataType":"string",  "description":"BPSNAM"},
      {"key":"tax_reg_number",  "label":"Tax / VAT Number",  "group":"Identity", "required":false, "dataType":"string",  "description":"STCNUM"},
      {"key":"currency",        "label":"Currency Code",     "group":"Finance",  "required":false, "dataType":"string",  "description":"CUR"},
      {"key":"payment_terms",   "label":"Payment Terms",     "group":"Finance",  "required":false, "dataType":"string",  "description":"PTE — payment terms code"},
      {"key":"supplier_group",  "label":"Supplier Group",    "group":"Finance",  "required":false, "dataType":"string",  "description":"BPSGRU"},
      {"key":"address_line1",   "label":"Address Line 1",   "group":"Address",  "required":false, "dataType":"string",  "description":"BPSADD.ADD1"},
      {"key":"city",            "label":"City",              "group":"Address",  "required":false, "dataType":"string",  "description":"BPSADD.CTY"},
      {"key":"postal_code",     "label":"Postal Code",       "group":"Address",  "required":false, "dataType":"string",  "description":"BPSADD.POSCOD"},
      {"key":"country",         "label":"Country Code",      "group":"Address",  "required":false, "dataType":"string",  "description":"BPSADD.CRY — ISO 3166"},
      {"key":"phone",           "label":"Phone",             "group":"Contact",  "required":false, "dataType":"string",  "description":"TEL"},
      {"key":"email",           "label":"Email",             "group":"Contact",  "required":false, "dataType":"string"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_bpsupplier';

-- x3_itmmaster — Item/Product Master
UPDATE endpoint_object_types
SET
  display_name     = 'Product (ITMMASTER)',
  description      = 'Sage X3 ITMMASTER — create or update inventory items and services',
  api_object_name  = 'ITMMASTER',
  sort_order       = 60,
  field_schema     = '{
    "fields": [
      {"key":"item_code",        "label":"Item Code",         "group":"Identity", "required":true,  "dataType":"string",  "description":"ITMREF — unique item reference"},
      {"key":"description1",     "label":"Description 1",     "group":"Identity", "required":true,  "dataType":"string",  "description":"ITMDES1"},
      {"key":"description2",     "label":"Description 2",     "group":"Identity", "required":false, "dataType":"string",  "description":"ITMDES2"},
      {"key":"item_type",        "label":"Item Type",         "group":"Identity", "required":false, "dataType":"string",  "description":"ITMTYP — STO (stocked), SVC (service), MISC"},
      {"key":"product_line",     "label":"Product Line",      "group":"Category", "required":false, "dataType":"string",  "description":"TCLCOD — product line / category code"},
      {"key":"unit_of_measure",  "label":"Unit of Measure",   "group":"Units",    "required":false, "dataType":"string",  "description":"STU — stock unit e.g. UN, EA, KG"},
      {"key":"purchase_price",   "label":"Purchase Price",    "group":"Pricing",  "required":false, "dataType":"decimal", "description":"PURPRI"},
      {"key":"sales_price",      "label":"Sales Price",       "group":"Pricing",  "required":false, "dataType":"decimal", "description":"SALESPRI"},
      {"key":"tax_code",         "label":"Tax Code",          "group":"Tax",      "required":false, "dataType":"string",  "description":"VACITM — VAT/tax code"},
      {"key":"active",           "label":"Active",            "group":"Status",   "required":false, "dataType":"string",  "description":"ITMSTA — A (active) or I (inactive)"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_itmmaster';

-- x3_payment — Payment
UPDATE endpoint_object_types
SET
  display_name     = 'Payment',
  description      = 'Sage X3 PAYMENT — customer receipts and supplier payment entries',
  api_object_name  = 'PAYMENT',
  sort_order       = 70,
  field_schema     = '{
    "fields": [
      {"key":"payment_type",    "label":"Payment Type",      "group":"Header",   "required":true,  "dataType":"string",  "description":"PAYTYP — payment type code e.g. CHQ, TRF, DD"},
      {"key":"business_partner","label":"Business Partner",  "group":"Header",   "required":true,  "dataType":"string",  "description":"BPR — customer or supplier code"},
      {"key":"partner_type",    "label":"Partner Type",      "group":"Header",   "required":false, "dataType":"string",  "description":"BPRTYP — C (customer) or S (supplier)"},
      {"key":"payment_date",    "label":"Payment Date",      "group":"Header",   "required":true,  "dataType":"date",    "description":"PAYDAT — format YYYY-MM-DD"},
      {"key":"amount",          "label":"Amount",            "group":"Amounts",  "required":true,  "dataType":"decimal", "description":"AMTCUR — amount in transaction currency"},
      {"key":"currency",        "label":"Currency Code",     "group":"Amounts",  "required":false, "dataType":"string",  "description":"CURPAY — ISO 4217"},
      {"key":"bank_account",    "label":"Bank Account Code", "group":"Banking",  "required":false, "dataType":"string",  "description":"BANNUM — bank account code in X3"},
      {"key":"invoice_ref",     "label":"Invoice Reference", "group":"Matching", "required":false, "dataType":"string",  "description":"BPRVCR — invoice number to match/allocate against"},
      {"key":"description",     "label":"Description",       "group":"Header",   "required":false, "dataType":"string",  "description":"DES — payment description/memo"}
    ]
  }'::jsonb
WHERE connector_id = (SELECT id FROM endpoint_connectors WHERE connector_key = 'sage_x3')
  AND object_key = 'x3_payment';
