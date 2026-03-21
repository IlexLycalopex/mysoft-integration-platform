-- Migration 037: Connector licensing and pricing
-- Adds per-tenant connector licences managed by platform admins.
-- Tenants cannot self-serve; all control is at the platform layer.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS tenant_connector_licences;
--   ALTER TABLE plans DROP COLUMN IF EXISTS included_connector_keys;

-- ── Per-tenant connector licences ─────────────────────────────────────────────

CREATE TABLE tenant_connector_licences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id      UUID        NOT NULL REFERENCES endpoint_connectors(id) ON DELETE CASCADE,

  -- Status
  is_enabled        BOOLEAN     NOT NULL DEFAULT true,

  -- Commercial terms (informational in Phase 1 — actual billing handled externally)
  licence_type      TEXT        NOT NULL DEFAULT 'paid_monthly'
    CONSTRAINT tcl_licence_type_check
      CHECK (licence_type IN ('included','paid_monthly','paid_annual','trial','complimentary')),
  price_gbp_monthly NUMERIC(10,2),           -- NULL = no override / use plan default
  trial_ends_at     TIMESTAMPTZ,             -- only used when licence_type = 'trial'

  -- Notes / audit
  notes             TEXT,
  enabled_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, connector_id)
);

CREATE INDEX idx_tcl_tenant_id    ON tenant_connector_licences(tenant_id);
CREATE INDEX idx_tcl_connector_id ON tenant_connector_licences(connector_id);

-- ── Plan-level connector defaults ─────────────────────────────────────────────
-- Platform admins can tag which connectors come bundled with a plan.
-- Used for reference / future automation; licences are still explicitly created.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS included_connector_keys TEXT[] NOT NULL DEFAULT '{}';

-- Sage Intacct is the core connector included in all paid plans
UPDATE plans SET included_connector_keys = ARRAY['sage_intacct']
WHERE id IN ('starter','professional','enterprise');

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_connector_licences ENABLE ROW LEVEL SECURITY;

-- Platform admins can read and manage all licences
CREATE POLICY "platform_admins_manage_connector_licences"
  ON tenant_connector_licences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('platform_super_admin','mysoft_support_admin')
    )
  );

-- Tenant members can read their own licences (for enforcement in the app)
CREATE POLICY "tenant_members_read_own_connector_licences"
  ON tenant_connector_licences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = tenant_connector_licences.tenant_id
    )
  );

-- ── Seed: grant Sage Intacct (included) to all existing tenants ───────────────
-- Ensures existing tenants aren't blocked when enforcement is added.

INSERT INTO tenant_connector_licences (tenant_id, connector_id, is_enabled, licence_type, price_gbp_monthly, notes)
SELECT
  t.id,
  c.id,
  true,
  'included',
  0.00,
  'Auto-granted: Sage Intacct included in all plans'
FROM tenants t
CROSS JOIN endpoint_connectors c
WHERE c.connector_key = 'sage_intacct'
  AND t.status != 'offboarded'
ON CONFLICT (tenant_id, connector_id) DO NOTHING;
