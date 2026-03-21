-- Migration 038: Supporting document attachment support
-- Allows users to upload a supporting document (e.g. PDF invoice) alongside their
-- data file. During processing, the platform calls create_supdoc in Intacct and
-- injects the returned SUPDOCID into every transaction created from the job.
--
-- ROLLBACK:
--   ALTER TABLE upload_jobs
--     DROP COLUMN IF EXISTS attachment_storage_path,
--     DROP COLUMN IF EXISTS attachment_filename,
--     DROP COLUMN IF EXISTS attachment_mime_type,
--     DROP COLUMN IF EXISTS attachment_file_size,
--     DROP COLUMN IF EXISTS supdoc_id,
--     DROP COLUMN IF EXISTS supdoc_folder_name;

ALTER TABLE upload_jobs
  -- The Supabase Storage path of the uploaded supporting document
  ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT,

  -- Original filename of the supporting document (display only)
  ADD COLUMN IF NOT EXISTS attachment_filename      TEXT,

  -- MIME type of the supporting document (e.g. application/pdf)
  ADD COLUMN IF NOT EXISTS attachment_mime_type     TEXT,

  -- File size in bytes
  ADD COLUMN IF NOT EXISTS attachment_file_size     BIGINT,

  -- The SUPDOCID returned by Intacct after create_supdoc is called.
  -- NULL until the supdoc has been successfully created.
  ADD COLUMN IF NOT EXISTS supdoc_id                TEXT,

  -- The Intacct attachment folder name used when creating the supdoc.
  -- Defaults to 'Mysoft Imports' if not specified.
  ADD COLUMN IF NOT EXISTS supdoc_folder_name       TEXT DEFAULT 'Mysoft Imports';

-- Index for quickly finding jobs with attachments (e.g. for retry or audit)
CREATE INDEX IF NOT EXISTS idx_upload_jobs_supdoc_id
  ON upload_jobs (supdoc_id)
  WHERE supdoc_id IS NOT NULL;

COMMENT ON COLUMN upload_jobs.attachment_storage_path IS 'Supabase Storage path for the supporting document uploaded alongside the data file';
COMMENT ON COLUMN upload_jobs.attachment_filename      IS 'Original filename of the supporting document';
COMMENT ON COLUMN upload_jobs.supdoc_id                IS 'Intacct SUPDOCID assigned after create_supdoc — injected into all transactions from this job';
COMMENT ON COLUMN upload_jobs.supdoc_folder_name       IS 'Intacct attachment folder name used for create_supdoc';
