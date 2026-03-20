-- Migration 016: Multi-entity / location ID override
--
-- Allows each watcher config and upload job to target a specific Intacct
-- entity (the <locationid> in the login XML), overriding the credential default.
-- Priority: job.entity_id_override > watcher_config.entity_id_override > credentials.entity_id

-- Watcher-level entity override
ALTER TABLE watcher_configs
  ADD COLUMN IF NOT EXISTS entity_id_override text;

COMMENT ON COLUMN watcher_configs.entity_id_override IS
  'Overrides credentials.entity_id for all jobs produced by this watcher. '
  'Leave NULL to use the credential default.';

-- Job-level entity override (set from watcher config at ingest time, or from manual upload)
ALTER TABLE upload_jobs
  ADD COLUMN IF NOT EXISTS entity_id_override text,
  ADD COLUMN IF NOT EXISTS entity_id_used     text;

COMMENT ON COLUMN upload_jobs.entity_id_override IS
  'Requested entity override at the time of upload (from watcher or manual selection).';
COMMENT ON COLUMN upload_jobs.entity_id_used IS
  'Actual entity ID that was sent to Intacct (resolved: job override > watcher > credential). '
  'Populated by the processor after job completes.';
