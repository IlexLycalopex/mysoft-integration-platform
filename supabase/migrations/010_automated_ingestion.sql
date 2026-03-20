-- api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_hash      text NOT NULL UNIQUE,   -- SHA-256 hex of the raw key
  key_prefix    text NOT NULL,          -- first 8 chars for display e.g. "mip_3xKq"
  created_by    uuid REFERENCES auth.users(id),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_tenant_id_idx ON api_keys (tenant_id);

-- watcher_configs table
CREATE TABLE IF NOT EXISTS watcher_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             text NOT NULL,
  source_type      text NOT NULL CHECK (source_type IN ('local_folder', 'sftp')),
  folder_path      text,
  sftp_host        text,
  sftp_port        int DEFAULT 22,
  sftp_username    text,
  sftp_password_enc text,
  sftp_remote_path text,
  file_pattern     text NOT NULL DEFAULT '*.csv',
  mapping_id       uuid REFERENCES field_mappings(id),
  archive_action   text NOT NULL DEFAULT 'move' CHECK (archive_action IN ('move', 'delete', 'leave')),
  archive_folder   text,
  poll_interval    int NOT NULL DEFAULT 300,
  auto_process     boolean NOT NULL DEFAULT true,
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS watcher_configs_tenant_id_idx ON watcher_configs (tenant_id);

-- upload_jobs additions
ALTER TABLE upload_jobs
  ADD COLUMN IF NOT EXISTS sha256             text,
  ADD COLUMN IF NOT EXISTS watcher_config_id  uuid REFERENCES watcher_configs(id),
  ADD COLUMN IF NOT EXISTS source_type        text CHECK (source_type IN ('manual', 'agent', 'sftp_poll')) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_process       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS upload_jobs_sha256_idx ON upload_jobs (sha256);

-- RLS: api_keys — no direct client access, all via server actions/api routes
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_platform_admin" ON api_keys
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('platform_super_admin', 'mysoft_support_admin')
    )
  );

-- RLS: watcher_configs — tenant_admin can manage own tenant's watchers
ALTER TABLE watcher_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watcher_configs_tenant" ON watcher_configs
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT p.tenant_id FROM user_profiles p WHERE p.id = auth.uid()
    )
  );
