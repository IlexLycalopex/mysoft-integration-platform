-- Migration 045: Fix recover_stale_jobs() to catch jobs with NULL claimed_at
--
-- The original function filtered on `claimed_at < now() - threshold`, but HTTP push
-- jobs enter 'processing' status with claimed_at = NULL (no worker claim step).
-- NULL comparisons always evaluate to false, making these jobs permanently invisible
-- to the recovery function. Fix: use COALESCE(claimed_at, started_at) so that any
-- job that has been in processing/claimed state longer than the threshold is caught.
--
-- Additionally: pg_cron is not available on this Supabase plan, so the function is
-- now called from the Vercel health-check cron route instead of pg_cron.

CREATE OR REPLACE FUNCTION public.recover_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _stale_threshold constant interval := interval '10 minutes';
BEGIN
  WITH stale AS (
    UPDATE public.upload_jobs
    SET
      status             = CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'awaiting_retry' END,
      claimed_by         = NULL,
      claimed_at         = NULL,
      next_attempt_at    = CASE
                             WHEN attempt_count >= max_attempts THEN NULL
                             ELSE now() + (interval '1 minute' * LEAST(POWER(3, attempt_count)::int, 60))
                           END,
      error_category     = 'system',
      last_error_code    = 'STALE_JOB',
      last_error_message = 'Job stalled without completing — released by stale recovery'
    WHERE status IN ('claimed', 'processing')
      AND COALESCE(claimed_at, started_at) < now() - _stale_threshold
    RETURNING id
  )
  INSERT INTO public.job_events (job_id, event_type, severity, message, metadata_json)
  SELECT
    id,
    'stale_job_recovered',
    'warn',
    'Stale job released by recovery (COALESCE claimed_at/started_at)',
    jsonb_build_object('recovered_at', now())
  FROM stale;
END;
$function$;

COMMENT ON FUNCTION public.recover_stale_jobs() IS
  'Releases jobs stuck in claimed/processing for > 10 minutes. Uses COALESCE(claimed_at, started_at)
   so HTTP-push jobs (which skip the claim step and have claimed_at = NULL) are also caught.
   Called by the Vercel health-check cron since pg_cron is not available on this plan.';
