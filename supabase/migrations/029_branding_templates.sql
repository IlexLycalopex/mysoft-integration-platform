-- Migration 029: Create branding_templates table
-- Stores immutable, versioned branding templates for reuse across tenants

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
