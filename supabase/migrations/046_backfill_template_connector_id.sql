-- Migration 046: Backfill connector_id on existing platform mapping templates
--
-- Migration 044 added connector_id to field_mappings, but the 10 seed templates
-- predate that column and were left with connector_id = NULL. All seed templates
-- are Sage Intacct transaction types (journal_entry, ap_bill, ar_invoice, etc.)
-- so they are assigned to the intacct connector.
--
-- This migration is idempotent — running it again has no effect.

UPDATE field_mappings
SET connector_id = (
  SELECT id FROM endpoint_connectors WHERE connector_key = 'intacct' LIMIT 1
)
WHERE is_template = true
  AND connector_id IS NULL;
