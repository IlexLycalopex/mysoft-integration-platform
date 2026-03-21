-- Migration 044: Add connector_id to field_mappings
-- Links each field mapping to a specific endpoint connector, enabling per-connector default scoping
-- and allowing mappings to be reached via connector cards.

ALTER TABLE field_mappings
  ADD COLUMN connector_id UUID REFERENCES endpoint_connectors(id) ON DELETE SET NULL;

COMMENT ON COLUMN field_mappings.connector_id IS
  'The endpoint connector this mapping applies to. NULL for legacy/unassigned mappings.';

-- Index for filtering mappings by connector
CREATE INDEX idx_field_mappings_connector_id ON field_mappings (tenant_id, connector_id);
