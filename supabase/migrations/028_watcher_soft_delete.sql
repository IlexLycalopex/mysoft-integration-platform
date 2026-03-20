-- Migration 028: Soft-delete (archive) support for watcher_configs
-- Replaces hard-delete which fails when upload_jobs references the watcher via FK.
-- Archived watchers are hidden from the UI but retained for audit/FK integrity.

ALTER TABLE watcher_configs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN watcher_configs.archived_at IS
  'Set when a watcher is archived (soft-deleted). NULL = active. '
  'Archived watchers are hidden from the settings UI but retained so '
  'upload_jobs.watcher_config_id foreign key integrity is preserved.';
