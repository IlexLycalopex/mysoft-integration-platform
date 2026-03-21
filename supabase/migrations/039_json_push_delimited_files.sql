-- Migration 039: JSON push source type + delimited file support
--
-- 1. Adds 'json_push' to the upload_jobs.source_type check constraint so that
--    the new POST /api/v1/push-records endpoint can create jobs.
-- 2. No schema changes needed for delimited file support (.txt, .tsv, .psv) —
--    those files are stored + processed like CSV; parsing is handled in code.
--
-- ROLLBACK:
--   See inline steps below.

-- ── upload_jobs.source_type ───────────────────────────────────────────────────
-- Drop the old check constraint (name varies; drop by scanning pg_constraint)
DO $$
DECLARE
  _cname text;
BEGIN
  SELECT c.conname INTO _cname
  FROM   pg_constraint c
  JOIN   pg_class      t ON t.oid = c.conrelid
  WHERE  t.relname = 'upload_jobs'
  AND    c.contype = 'c'
  AND    pg_get_constraintdef(c.oid) ILIKE '%source_type%'
  LIMIT  1;

  IF _cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE upload_jobs DROP CONSTRAINT %I', _cname);
  END IF;
END;
$$;

ALTER TABLE upload_jobs
  ADD CONSTRAINT upload_jobs_source_type_check
  CHECK (source_type IN ('manual', 'agent', 'sftp_poll', 'http_push', 'json_push'));
