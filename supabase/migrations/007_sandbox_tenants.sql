-- ============================================================
-- Migration 007: Sandbox tenant support
-- ============================================================
-- A sandbox is a full sibling tenant row linked via sandbox_of.
-- Users belong to the production tenant; context switching is
-- handled at the application layer via a secure cookie.
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN is_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN sandbox_of uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Enforce one sandbox per production tenant
CREATE UNIQUE INDEX idx_tenants_one_sandbox_per_prod
  ON public.tenants(sandbox_of)
  WHERE sandbox_of IS NOT NULL;

CREATE INDEX idx_tenants_sandbox_of ON public.tenants(sandbox_of);

COMMENT ON COLUMN public.tenants.is_sandbox IS
  'True for sandbox (test) tenants. Sandbox tenants share the same user base as their production counterpart.';

COMMENT ON COLUMN public.tenants.sandbox_of IS
  'For sandbox tenants: the UUID of the linked production tenant.';

-- Users of a production tenant can also read their linked sandbox tenant row
CREATE POLICY "Tenant users view linked sandbox tenant"
  ON public.tenants FOR SELECT
  USING (
    is_sandbox = true
    AND sandbox_of = public.get_my_tenant_id()
  );
