-- ============================================================
-- Mysoft Integration Platform — Field Discovery Cache
-- Migration 034: connector_field_cache for dynamic schema
--
-- ROLLBACK PLAN:
--   DROP TABLE IF EXISTS public.connector_field_cache;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.connector_field_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key    text NOT NULL,
  object_type_key  text NOT NULL,
  tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_data      jsonb NOT NULL,
  source           text NOT NULL DEFAULT 'static'
    CHECK (source IN ('api', 'static', 'manual')),
  ttl_hours        int  NOT NULL DEFAULT 24,
  discovered_at    timestamptz NOT NULL DEFAULT now(),
  discovered_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(connector_key, object_type_key, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_field_cache_lookup
  ON public.connector_field_cache(connector_key, object_type_key, tenant_id);

ALTER TABLE public.connector_field_cache ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access (manage platform-level cache)
CREATE POLICY "platform_admins_manage_field_cache"
  ON public.connector_field_cache
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Tenant members: read/write their own tenant's cache
CREATE POLICY "tenant_members_manage_own_field_cache"
  ON public.connector_field_cache
  FOR ALL
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- Everyone reads platform-level cache (tenant_id IS NULL)
CREATE POLICY "authenticated_read_platform_field_cache"
  ON public.connector_field_cache
  FOR SELECT
  USING (tenant_id IS NULL AND auth.uid() IS NOT NULL);
