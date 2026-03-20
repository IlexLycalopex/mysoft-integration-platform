-- Migration 023: Upcoming subscriptions + hard-delete tenant support
--
-- 1. Add 'upcoming' to tenant_subscriptions status constraint
-- 2. Add unique index: one upcoming subscription per tenant
-- 3. Update change_tenant_subscription() to accept a commencement date
--    - commencement_date <= today → immediate (existing behaviour)
--    - commencement_date >  today → create as 'upcoming', leave active in place
-- 4. Add activate_upcoming_subscriptions() → called by subscription-renewal cron
-- 5. Add delete_tenant() for hard-delete with name confirmation

-- ── 1. Status constraint ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.tenant_subscriptions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%active%cancelled%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'upcoming', 'cancelled', 'expired'));

-- ── 2. One upcoming per tenant ───────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_upcoming_per_tenant
  ON public.tenant_subscriptions (tenant_id)
  WHERE status = 'upcoming';

-- ── 3. Updated change_tenant_subscription ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_tenant_subscription(
  p_tenant_id           uuid,
  p_plan_id             text,
  p_min_months          int            DEFAULT 1,
  p_is_free_of_charge   boolean        DEFAULT false,
  p_discount_pct        numeric        DEFAULT 0,
  p_notes               text           DEFAULT NULL,
  p_created_by          uuid           DEFAULT NULL,
  p_commencement_date   date           DEFAULT NULL   -- NULL = immediate (1st of current month)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_sub_id      uuid;
  v_existing_upcoming_id uuid;
  v_new_sub_id      uuid;
  v_period_start    date;
  v_period_end      date;
  v_commit_end      date;
  v_plan_price      numeric(10,2);
  v_is_immediate    boolean;
BEGIN
  -- Determine commencement date; default to 1st of current month
  IF p_commencement_date IS NULL THEN
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::date;
  ELSE
    v_period_start := p_commencement_date;
  END IF;

  v_is_immediate := (v_period_start <= CURRENT_DATE);

  v_period_end  := (v_period_start + INTERVAL '1 month')::date;
  v_commit_end  := (v_period_start + (p_min_months || ' months')::interval)::date;

  -- Snapshot plan price
  SELECT price_gbp_monthly INTO v_plan_price
  FROM public.plans WHERE id = p_plan_id;

  -- Find existing active subscription
  SELECT id INTO v_old_sub_id
  FROM public.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND superseded_by IS NULL;

  -- Find any existing upcoming subscription
  SELECT id INTO v_existing_upcoming_id
  FROM public.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'upcoming';

  IF v_is_immediate THEN
    -- ── Immediate path (existing behaviour) ──────────────────────────────────

    -- Cancel any existing upcoming first (it's superseded by this immediate change)
    IF v_existing_upcoming_id IS NOT NULL THEN
      UPDATE public.tenant_subscriptions
      SET status = 'cancelled',
          cancellation_date = CURRENT_DATE,
          cancelled_by = p_created_by,
          cancelled_at = now()
      WHERE id = v_existing_upcoming_id;
    END IF;

    -- Cancel the old active subscription (frees the unique index slot)
    IF v_old_sub_id IS NOT NULL THEN
      UPDATE public.tenant_subscriptions
      SET status = 'cancelled',
          cancellation_date = v_period_start,
          cancelled_by = p_created_by,
          cancelled_at = now()
      WHERE id = v_old_sub_id;
    END IF;

    -- Insert new active subscription
    INSERT INTO public.tenant_subscriptions (
      tenant_id, plan_id, period_start, period_end,
      min_months, commitment_end_date,
      is_free_of_charge, discount_pct, plan_price_gbp,
      status, notes, created_by
    ) VALUES (
      p_tenant_id, p_plan_id, v_period_start, v_period_end,
      p_min_months, v_commit_end,
      p_is_free_of_charge, p_discount_pct, v_plan_price,
      'active', p_notes, p_created_by
    )
    RETURNING id INTO v_new_sub_id;

    -- Backfill superseded_by on the old active row
    IF v_old_sub_id IS NOT NULL THEN
      UPDATE public.tenant_subscriptions
      SET superseded_by = v_new_sub_id
      WHERE id = v_old_sub_id;
    END IF;

    -- Keep tenants.plan_id in sync
    UPDATE public.tenants
    SET plan_id = p_plan_id,
        plan_assigned_at = now()
    WHERE id = p_tenant_id;

  ELSE
    -- ── Future path — schedule as upcoming ───────────────────────────────────

    -- Cancel any existing upcoming (replace it)
    IF v_existing_upcoming_id IS NOT NULL THEN
      UPDATE public.tenant_subscriptions
      SET status = 'cancelled',
          cancellation_date = CURRENT_DATE,
          cancelled_by = p_created_by,
          cancelled_at = now()
      WHERE id = v_existing_upcoming_id;
    END IF;

    -- Insert new upcoming subscription (active sub left untouched)
    INSERT INTO public.tenant_subscriptions (
      tenant_id, plan_id, period_start, period_end,
      min_months, commitment_end_date,
      is_free_of_charge, discount_pct, plan_price_gbp,
      status, notes, created_by
    ) VALUES (
      p_tenant_id, p_plan_id, v_period_start, v_period_end,
      p_min_months, v_commit_end,
      p_is_free_of_charge, p_discount_pct, v_plan_price,
      'upcoming', p_notes, p_created_by
    )
    RETURNING id INTO v_new_sub_id;

    -- NOTE: tenants.plan_id is NOT updated until activation
  END IF;

  -- Audit
  INSERT INTO public.audit_log (tenant_id, user_id, operation, resource_type, resource_id, new_values)
  VALUES (
    p_tenant_id,
    p_created_by,
    CASE WHEN v_is_immediate THEN 'subscription_change' ELSE 'subscription_scheduled' END,
    'subscription',
    v_new_sub_id,
    jsonb_build_object(
      'plan_id', p_plan_id,
      'period_start', v_period_start,
      'period_end', v_period_end,
      'status', CASE WHEN v_is_immediate THEN 'active' ELSE 'upcoming' END,
      'is_free_of_charge', p_is_free_of_charge,
      'discount_pct', p_discount_pct,
      'superseded', v_old_sub_id
    )
  );

  RETURN v_new_sub_id;
END;
$$;

-- ── 4. activate_upcoming_subscriptions ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_upcoming_subscriptions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_upcoming RECORD;
  v_old_sub_id uuid;
  v_count int := 0;
BEGIN
  FOR v_upcoming IN
    SELECT * FROM public.tenant_subscriptions
    WHERE status = 'upcoming'
      AND period_start <= CURRENT_DATE
    ORDER BY period_start
  LOOP
    -- Find the current active subscription for this tenant
    SELECT id INTO v_old_sub_id
    FROM public.tenant_subscriptions
    WHERE tenant_id = v_upcoming.tenant_id
      AND status = 'active'
      AND superseded_by IS NULL;

    -- Cancel old active (frees the unique index slot)
    IF v_old_sub_id IS NOT NULL THEN
      UPDATE public.tenant_subscriptions
      SET status = 'cancelled',
          cancellation_date = v_upcoming.period_start,
          cancelled_at = now(),
          superseded_by = v_upcoming.id
      WHERE id = v_old_sub_id;
    END IF;

    -- Activate the upcoming subscription
    UPDATE public.tenant_subscriptions
    SET status = 'active'
    WHERE id = v_upcoming.id;

    -- Sync tenants.plan_id
    UPDATE public.tenants
    SET plan_id = v_upcoming.plan_id,
        plan_assigned_at = now()
    WHERE id = v_upcoming.tenant_id;

    -- Audit
    INSERT INTO public.audit_log (tenant_id, operation, resource_type, resource_id, new_values)
    VALUES (
      v_upcoming.tenant_id,
      'subscription_activated',
      'subscription',
      v_upcoming.id,
      jsonb_build_object(
        'plan_id', v_upcoming.plan_id,
        'period_start', v_upcoming.period_start,
        'superseded', v_old_sub_id
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 5. delete_tenant — hard delete with name confirmation ────────────────────
-- Called server-side after verifying the confirmed name matches.
-- Cascades to all related tables via FK constraints.
-- Returns error text if blocked; NULL on success.
CREATE OR REPLACE FUNCTION public.delete_tenant(
  p_tenant_id       uuid,
  p_confirmed_name  text,
  p_deleted_by      uuid
)
RETURNS text   -- NULL = success; non-null = error message
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_name text;
  v_active_sub  uuid;
BEGIN
  -- Verify the tenant exists and get name
  SELECT name INTO v_tenant_name
  FROM public.tenants WHERE id = p_tenant_id;

  IF v_tenant_name IS NULL THEN
    RETURN 'Tenant not found';
  END IF;

  -- Name confirmation check (case-sensitive exact match)
  IF v_tenant_name <> p_confirmed_name THEN
    RETURN 'Tenant name does not match';
  END IF;

  -- Block if active subscription
  SELECT id INTO v_active_sub
  FROM public.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND superseded_by IS NULL;

  IF v_active_sub IS NOT NULL THEN
    RETURN 'Cannot delete a tenant with an active subscription. Cancel the subscription first.';
  END IF;

  -- Audit before deletion (so we have a record)
  INSERT INTO public.audit_log (user_id, operation, resource_type, resource_id, new_values)
  VALUES (
    p_deleted_by,
    'delete_tenant',
    'tenant',
    p_tenant_id,
    jsonb_build_object('name', v_tenant_name, 'deleted_by', p_deleted_by)
  );

  -- Hard delete — cascades to child tables via FK ON DELETE CASCADE
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN NULL; -- success
END;
$$;
