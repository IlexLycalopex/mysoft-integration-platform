-- Migration 043: Add default_price_gbp_monthly to endpoint_connectors
-- Provides a catalogue price that pre-fills when granting a connector licence to a tenant.

ALTER TABLE endpoint_connectors
  ADD COLUMN default_price_gbp_monthly NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN endpoint_connectors.default_price_gbp_monthly IS
  'Default catalogue price per month in GBP. Pre-fills the list price when granting a licence to a tenant. Can be overridden per-tenant in tenant_connector_licences.price_gbp_monthly.';
