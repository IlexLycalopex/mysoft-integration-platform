-- ============================================================
-- Migration 019: Tenant subscriptions
-- ============================================================

-- ── Status enum ──────────────────────────────────────────────
CREATE TYPE public.subscription_status AS ENUM (
  'trial',
  'active',
  'cancelled',
  'expired'
);

-- ── Core table ───────────────────────────────────────────────
CREATE TABLE public.tenant_subscriptions (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id               text          NOT NULL REFERENCES public.plans(id),

  -- Billing period (always 1st of month)
  period_start          date          NOT NULL,
  period_end            date          NOT NULL,

  -- Minimum commitment
  min_months            int           NOT NULL DEFAULT 1 CHECK (min_months >= 1),
  commitment_end_date   date          NOT NULL,

  -- Pricing (plan_price_gbp snapshotted at creation — frozen for historical accuracy)
  is_free_of_charge     boolean       NOT NULL DEFAULT false,
  discount_pct          numeric(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  plan_price_gbp        numeric(10,2),
  effective_price_gbp   numeric(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN is_free_of_charge THEN 0
      ELSE ROUND(COALESCE(plan_price_gbp, 0) * (1 - discount_pct / 100.0), 2)
    END
  ) STORED,

  -- Status
  status                public.subscription_status NOT NULL DEFAULT 'active',

  -- Cancellation
  cancellation_date     date,
  cancelled_by          uuid          REFERENCES public.user_profiles(id),
  cancelled_at          timestamptz,

  -- Notes (internal)
  notes                 text,

  -- Supersession chain
  superseded_by         uuid          REFERENCES public.tenant_subscriptions(id),

  -- Audit
  created_by            uuid          REFERENCES public.user_profiles(id),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT sub_period_valid    CHECK (period_end > period_start),
  CONSTRAINT sub_period_first_of_month CHECK (EXTRACT(DAY FROM period_start) = 1)
);

COMMENT ON TABLE public.tenant_subscriptions IS
  'Subscription history per tenant. One active row per tenant (status=active AND superseded_by IS NULL).';
COMMENT ON COLUMN public.tenant_subscriptions.plan_price_gbp IS
  'Snapshot of plans.price_gbp_monthly at subscription creation. Immutable thereafter.';
COMMENT ON COLUMN public.tenant_subscriptions.effective_price_gbp IS
  'Computed billed price: plan_price_gbp × (1 – discount_pct/100), or 0 if free_of_charge.';
COMMENT ON COLUMN public.tenant_subscriptions.commitment_end_date IS
  'Earliest date this subscription can be cancelled: period_start + min_months months.';

-- ── Indexes ───────────────────────────────────────────────────
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_tenant
  ON public.tenant_subscriptions (tenant_id)
  WHERE status = 'active' AND superseded_by IS NULL;

CREATE INDEX idx_subscriptions_tenant_history
  ON public.tenant_subscriptions (tenant_id, created_at DESC);

CREATE INDEX idx_subscriptions_renewal_due
  ON public.tenant_subscriptions (period_end)
  WHERE status = 'active' AND superseded_by IS NULL AND cancellation_date IS NULL;

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER set_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── View: active_subscriptions ────────────────────────────────
CREATE VIEW public.active_subscriptions AS
SELECT
  ts.*,
  p.name                                                        AS plan_name,
  p.max_jobs_per_month,
  p.max_rows_per_month,
  p.max_storage_mb,
  p.max_watchers,
  p.max_api_keys,
  p.max_users,
  p.features,
  (CURRENT_DATE < ts.commitment_end_date)                       AS in_minimum_period,
  GREATEST(0, ts.commitment_end_date - CURRENT_DATE)           AS days_until_commitment_end,
  (ts.period_end - CURRENT_DATE)                               AS days_until_period_end
FROM public.tenant_subscriptions ts
JOIN public.plans p ON p.id = ts.plan_id
WHERE ts.status = 'active'
  AND ts.superseded_by IS NULL;

COMMENT ON VIEW public.active_subscriptions IS
  'One row per tenant with an active subscription. Includes plan limits and commitment/period calculations.';

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage all subscriptions"
  ON public.tenant_subscriptions FOR ALL
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Tenant members read own subscription"
  ON public.tenant_subscriptions FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ── Atomic plan-change function ───────────────────────────────
-- Must be called via supabase.rpc() to get atomicity.
-- Supersedes the existing subscription and creates a new one
-- starting from the 1st of next month (or current month if today IS the 1st).
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
  -- If today is not the 1st, start from 1st of next month
  IF CURRENT_DATE <> v_period_start THEN
    v_period_start := (v_period_start + INTERVAL '1 month')::date;
  END IF;
  v_period_end   := (v_period_start + INTERVAL '1 month')::date;
  v_commit_end   := (v_period_start + (p_min_months || ' months')::interval)::date;

  -- Snapshot plan price
  SELECT price_gbp_monthly INTO v_plan_price
  FROM public.plans WHERE id = p_plan_id;

  -- Find the existing active subscription (may be null for new tenants)
  SELECT id INTO v_old_sub_id
  FROM public.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND superseded_by IS NULL;

  -- Insert new subscription first (gets id)
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

  -- Supersede the old subscription (if any)
  IF v_old_sub_id IS NOT NULL THEN
    UPDATE public.tenant_subscriptions
    SET superseded_by = v_new_sub_id,
        status = 'cancelled',
        cancellation_date = v_period_start,
        cancelled_by = p_created_by,
        cancelled_at = now()
    WHERE id = v_old_sub_id;
  END IF;

  -- Keep tenants.plan_id in sync (denorm cache)
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

COMMENT ON FUNCTION public.change_tenant_subscription IS
  'Atomically supersedes any existing active subscription and creates a new one. '
  'Keeps tenants.plan_id in sync. Call via supabase.rpc().';

-- ── Auto-renewal function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_subscription_renewals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sub      RECORD;
  new_id   uuid;
  renewed  integer := 0;
BEGIN
  FOR sub IN
    SELECT *
    FROM public.tenant_subscriptions
    WHERE status = 'active'
      AND superseded_by IS NULL
      AND cancellation_date IS NULL
      AND period_end <= CURRENT_DATE
  LOOP
    INSERT INTO public.tenant_subscriptions (
      tenant_id, plan_id, period_start, period_end,
      min_months, commitment_end_date,
      is_free_of_charge, discount_pct, plan_price_gbp,
      status, notes
    ) VALUES (
      sub.tenant_id, sub.plan_id,
      sub.period_end,
      (sub.period_end + INTERVAL '1 month')::date,
      1,
      (sub.period_end + INTERVAL '1 month')::date,
      sub.is_free_of_charge,
      sub.discount_pct,
      sub.plan_price_gbp,
      'active',
      'Auto-renewed'
    )
    RETURNING id INTO new_id;

    UPDATE public.tenant_subscriptions
    SET superseded_by = new_id
    WHERE id = sub.id;

    INSERT INTO public.audit_log (tenant_id, operation, resource_type, resource_id, new_values)
    VALUES (
      sub.tenant_id,
      'subscription_autorenewal',
      'subscription',
      new_id,
      jsonb_build_object(
        'plan_id', sub.plan_id,
        'period_start', sub.period_end,
        'period_end', (sub.period_end + INTERVAL '1 month')::date,
        'previous_id', sub.id
      )
    );

    renewed := renewed + 1;
  END LOOP;

  RETURN renewed;
END;
$$;

COMMENT ON FUNCTION public.process_subscription_renewals IS
  'Called on 1st of each month. Renews all active rolling subscriptions whose period has ended.';

-- ── Cron: subscription renewal ────────────────────────────────
-- Schedule via Supabase Dashboard → Database → Extensions → pg_cron, or via SQL:
-- SELECT cron.schedule('subscription-renewal', '5 0 1 * *',
--   $$ SELECT public.process_subscription_renewals(); $$);
