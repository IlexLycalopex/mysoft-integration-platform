-- Plans table (platform-defined)
CREATE TABLE IF NOT EXISTS plans (
  id           text PRIMARY KEY,  -- 'free', 'starter', 'professional', 'enterprise'
  name         text NOT NULL,
  description  text,
  max_jobs_per_month   int,   -- NULL = unlimited
  max_rows_per_month   int,
  max_storage_mb       int,
  max_watchers         int,
  max_api_keys         int,
  max_users            int,
  price_gbp_monthly    numeric(10,2),
  features             text[] NOT NULL DEFAULT '{}',
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           int NOT NULL DEFAULT 0
);

-- Seed default plans
INSERT INTO plans VALUES
  ('free',         'Free',         'For evaluation and testing',              10,    1000,   100,   2,  2,   3,   0.00,  '{}', true, 1),
  ('starter',      'Starter',      'For small teams with light usage',        100,   50000,  500,   5,  5,  10,  49.00,  '{"dry_run","webhooks"}', true, 2),
  ('professional', 'Professional', 'For growing businesses',                  1000, 500000, 2000,  20, 20,  50, 149.00,  '{"dry_run","webhooks","approval_workflow","sftp","multi_entity"}', true, 3),
  ('enterprise',   'Enterprise',   'Unlimited — for large organisations',     NULL,  NULL,   NULL, NULL,NULL,NULL,NULL,   '{"dry_run","webhooks","approval_workflow","sftp","multi_entity","white_label","sso"}', true, 4)
ON CONFLICT (id) DO NOTHING;

-- Add plan to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES plans(id) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Monthly usage snapshots
CREATE TABLE IF NOT EXISTS tenant_usage_monthly (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year_month   text NOT NULL,  -- '2026-03'
  jobs_count   int  NOT NULL DEFAULT 0,
  rows_processed bigint NOT NULL DEFAULT 0,
  storage_bytes  bigint NOT NULL DEFAULT 0,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, year_month)
);
CREATE INDEX IF NOT EXISTS tenant_usage_monthly_tenant ON tenant_usage_monthly(tenant_id, year_month DESC);
ALTER TABLE tenant_usage_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins can read all usage"
  ON tenant_usage_monthly FOR SELECT
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('platform_super_admin','mysoft_support_admin'));
CREATE POLICY "Tenant members can read own usage"
  ON tenant_usage_monthly FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));
