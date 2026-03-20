-- Migration 024: Add custom_domain to tenant_branding
-- Allows recording a tenant's custom domain (informational — requires DNS + platform config)

ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS custom_domain text;

COMMENT ON COLUMN tenant_branding.custom_domain IS
  'Optional custom domain for this tenant (e.g. integrations.clientname.com). '
  'Informational only — DNS CNAME configuration is handled outside this platform.';
