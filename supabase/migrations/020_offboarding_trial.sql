-- ============================================================
-- Mysoft Integration Platform — Offboarding & Trial Lifecycle (R2)
-- ============================================================

-- Add archived_at timestamp to tenants (set when tenant is manually offboarded via Archive action)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ============================================================
-- process_trial_expirations
-- Called by daily cron. Suspends tenants whose trial_ends_at has passed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_trial_expirations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_tenant_id uuid;
  v_tenant_name text;
BEGIN
  FOR v_tenant_id, v_tenant_name IN
    SELECT id, name
    FROM public.tenants
    WHERE status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now()
  LOOP
    UPDATE public.tenants
    SET status = 'suspended', updated_at = now()
    WHERE id = v_tenant_id;

    INSERT INTO public.audit_log (user_id, tenant_id, operation, resource_type, resource_id, new_values)
    VALUES (
      NULL,
      v_tenant_id,
      'trial_expired',
      'tenant',
      v_tenant_id::text,
      jsonb_build_object('status', 'suspended', 'reason', 'trial_period_ended', 'tenant_name', v_tenant_name)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- process_tenant_offboarding
-- Called by daily cron. Wipes data for offboarded tenants where
-- archived_at is more than 90 days ago.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_tenant_offboarding()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_tenant_id uuid;
  v_tenant_name text;
BEGIN
  FOR v_tenant_id, v_tenant_name IN
    SELECT id, name
    FROM public.tenants
    WHERE status = 'offboarded'
      AND archived_at IS NOT NULL
      AND archived_at < now() - interval '90 days'
      -- Guard: only wipe if upload_jobs still exist (avoid re-running)
      AND EXISTS (
        SELECT 1 FROM public.upload_jobs WHERE tenant_id = id LIMIT 1
      )
  LOOP
    -- Remove open invites
    DELETE FROM public.user_invites WHERE tenant_id = v_tenant_id;

    -- Revoke all API keys
    UPDATE public.api_keys
    SET revoked_at = now()
    WHERE tenant_id = v_tenant_id
      AND revoked_at IS NULL;

    -- Disable all watchers
    UPDATE public.watcher_configs
    SET enabled = false
    WHERE tenant_id = v_tenant_id;

    -- Delete upload jobs (cascades to job_errors)
    DELETE FROM public.upload_jobs WHERE tenant_id = v_tenant_id;

    -- Delete field mappings (tenant-specific only, not templates)
    DELETE FROM public.field_mappings
    WHERE tenant_id = v_tenant_id
      AND is_template = false;

    -- Deactivate users, clear PII — preserve rows for audit trail
    UPDATE public.user_profiles
    SET
      is_active  = false,
      first_name = '[removed]',
      last_name  = '[removed]',
      updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND first_name IS DISTINCT FROM '[removed]';

    -- Write audit record
    INSERT INTO public.audit_log (user_id, tenant_id, operation, resource_type, resource_id, new_values)
    VALUES (
      NULL,
      v_tenant_id,
      'tenant_data_purged',
      'tenant',
      v_tenant_id::text,
      jsonb_build_object('reason', 'offboarding_90_day_retention', 'tenant_name', v_tenant_name)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Register the new RPC functions in search path
GRANT EXECUTE ON FUNCTION public.process_trial_expirations() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_tenant_offboarding() TO service_role;
