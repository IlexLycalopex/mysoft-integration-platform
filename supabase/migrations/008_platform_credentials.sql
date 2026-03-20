-- ============================================================
-- Migration 008: Platform-level credentials
-- Stores platform-wide secrets (e.g. Intacct Web Services
-- Sender ID/Password) that are shared across all tenants.
-- Only platform_super_admin can read or write these rows.
-- ============================================================

CREATE TABLE public.platform_credentials (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider       text NOT NULL UNIQUE,
  encrypted_data text NOT NULL,
  iv             text NOT NULL,
  auth_tag       text NOT NULL,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_platform_credentials_updated_at
  BEFORE UPDATE ON public.platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage platform credentials"
  ON public.platform_credentials FOR ALL
  USING (public.get_my_role() = 'platform_super_admin');

COMMENT ON TABLE public.platform_credentials IS
  'Platform-level credentials shared across all tenants (e.g. Intacct Web Services Sender). Only platform_super_admin can access these rows.';
