-- Migration 014: dry-run flag, webhook endpoints, alert events

-- Dry run flag on upload_jobs
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;

-- Webhook endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  url          text NOT NULL,
  secret       text,
  events       text[] NOT NULL DEFAULT ARRAY['job.completed','job.failed'],
  enabled      boolean NOT NULL DEFAULT true,
  last_triggered_at  timestamptz,
  last_status_code   int,
  last_error         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant ON webhook_endpoints (tenant_id);
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can read webhooks"
  ON webhook_endpoints FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Tenant admins can manage webhooks"
  ON webhook_endpoints FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('tenant_admin','platform_super_admin','mysoft_support_admin')
  );

-- Alert events table (deduplication — prevents repeat alerts within cooldown period)
CREATE TABLE IF NOT EXISTS alert_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type   text NOT NULL,   -- 'agent_offline' | 'stuck_job' | 'high_error_rate'
  resource_id  text,            -- job id or watcher config id
  sent_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS alert_events_lookup ON alert_events (tenant_id, alert_type, sent_at DESC);
