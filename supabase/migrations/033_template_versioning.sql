-- ============================================================
-- Mysoft Integration Platform — Template Versioning & Inheritance
-- Migration 033: versioning columns on field_mappings,
--                template_version_history table
--
-- Design principles:
--   • Zero breaking changes — all new columns have safe defaults
--   • Existing clones: inheritance_mode = 'standalone' (current behaviour)
--   • New clones: choose 'linked' or 'inherit' at clone time
--
-- ROLLBACK PLAN (run in reverse order if needed):
--   1. DROP TABLE IF EXISTS public.template_version_history;
--   2. ALTER TABLE public.field_mappings
--        DROP COLUMN IF EXISTS last_synced_at,
--        DROP COLUMN IF EXISTS sync_status,
--        DROP COLUMN IF EXISTS inheritance_mode,
--        DROP COLUMN IF EXISTS parent_template_version,
--        DROP COLUMN IF EXISTS parent_template_id,
--        DROP COLUMN IF EXISTS template_version;
-- ============================================================

-- ── 1. Versioning columns on field_mappings ───────────────────────────────────

ALTER TABLE public.field_mappings
  ADD COLUMN IF NOT EXISTS template_version         int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_template_id       uuid REFERENCES public.field_mappings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_template_version  int,
  ADD COLUMN IF NOT EXISTS inheritance_mode         text NOT NULL DEFAULT 'standalone'
    CHECK (inheritance_mode IN ('standalone', 'linked', 'inherit')),
  ADD COLUMN IF NOT EXISTS sync_status              text
    CHECK (sync_status IN ('up_to_date', 'update_available', 'conflict', 'diverged')),
  ADD COLUMN IF NOT EXISTS last_synced_at           timestamptz;

CREATE INDEX IF NOT EXISTS idx_field_mappings_parent_template
  ON public.field_mappings(parent_template_id)
  WHERE parent_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_mappings_sync_status
  ON public.field_mappings(sync_status)
  WHERE sync_status IS NOT NULL;

-- ── 2. template_version_history ──────────────────────────────────────────────
-- Immutable snapshot of every published platform template version.
-- Enables diff display and merge decisions.

CREATE TABLE IF NOT EXISTS public.template_version_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES public.field_mappings(id) ON DELETE CASCADE,
  version         int  NOT NULL,
  column_mappings jsonb NOT NULL,
  change_summary  text,
  published_at    timestamptz NOT NULL DEFAULT now(),
  published_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tvh_template_id
  ON public.template_version_history(template_id);

ALTER TABLE public.template_version_history ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY "platform_admins_manage_version_history"
  ON public.template_version_history
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- All authenticated users: read versions (needed for diff display)
CREATE POLICY "authenticated_read_version_history"
  ON public.template_version_history
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
