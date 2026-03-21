-- Migration 035: Webhook enhancements
-- Adds channel_type (Teams/Slack), delivery log, inbound receivers
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS webhook_receive_log CASCADE;
--   DROP TABLE IF EXISTS webhook_receivers CASCADE;
--   DROP TABLE IF EXISTS webhook_delivery_log CASCADE;
--   ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS channel_type;

-- ── 1. Channel type on outbound endpoints ─────────────────────────────────────

ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'generic'
    CONSTRAINT webhook_endpoints_channel_type_check
      CHECK (channel_type IN ('generic', 'teams', 'slack'));

COMMENT ON COLUMN webhook_endpoints.channel_type IS
  'Delivery format: generic=raw JSON, teams=Adaptive Card, slack=Block Kit';

-- ── 2. Outbound delivery log ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID        NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event           TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  status_code     INT,
  response_body   TEXT,
  error           TEXT,
  duration_ms     INT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_replay       BOOLEAN     NOT NULL DEFAULT FALSE,
  replayed_from   UUID        REFERENCES webhook_delivery_log(id)
);

CREATE INDEX IF NOT EXISTS idx_wdl_endpoint  ON webhook_delivery_log(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_wdl_tenant    ON webhook_delivery_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wdl_delivered ON webhook_delivery_log(delivered_at DESC);

-- Retention: only keep 90 days of delivery logs
COMMENT ON TABLE webhook_delivery_log IS
  'Per-dispatch delivery record for observability and replay. Retain 90 days.';

ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

-- Tenant users can only read their own logs; writes go through admin client
CREATE POLICY "wdl_tenant_select" ON webhook_delivery_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ── 3. Inbound receivers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_receivers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  receiver_key    TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(20), 'hex'),
  description     TEXT,
  secret          TEXT,           -- HMAC-SHA256 validation secret (optional)
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wr_tenant ON webhook_receivers(tenant_id);

COMMENT ON TABLE webhook_receivers IS
  'Inbound webhook receiver slots. Each has a unique URL path /api/inbound/{receiver_key}.';

ALTER TABLE webhook_receivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wr_tenant_select" ON webhook_receivers
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ── 4. Inbound receive log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_receive_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_id     UUID        NOT NULL REFERENCES webhook_receivers(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_ip       TEXT,
  method          TEXT,
  headers         JSONB,
  payload         JSONB,
  raw_body        TEXT,
  signature_valid BOOLEAN,
  processed       BOOLEAN     NOT NULL DEFAULT FALSE,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_wrl_receiver ON webhook_receive_log(receiver_id);
CREATE INDEX IF NOT EXISTS idx_wrl_tenant   ON webhook_receive_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wrl_received ON webhook_receive_log(received_at DESC);

COMMENT ON TABLE webhook_receive_log IS
  'Log of all inbound payloads received by receiver slots. Retain 30 days.';

ALTER TABLE webhook_receive_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wrl_tenant_select" ON webhook_receive_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
    )
  );
