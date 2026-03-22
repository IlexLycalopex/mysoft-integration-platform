-- Migration 047: Source connector infrastructure
-- Adds source_credentials (encrypted OAuth tokens) and source_syncs tables.
-- Activates Xero and QuickBooks Online connectors (already registered in 036).
-- Adds Sage 50cloud connector (Sage Accounting API).
-- Extends upload_jobs with source tracking columns.

-- ── source_credentials ────────────────────────────────────────────────────────
-- Stores encrypted OAuth tokens per tenant per source connector.

CREATE TABLE IF NOT EXISTS source_credentials (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id      UUID        NOT NULL REFERENCES endpoint_connectors(id) ON DELETE CASCADE,
  encrypted_data    TEXT        NOT NULL,  -- AES-256-GCM ciphertext (JSON blob)
  iv                TEXT        NOT NULL,
  auth_tag          TEXT        NOT NULL,
  token_expires_at  TIMESTAMPTZ,           -- When access_token expires
  extra_data        JSONB       DEFAULT '{}'::jsonb,  -- realm_id, xero_tenant_id etc.
  connected_at      TIMESTAMPTZ DEFAULT now(),
  connected_by      UUID        REFERENCES auth.users(id),
  refreshed_at      TIMESTAMPTZ,
  UNIQUE (tenant_id, connector_id)
);

ALTER TABLE source_credentials ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all; tenants can manage their own
CREATE POLICY "source_credentials_select" ON source_credentials
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "source_credentials_insert" ON source_credentials
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "source_credentials_update" ON source_credentials
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_platform_admin())
  );

CREATE POLICY "source_credentials_delete" ON source_credentials
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_platform_admin())
  );

-- ── source_syncs ──────────────────────────────────────────────────────────────
-- Saved sync configurations: which source object type maps to which template.

CREATE TABLE IF NOT EXISTS source_syncs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id        UUID        NOT NULL REFERENCES endpoint_connectors(id),
  source_object_key   TEXT        NOT NULL,
  target_mapping_id   UUID        REFERENCES field_mappings(id) ON DELETE SET NULL,
  is_active           BOOLEAN     DEFAULT true,
  sync_since          TIMESTAMPTZ,           -- Delta: only records modified after this
  last_synced_at      TIMESTAMPTZ,
  last_sync_count     INT,
  config              JSONB       DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, connector_id, source_object_key)
);

ALTER TABLE source_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_syncs_all" ON source_syncs
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_platform_admin())
  );

-- ── upload_jobs: source tracking columns ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'upload_jobs' AND column_name = 'source_connector_id') THEN
    ALTER TABLE upload_jobs
      ADD COLUMN source_connector_id UUID REFERENCES endpoint_connectors(id),
      ADD COLUMN source_object_key   TEXT,
      ADD COLUMN source_sync_id      UUID REFERENCES source_syncs(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_source_credentials_tenant
  ON source_credentials (tenant_id, connector_id);

CREATE INDEX IF NOT EXISTS idx_source_syncs_tenant
  ON source_syncs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_source_connector
  ON upload_jobs (source_connector_id) WHERE source_connector_id IS NOT NULL;

-- ── Activate Xero and QuickBooks Online ───────────────────────────────────────

UPDATE endpoint_connectors SET is_active = true
WHERE connector_key IN ('xero', 'quickbooks_online');

UPDATE endpoint_object_types SET is_active = true
WHERE connector_id IN (
  SELECT id FROM endpoint_connectors
  WHERE connector_key IN ('xero', 'quickbooks_online')
);

-- ── Sage 50cloud connector (Sage Accounting API) ──────────────────────────────

INSERT INTO endpoint_connectors (
  connector_key, display_name, description, connector_type,
  is_active, is_system, config_schema, capabilities, sort_order
) VALUES (
  'sage50cloud',
  'Sage 50cloud',
  'Sage 50cloud / Sage Business Cloud Accounting — source for invoices, journals and contacts via the Sage Accounting API. Requires Sage 50cloud subscription.',
  'source', true, false,
  '{"auth_type":"oauth2","base_url":"https://api.accounting.sage.com/v3.1","scopes":["full_access"]}'::jsonb,
  '{"connectorType":"sage50cloud","displayName":"Sage 50cloud","supportedObjectTypes":["sage50_sales_invoice","sage50_purchase_invoice","sage50_journal","sage50_contact"],"supportsDeltaSync":true}'::jsonb,
  205
)
ON CONFLICT (connector_key) DO UPDATE
  SET display_name   = EXCLUDED.display_name,
      description    = EXCLUDED.description,
      connector_type = EXCLUDED.connector_type,
      is_active      = EXCLUDED.is_active,
      config_schema  = EXCLUDED.config_schema,
      capabilities   = EXCLUDED.capabilities;

INSERT INTO endpoint_object_types (connector_id, object_key, display_name, description, is_active, is_system, sort_order, field_schema)
SELECT c.id, v.object_key, v.display_name, v.description, true, false, v.sort_order, '{}'::jsonb
FROM endpoint_connectors c,
LATERAL (VALUES
  ('sage50_sales_invoice',    'Sales Invoices',    'Sage 50cloud customer invoices',          10),
  ('sage50_purchase_invoice', 'Purchase Invoices', 'Sage 50cloud supplier/vendor invoices',   20),
  ('sage50_journal',          'Journals',          'Sage 50cloud manual journal entries',      30),
  ('sage50_contact',          'Contacts',          'Sage 50cloud customers and suppliers',     40)
) AS v(object_key, display_name, description, sort_order)
WHERE c.connector_key = 'sage50cloud'
ON CONFLICT (connector_id, object_key) DO NOTHING;
