-- Migration 042: Add discount_pct to tenant_connector_licences
-- Allows per-tenant connector pricing overrides with partial or full (100%) discounts.

ALTER TABLE tenant_connector_licences
  ADD COLUMN discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_pct >= 0 AND discount_pct <= 100);

COMMENT ON COLUMN tenant_connector_licences.discount_pct IS
  'Percentage discount applied to price_gbp_monthly. 0 = no discount, 100 = FOC (free of charge). Effective price = price_gbp_monthly * (1 - discount_pct / 100).';
