-- Migration 022: Fix change_tenant_subscription to cancel old sub BEFORE inserting new one.
--
-- The original function inserted the new subscription first, then cancelled the old.
-- This caused a unique constraint violation on idx_subscriptions_one_active_per_tenant
-- (which enforces only one active+unsuperseded row per tenant) because both rows
-- briefly existed with status='active' AND superseded_by IS NULL.
--
-- Fix: cancel the old subscription first (releases the constraint slot), then
-- insert the new one, then backfill superseded_by on the old row.

CREATE OR REPLACE FUNCTION public.change_tenant_subscription(
  p_tenant_id           uuid,
  p_plan_id             text,
  p_min_months          int            DEFAULT 1,
  p_is_free_of_charge   boolean        DEFAULT false,
  p_discount_pct        numeric        DEFAULT 0,
  p_notes               text           DEFAULT NULL,
  p_created_by          uuid           DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_sub_id      uuid;
  v_new_sub_id      uuid;
  v_period_start    date;
  v_period_end      date;
  v_commit_end      date;
  v_plan_price      numeric(10,2);
BEGIN
  -- Calculate period: always starts on 1st of current or next month
  v_period_start := DATE_TRUNC('month', CURRENT_DATE)::date;
  IF CURRENT_DATE <> v_period_start THEN
    v_period_start := (v_period_start + INTERVAL '1 month')::date;
  END IF;
  v_period_end := (v_period_start + INTERVAL '1 month')::date;
  v_commit_end := (v_period_start + (p_min_months || ' months')::interval)::date;

  -- Snapshot plan price
  SELECT price_gbp_monthly INTO v_plan_price
  FROM public.plans WHERE id = p_plan_id;

  -- Find the existing active subscription
  SELECT id INTO v_old_sub_id
  FROM public.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND superseded_by IS NULL;

  -- STEP 1: Cancel the old subscription FIRST so the unique index slot is freed
  IF v_old_sub_id IS NOT NULL THEN
    UPDATE public.tenant_subscriptions
    SET status = 'cancelled',
        cancellation_date = v_period_start,
        cancelled_by = p_created_by,
        cancelled_at = now()
    WHERE id = v_old_sub_id;
  END IF;

  -- STEP 2: Insert the new subscription (no unique conflict now)
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

  -- STEP 3: Backfill superseded_by on the old row now that we have the new ID
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

  -- Audit
  INSERT INTO public.audit_log (tenant_id, user_id, operation, resource_type, resource_id, new_values)
  VALUES (
    p_tenant_id,
    p_created_by,
    'subscription_change',
    'subscription',
    v_new_sub_id,
    jsonb_build_object(
      'plan_id', p_plan_id,
      'period_start', v_period_start,
      'period_end', v_period_end,
      'is_free_of_charge', p_is_free_of_charge,
      'discount_pct', p_discount_pct,
      'superseded', v_old_sub_id
    )
  );

  RETURN v_new_sub_id;
END;
$$;
