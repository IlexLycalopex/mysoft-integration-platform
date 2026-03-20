-- Migration 021: HTTP push receiver + SFTP poll infrastructure
-- Adds push_token (unique URL token for HTTP push receivers) and
-- last_polled_at (SFTP interval tracking) to watcher_configs.
-- Extends source_type enum on both watcher_configs and upload_jobs.

-- ── watcher_configs additions ───────────────────────────────────────────────
ALTER TABLE watcher_configs
  ADD COLUMN IF NOT EXISTS push_token  UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ;

-- Back-fill push_token for any existing rows that somehow have NULL
UPDATE watcher_configs SET push_token = gen_random_uuid() WHERE push_token IS NULL;

-- Drop the existing source_type check constraint (name is auto-generated)
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint c
  JOIN   pg_class     t ON c.conrelid = t.oid
  WHERE  t.relname = 'watcher_configs'
    AND  c.contype = 'c'
    AND  pg_get_constraintdef(c.oid) ILIKE '%source_type%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE watcher_configs DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE watcher_configs
  ADD CONSTRAINT watcher_configs_source_type_check
  CHECK (source_type IN ('local_folder', 'sftp', 'http_push'));

-- ── upload_jobs source_type extension ────────────────────────────────────────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint c
  JOIN   pg_class     t ON c.conrelid = t.oid
  WHERE  t.relname = 'upload_jobs'
    AND  c.contype = 'c'
    AND  pg_get_constraintdef(c.oid) ILIKE '%source_type%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE upload_jobs DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE upload_jobs
  ADD CONSTRAINT upload_jobs_source_type_check
  CHECK (source_type IN ('manual', 'agent', 'sftp_poll', 'http_push'));
