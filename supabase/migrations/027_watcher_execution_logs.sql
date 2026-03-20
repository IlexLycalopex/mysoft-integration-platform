-- Migration 027: Watcher execution logs
-- Records the outcome of each poll or push event for a watcher configuration.
-- Used to display "last polled" status and ingestion history in the UI.

CREATE TABLE IF NOT EXISTS watcher_execution_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id      uuid        NOT NULL REFERENCES watcher_configs(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  source_type     text        NOT NULL CHECK (source_type IN ('sftp_poll', 'http_push', 'agent_push')),
  files_found     integer     NOT NULL DEFAULT 0,
  files_ingested  integer     NOT NULL DEFAULT 0,
  files_skipped   integer     NOT NULL DEFAULT 0,
  files_rejected  integer     NOT NULL DEFAULT 0,
  error_message   text,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wel_watcher_ran
  ON watcher_execution_logs(watcher_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_wel_tenant_ran
  ON watcher_execution_logs(tenant_id, ran_at DESC);

-- RLS: tenant users can read their own execution logs; service role (admin) can write
ALTER TABLE watcher_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_own_execution_logs" ON watcher_execution_logs
  FOR SELECT USING (
    tenant_id IN (
      SELECT COALESCE(
        (SELECT id FROM tenants WHERE id = auth.uid()),
        (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
      )
    )
  );

COMMENT ON TABLE watcher_execution_logs IS
  'Audit log of every watcher poll/push execution — used to show last-polled status and history in the UI.';
