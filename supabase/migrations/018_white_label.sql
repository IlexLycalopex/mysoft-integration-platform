CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id     uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  brand_name    text,                      -- replaces "Mysoft Integration Platform" in UI
  logo_url      text,                      -- absolute URL to logo image (https://...)
  favicon_url   text,
  primary_color text DEFAULT '#0069B4',    -- CSS hex — replaces var(--blue)
  accent_color  text DEFAULT '#00A3E0',
  support_email text,
  support_url   text,
  custom_css    text,                      -- injected into <style> tag (advanced)
  updated_by    uuid REFERENCES auth.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;

-- Platform admins can do everything
CREATE POLICY "Platform admins manage branding"
  ON tenant_branding FOR ALL
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('platform_super_admin','mysoft_support_admin'));

-- Tenant members can read their own branding
CREATE POLICY "Tenant members can read own branding"
  ON tenant_branding FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));
