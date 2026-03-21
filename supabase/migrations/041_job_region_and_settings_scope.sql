-- Add region to upload_jobs (denormalized from tenant for efficient regional queries)
ALTER TABLE upload_jobs
  ADD COLUMN region TEXT NOT NULL DEFAULT 'uk'
  CHECK (region IN ('uk', 'us', 'eu'));

-- Backfill existing rows from their tenant's home_region
UPDATE upload_jobs j
SET region = (SELECT home_region FROM tenants WHERE id = j.tenant_id);

-- Auto-set region on insert via trigger
CREATE OR REPLACE FUNCTION set_job_region()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.region := (SELECT home_region FROM tenants WHERE id = NEW.tenant_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_set_job_region
  BEFORE INSERT ON upload_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_region();

-- Index for efficient regional job queries
CREATE INDEX idx_upload_jobs_region ON upload_jobs (region, status);

-- Add scope classification to platform_settings
ALTER TABLE platform_settings
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'
  CHECK (scope IN ('global', 'regional'));

-- Classify existing settings
UPDATE platform_settings SET scope = 'regional'
WHERE key IN (
  'sftp.connection_timeout_ms',
  'sftp.retry_count',
  'jobs.default_supdoc_folder',
  'health.dlq_threshold',
  'health.error_rate_pct',
  'health.agent_offline_minutes'
);

UPDATE platform_settings SET scope = 'global'
WHERE key IN (
  'notifications.support_email',
  'users.invite_ttl_days'
);
