-- Intacct RECORDNO storage: stores the Intacct record numbers returned for each successful submission.
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS intacct_record_nos TEXT[];
ALTER TABLE job_errors ADD COLUMN IF NOT EXISTS intacct_record_no TEXT;
