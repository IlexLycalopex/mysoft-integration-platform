-- Migration 036: Extended connector registry
-- Adds source connectors: Xero, QuickBooks, Shopify, HubSpot, Salesforce
-- Adds target connectors: Sage X3
-- Stubs — field schemas populated as connectors are implemented
--
-- ROLLBACK:
--   DELETE FROM endpoint_object_types WHERE connector_id IN (
--     SELECT id FROM endpoint_connectors WHERE connector_key IN
--     ('xero','quickbooks_online','sage_x3','shopify','hubspot','salesforce')
--   );
--   DELETE FROM endpoint_connectors WHERE connector_key IN
--     ('xero','quickbooks_online','sage_x3','shopify','hubspot','salesforce');
--   ALTER TABLE endpoint_connectors DROP COLUMN IF EXISTS connector_type;

-- Add connector_type column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'endpoint_connectors'
      AND column_name = 'connector_type'
  ) THEN
    ALTER TABLE endpoint_connectors
      ADD COLUMN connector_type TEXT NOT NULL DEFAULT 'target'
        CONSTRAINT endpoint_connectors_type_check
          CHECK (connector_type IN ('source', 'target', 'both'));
  END IF;
END $$;

-- ── Xero (source) ────────────────────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'xero', 'Xero',
  'Xero accounting — source for GL, AP/AR, payroll migration into Sage Intacct',
  'source', false,
  '{"auth_type":"oauth2","base_url":"https://api.xero.com","fields":[{"key":"tenant_id","label":"Xero Tenant ID","type":"text","required":true},{"key":"client_id","label":"OAuth Client ID","type":"text","required":true},{"key":"client_secret","label":"OAuth Client Secret","type":"password","required":true}]}'::jsonb,
  '{"read":true,"write":false}'::jsonb, 200
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('xero_invoice','Invoices','Xero sales invoices / AR',10),('xero_bill','Bills','Xero purchase bills / AP',20),
  ('xero_credit_note','Credit Notes','Xero credit notes',30),('xero_payment','Payments','Xero payments applied',40),
  ('xero_journal','Manual Journals','Xero manual journal entries',50),('xero_contact','Contacts','Xero customers and suppliers',60),
  ('xero_item','Items','Xero inventory items',70)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'xero'
ON CONFLICT (connector_id, object_key) DO NOTHING;

-- ── QuickBooks Online (source) ───────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'quickbooks_online', 'QuickBooks Online',
  'QuickBooks Online — source for migration into Sage Intacct',
  'source', false,
  '{"auth_type":"oauth2","base_url":"https://quickbooks.api.intuit.com","fields":[{"key":"realm_id","label":"Company ID (Realm ID)","type":"text","required":true},{"key":"client_id","label":"OAuth Client ID","type":"text","required":true},{"key":"client_secret","label":"OAuth Client Secret","type":"password","required":true}]}'::jsonb,
  '{"read":true,"write":false}'::jsonb, 210
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('qbo_invoice','Invoices','QBO sales invoices',10),('qbo_bill','Bills','QBO vendor bills',20),
  ('qbo_payment','Payments','QBO customer payments',30),('qbo_journal_entry','Journal Entries','QBO manual journal entries',40),
  ('qbo_vendor','Vendors','QBO vendor/supplier list',50),('qbo_customer','Customers','QBO customer list',60),
  ('qbo_item','Products/Services','QBO items and services',70)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'quickbooks_online'
ON CONFLICT (connector_id, object_key) DO NOTHING;

-- ── Sage X3 (target) ─────────────────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'sage_x3', 'Sage X3',
  'Sage X3 ERP — target system for data import via web services / Syracuse API',
  'target', false,
  '{"auth_type":"basic","fields":[{"key":"base_url","label":"Sage X3 Server URL","type":"text","required":true},{"key":"username","label":"API Username","type":"text","required":true},{"key":"password","label":"API Password","type":"password","required":true},{"key":"solution","label":"Solution Code","type":"text","required":true},{"key":"folder","label":"Folder Code","type":"text","required":true}]}'::jsonb,
  '{"read":false,"write":true}'::jsonb, 220
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('x3_sinvoice','Sales Invoices','Sage X3 SINVOICE — customer billing',10),('x3_pinvoice','Purchase Invoices','Sage X3 PINVOICE — supplier bills',20),
  ('x3_gaccentry','Journal Entries','Sage X3 GACCENTRY — GL journals',30),('x3_bpcustomer','Customers (BPC)','Sage X3 BPC — business partner customers',40),
  ('x3_bpsupplier','Suppliers (BPS)','Sage X3 BPS — business partner suppliers',50),('x3_itmmaster','Products (ITM)','Sage X3 ITMMASTER — items/products',60),
  ('x3_payment','Payments','Sage X3 PAYMENT — cash management',70)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'sage_x3'
ON CONFLICT (connector_id, object_key) DO NOTHING;

-- ── Shopify (source) ─────────────────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'shopify', 'Shopify',
  'Shopify ecommerce — source for order and product data migration',
  'source', false,
  '{"auth_type":"api_key","fields":[{"key":"shop_domain","label":"Shop Domain","type":"text","required":true,"placeholder":"your-store.myshopify.com"},{"key":"access_token","label":"Admin API Access Token","type":"password","required":true}]}'::jsonb,
  '{"read":true,"write":false}'::jsonb, 230
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('shopify_order','Orders','Shopify sales orders',10),('shopify_product','Products','Shopify product catalogue',20),
  ('shopify_customer','Customers','Shopify customer records',30),('shopify_refund','Refunds','Shopify order refunds',40),
  ('shopify_payout','Payouts','Shopify Payments payouts',50)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'shopify'
ON CONFLICT (connector_id, object_key) DO NOTHING;

-- ── HubSpot CRM (source) ─────────────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'hubspot', 'HubSpot',
  'HubSpot CRM — source for contact, company and deal data',
  'source', false,
  '{"auth_type":"api_key","base_url":"https://api.hubapi.com","fields":[{"key":"access_token","label":"Private App Access Token","type":"password","required":true}]}'::jsonb,
  '{"read":true,"write":false}'::jsonb, 240
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('hubspot_contact','Contacts','HubSpot contact records',10),
  ('hubspot_company','Companies','HubSpot company records',20),
  ('hubspot_deal','Deals','HubSpot deal pipeline',30)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'hubspot'
ON CONFLICT (connector_id, object_key) DO NOTHING;

-- ── Salesforce (source + target) ─────────────────────────────────────────────

INSERT INTO endpoint_connectors (connector_key, display_name, description, connector_type, is_active, config_schema, capabilities, sort_order)
VALUES (
  'salesforce', 'Salesforce',
  'Salesforce CRM — source for Account/Contact/Opportunity data or target for sync',
  'both', false,
  '{"auth_type":"oauth2","base_url":"https://login.salesforce.com","fields":[{"key":"instance_url","label":"Salesforce Instance URL","type":"text","required":true},{"key":"client_id","label":"Connected App Consumer Key","type":"text","required":true},{"key":"client_secret","label":"Consumer Secret","type":"password","required":true}]}'::jsonb,
  '{"read":true,"write":true}'::jsonb, 250
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name, description = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type, config_schema = EXCLUDED.config_schema;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, sort_order, field_schema)
SELECT id, v.object_key, v.display_name, v.description, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors,
LATERAL (VALUES
  ('sf_account','Accounts','Salesforce Account records',10),('sf_contact','Contacts','Salesforce Contact records',20),
  ('sf_opportunity','Opportunities','Salesforce Opportunity pipeline',30),('sf_invoice','Invoices','Salesforce CPQ billing invoices',40)
) AS v(object_key, display_name, description, sort_order)
WHERE connector_key = 'salesforce'
ON CONFLICT (connector_id, object_key) DO NOTHING;
