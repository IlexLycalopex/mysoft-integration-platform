-- Migration 030: Extend tenant_branding for template support
-- Adds columns to support template-based branding with platform access control

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
