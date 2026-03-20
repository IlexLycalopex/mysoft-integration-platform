-- ============================================================================
-- BRANDING TEMPLATES SUPABASE MIGRATIONS
-- Run these two migrations in order to deploy branding templates to Dev
-- ============================================================================
--
-- Environment: Dev (Supabase + Vercel)
-- Deployment Date: March 20, 2026
-- Commit: debabc4
--
-- INSTRUCTIONS:
-- 1. Copy this entire SQL file
-- 2. Go to Supabase Dashboard → SQL Editor
-- 3. Paste the entire contents
-- 4. Click "Run"
-- 5. Verify tables created (see verification section below)
--
-- ============================================================================

-- ============================================================================
-- MIGRATION 029: Create branding_templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS branding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership & Visibility
  created_by UUID NOT NULL REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide template
  visibility TEXT NOT NULL DEFAULT 'private'::text,
    CHECK (visibility IN ('private', 'shared_with_tenants', 'platform_published')),

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,  -- preview image
  category TEXT,  -- e.g. 'tech', 'financial', 'professional', 'minimal'
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Branding Data (immutable snapshot stored as JSONB)
  branding_data JSONB NOT NULL,
  -- Schema: {
  --   brand_name?: string,
  --   logo_url?: string,
  --   favicon_url?: string,
  --   primary_color?: string (hex),
  --   accent_color?: string (hex),
  --   secondary_color?: string (hex),
  --   support_email?: string,
  --   support_url?: string,
  --   support_phone?: string,
  --   custom_css?: string,
  --   custom_domain?: string,
  --   fonts?: { heading?: string, body?: string },
  --   color_palette?: { neutral?: string[], success?: string, warning?: string, error?: string, info?: string },
  --   _metadata?: { created_at?: string, last_modified_by?: string }
  -- }

  -- Versioning & Archival
  version INT NOT NULL DEFAULT 1,
  parent_template_id UUID REFERENCES branding_templates(id),  -- for template lineage
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INT NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT template_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT template_data_not_empty CHECK (branding_data IS NOT NULL),
  CONSTRAINT version_positive CHECK (version > 0)
);

-- Indexes for common queries
CREATE INDEX idx_branding_templates_visibility ON branding_templates(visibility);
CREATE INDEX idx_branding_templates_tenant_id ON branding_templates(tenant_id);
CREATE INDEX idx_branding_templates_created_by ON branding_templates(created_by);
CREATE INDEX idx_branding_templates_is_archived ON branding_templates(is_archived);
CREATE INDEX idx_branding_templates_created_at ON branding_templates(created_at DESC);

-- Enable RLS
ALTER TABLE branding_templates ENABLE ROW LEVEL SECURITY;

-- Platform admins can CRUD all templates
CREATE POLICY "Platform admins manage all templates"
  ON branding_templates FOR ALL
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('platform_super_admin', 'mysoft_support_admin'));

-- Tenants can view published templates
CREATE POLICY "Tenants can view published templates"
  ON branding_templates FOR SELECT
  USING (
    visibility = 'platform_published'
    OR (visibility = 'shared_with_tenants' AND auth.uid() IS NOT NULL)
    OR (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()) AND visibility = 'private')
  );

-- Tenants can view their own private templates
CREATE POLICY "Tenants can view own templates"
  ON branding_templates FOR SELECT
  USING (
    created_by = auth.uid()
    OR tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- MIGRATION 030: Extend tenant_branding for template support
-- ============================================================================

ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES branding_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allowed_template_ids UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS template_version INT,
  ADD COLUMN IF NOT EXISTS custom_branding_data JSONB,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

-- Constraints
ALTER TABLE tenant_branding
  ADD CONSTRAINT template_version_positive CHECK (template_version IS NULL OR template_version > 0);

-- Comments
COMMENT ON COLUMN tenant_branding.template_id IS
  'Primary template assigned to this tenant. If NULL, use legacy direct columns (backward compatible).';

COMMENT ON COLUMN tenant_branding.allowed_template_ids IS
  'Additional templates this tenant can choose from. NULL or empty = tenant locked to template_id (default, most restrictive).';

COMMENT ON COLUMN tenant_branding.template_version IS
  'Version of the template at time of application. Used for audit trail.';

COMMENT ON COLUMN tenant_branding.custom_branding_data IS
  'Tenant-specific customizations on top of the template. Only populated if template_id is set. Schema: { brand_name?, logo_url?, ... (any BrandingData fields) }';

COMMENT ON COLUMN tenant_branding.applied_by IS
  'User who applied/updated this template configuration.';

COMMENT ON COLUMN tenant_branding.applied_at IS
  'Timestamp when template was applied or customizations were last updated.';

-- Index for template lookups
CREATE INDEX idx_tenant_branding_template_id ON tenant_branding(template_id);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to verify the migrations were successful:
-- ============================================================================

-- Verify branding_templates table exists and has correct columns
-- SELECT
--   column_name,
--   data_type,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'branding_templates'
-- ORDER BY ordinal_position;

-- Verify tenant_branding has new columns
-- SELECT
--   column_name,
--   data_type,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'tenant_branding'
-- ORDER BY ordinal_position;

-- Verify RLS policies are created
-- SELECT * FROM pg_policies
-- WHERE tablename = 'branding_templates';

-- Verify indexes are created
-- SELECT indexname, tablename, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('branding_templates', 'tenant_branding')
-- AND indexname LIKE '%branding%';

-- ============================================================================
-- DEPLOYMENT COMPLETE ✅
-- ============================================================================
-- If all queries above return results without errors, deployment is successful!
--
-- Next steps:
-- 1. Vercel will auto-deploy from GitHub push
-- 2. Navigate to /platform/branding-templates/ in Dev
-- 3. Create a test template
-- 4. Verify dashboard shows correct branding
--
-- If any issues:
-- See ROLLBACK_PLAN.md in the repository for rollback instructions
-- ============================================================================
