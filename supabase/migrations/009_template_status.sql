-- Migration 009: Template status for field mapping templates
-- Adds draft/published workflow to platform-managed mapping templates

ALTER TABLE field_mappings
ADD COLUMN IF NOT EXISTS template_status TEXT NOT NULL DEFAULT 'published'
CHECK (template_status IN ('draft', 'published'));

COMMENT ON COLUMN field_mappings.template_status IS 'Workflow status for platform templates (is_template=true). draft = not visible to tenants, published = available to clone.';
