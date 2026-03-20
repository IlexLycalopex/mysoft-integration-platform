-- Processing log: stores step-by-step details of each job run for debugging and audit.
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS processing_log JSONB DEFAULT '[]'::jsonb;
