-- Platform-wide settings stored as key/value pairs
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- Only platform_super_admin can read/write
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_select" ON platform_settings
  FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY "platform_admins_all" ON platform_settings
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Seed defaults (do not overwrite if already set)
INSERT INTO platform_settings (key, value, description) VALUES
  ('health.dlq_threshold',         '10',                      'Number of dead-letter jobs that triggers a degraded health status'),
  ('health.error_rate_pct',        '50',                      'Percentage of failed jobs in the last hour that triggers degraded status'),
  ('health.agent_offline_minutes', '15',                      'Minutes of agent inactivity before it is considered offline'),
  ('notifications.support_email',  '"support@mysoftx3.com"',  'Default support email address shown in all outgoing emails'),
  ('jobs.default_supdoc_folder',   '"Mysoft Imports"',        'Default Sage Intacct folder name used when pushing supporting documents'),
  ('users.invite_ttl_days',        '7',                       'Number of days before a user invite link expires'),
  ('sftp.connection_timeout_ms',   '15000',                   'SFTP connection timeout in milliseconds'),
  ('sftp.retry_count',             '1',                       'Number of SFTP connection retry attempts on failure')
ON CONFLICT (key) DO NOTHING;
