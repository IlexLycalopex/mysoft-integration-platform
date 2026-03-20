-- ============================================================
-- Migration 022: Mapping Engine v2
--
-- Adds `mapping_version` column to field_mappings.
-- The column_mappings JSONB already stores entries;
-- v2 entries include a `steps` array — v1 entries do not.
-- The processor detects the format automatically via the compat shim.
--
-- No existing data is modified. Fully backward compatible.
-- ============================================================

ALTER TABLE public.field_mappings
  ADD COLUMN IF NOT EXISTS mapping_version INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.field_mappings.mapping_version IS
  'Mapping engine schema version. 1 = v1 (single transform per row), 2 = v2 (ordered step pipeline).';

-- Extend transaction_type check to include new types added after migration 004
-- (ar_payment, ap_payment, timesheet, vendor, customer were allowed in practice)
ALTER TABLE public.field_mappings
  DROP CONSTRAINT IF EXISTS field_mappings_transaction_type_check;

ALTER TABLE public.field_mappings
  ADD CONSTRAINT field_mappings_transaction_type_check
  CHECK (transaction_type IN (
    'journal_entry', 'ar_invoice', 'ap_bill', 'expense_report',
    'ar_payment', 'ap_payment', 'timesheet', 'vendor', 'customer'
  ));

-- Index for querying by version (useful for auditing v1 vs v2 mappings)
CREATE INDEX IF NOT EXISTS idx_field_mappings_version
  ON public.field_mappings(mapping_version);
