-- ============================================================
-- Mysoft Integration Platform — Enterprise Resilience Layer
-- Migration 031: Source artefacts, step/item/event tables,
--                retry columns, job status expansion, pg_cron
--
-- Design principles:
--   • Zero breaking changes — all existing columns/statuses kept
--   • Additive only — new columns nullable with safe defaults
--   • Supabase pg_cron for stale-claim recovery (Vercel Hobby safe)
-- ============================================================

-- ── 1. Expand job statuses ────────────────────────────────────────────────────
-- Drop the old inline CHECK, add an inclusive replacement.
-- The constraint name matches Postgres auto-naming convention for inline checks.
-- We use a DO block to drop whatever constraint exists by querying pg_constraint.

DO $$
DECLARE
  _constraint_name text;
BEGIN
  SELECT conname INTO _constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.upload_jobs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.upload_jobs DROP CONSTRAINT %I', _constraint_name);
  END IF;
END $$;

ALTER TABLE public.upload_jobs
  ADD CONSTRAINT upload_jobs_status_check CHECK (status IN (
    -- Legacy statuses (kept for backward compat)
    'pending',
    'processing',
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled',
    'awaiting_approval',
    -- New orchestration statuses
    'queued',          -- accepted, waiting for a worker to claim
    'claimed',         -- a worker has locked this job
    'awaiting_retry',  -- transient failure, back-off timer running
    'partially_completed', -- some items succeeded, some failed
    'dead_letter'      -- max retries exhausted, manual intervention required
  ));

-- ── 2. Resilience + orchestration columns on upload_jobs ─────────────────────

ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS trace_id           text,
  ADD COLUMN IF NOT EXISTS priority           int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS claimed_by         text,             -- worker instance ID
  ADD COLUMN IF NOT EXISTS claimed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts       int NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS next_attempt_at    timestamptz,
  ADD COLUMN IF NOT EXISTS error_category     text CHECK (error_category IN ('transient','data','configuration','system')),
  ADD COLUMN IF NOT EXISTS last_error_code    text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS source_artefact_id uuid;             -- FK set after table created

-- Generate trace_id for existing rows
UPDATE public.upload_jobs SET trace_id = gen_random_uuid()::text WHERE trace_id IS NULL;

-- Indexes for worker claim polling (performance-critical)
CREATE INDEX IF NOT EXISTS idx_upload_jobs_worker_claim
  ON public.upload_jobs (priority DESC, next_attempt_at ASC)
  WHERE status IN ('queued', 'awaiting_retry');

CREATE INDEX IF NOT EXISTS idx_upload_jobs_stale_claims
  ON public.upload_jobs (claimed_at)
  WHERE status IN ('claimed', 'processing') AND claimed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_upload_jobs_trace_id
  ON public.upload_jobs (trace_id);

-- ── 3. source_artefacts ───────────────────────────────────────────────────────
-- Immutable record of every inbound payload, decoupled from job outcome.

CREATE TABLE IF NOT EXISTS public.source_artefacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_method    text NOT NULL CHECK (source_method IN ('manual','sftp','http_push','agent')),
  content_type     text,                    -- e.g. text/csv
  storage_location text,                    -- path in 'uploads' bucket
  original_filename text,
  remote_path      text,                    -- SFTP remote path if applicable
  source_endpoint  text,                    -- HTTP push endpoint path if applicable
  received_at      timestamptz NOT NULL DEFAULT now(),
  file_hash        text,                    -- SHA-256 of raw content
  file_size        bigint,
  encoding         text,
  schema_hint      text,                    -- e.g. 'csv_with_headers', 'json_array'
  raw_metadata_json jsonb,                  -- source-specific metadata
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.source_artefacts IS
  'Immutable record of every inbound payload, independent of processing outcome.';

CREATE INDEX IF NOT EXISTS idx_source_artefacts_tenant_id  ON public.source_artefacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_source_artefacts_file_hash  ON public.source_artefacts (file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_artefacts_received_at ON public.source_artefacts (received_at DESC);

-- Now add the FK from upload_jobs
ALTER TABLE public.upload_jobs
  ADD CONSTRAINT fk_upload_jobs_source_artefact
  FOREIGN KEY (source_artefact_id) REFERENCES public.source_artefacts(id) ON DELETE SET NULL
  NOT VALID;  -- NOT VALID skips back-fill scan on existing rows, validate separately

-- ── 4. job_steps ─────────────────────────────────────────────────────────────
-- Persisted record for every stage executed (or attempted) in a job.

CREATE TABLE IF NOT EXISTS public.job_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.upload_jobs(id) ON DELETE CASCADE,
  sequence        int  NOT NULL,            -- 1-based execution order
  step_type       text NOT NULL CHECK (step_type IN (
                    'ingest','parse','validate_source','validate_template',
                    'transform','enrich','build_payload','submit',
                    'attach_documents','reconcile','complete'
                  )),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending','running','completed','failed','skipped'
                  )),
  attempt_count   int  NOT NULL DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     int GENERATED ALWAYS AS (
                    CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (completed_at - started_at))::int * 1000
                    ELSE NULL END
                  ) STORED,
  error_category  text CHECK (error_category IN ('transient','data','configuration','system')),
  error_code      text,
  error_message   text,
  metrics_json    jsonb,                    -- step-specific counters (rows parsed, rows submitted, etc.)
  metadata_json   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id, sequence)
);

COMMENT ON TABLE public.job_steps IS
  'Persisted step record for every stage of every job. Enables step-level retry and timeline views.';

CREATE TRIGGER set_job_steps_updated_at
  BEFORE UPDATE ON public.job_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_job_steps_job_id  ON public.job_steps (job_id);
CREATE INDEX IF NOT EXISTS idx_job_steps_status  ON public.job_steps (status) WHERE status IN ('running','failed');

-- ── 5. job_items ─────────────────────────────────────────────────────────────
-- One row per source record (CSV row / JSON object / logical unit).
-- Enables per-item retry, partial completion, and precision support diagnostics.

CREATE TABLE IF NOT EXISTS public.job_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                 uuid NOT NULL REFERENCES public.upload_jobs(id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_key               text,             -- business key (e.g. invoice number, vendor ID)
  item_sequence          int,              -- 1-based position within the job
  source_row_number      int,              -- original CSV/XLSX row number (1=header, 2=first data)
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN (
                           'pending','parsed','validated','transformed',
                           'submitted','posted','failed','reprocessable','skipped'
                         )),
  idempotency_key        text,             -- tenant + item_key + template_version hash
  validation_errors_json jsonb,            -- array of {field, message} objects
  transformed_payload_json jsonb,          -- mapped field→value after transform step
  endpoint_payload_json  jsonb,            -- final payload sent to connector
  endpoint_record_id     text,             -- Intacct RECORDNO or equivalent
  endpoint_response_json jsonb,            -- raw connector response (truncated)
  error_category         text CHECK (error_category IN ('transient','data','configuration','system')),
  error_code             text,
  error_message          text,
  reprocessable          boolean NOT NULL DEFAULT false,
  posted_at              timestamptz,
  metadata_json          jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_items IS
  'One row per processable unit within a job. Enables item-level retry, partial success, and diagnostics.';

CREATE TRIGGER set_job_items_updated_at
  BEFORE UPDATE ON public.job_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_job_items_job_id          ON public.job_items (job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_tenant_id        ON public.job_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status           ON public.job_items (status);
CREATE INDEX IF NOT EXISTS idx_job_items_idempotency_key  ON public.job_items (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_items_reprocessable    ON public.job_items (job_id) WHERE reprocessable = true;

-- ── 6. job_events ─────────────────────────────────────────────────────────────
-- Append-only audit trail. Never updated; only inserted.
-- Replaces the mutable processing_log JSON column with a relational structure.

CREATE TABLE IF NOT EXISTS public.job_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.upload_jobs(id) ON DELETE CASCADE,
  job_step_id   uuid REFERENCES public.job_steps(id) ON DELETE SET NULL,
  job_item_id   uuid REFERENCES public.job_items(id) ON DELETE SET NULL,
  event_type    text NOT NULL,             -- e.g. job_queued, step_started, item_posted, retry_scheduled
  severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','success')),
  message       text NOT NULL,
  metadata_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_events IS
  'Append-only audit log for all job lifecycle events. Never updated, only inserted.';

CREATE INDEX IF NOT EXISTS idx_job_events_job_id     ON public.job_events (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_events_step_id    ON public.job_events (job_step_id) WHERE job_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_events_item_id    ON public.job_events (job_item_id) WHERE job_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_events_event_type ON public.job_events (event_type);

-- ── 7. RLS policies for new tables ───────────────────────────────────────────

ALTER TABLE public.source_artefacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_steps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events       ENABLE ROW LEVEL SECURITY;

-- source_artefacts
CREATE POLICY "Platform admins view all artefacts"
  ON public.source_artefacts FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Tenant users view own artefacts"
  ON public.source_artefacts FOR SELECT USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY "Service role manages all artefacts"
  ON public.source_artefacts FOR ALL USING (true) WITH CHECK (true);

-- job_steps
CREATE POLICY "Platform admins view all steps"
  ON public.job_steps FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Tenant users view own job steps"
  ON public.job_steps FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.upload_jobs WHERE tenant_id = public.get_my_tenant_id()
    )
  );
CREATE POLICY "Service role manages all steps"
  ON public.job_steps FOR ALL USING (true) WITH CHECK (true);

-- job_items
CREATE POLICY "Platform admins view all items"
  ON public.job_items FOR SELECT USING (public.is_platform_admin());
CREATE POLICY "Tenant users view own job items"
  ON public.job_items FOR SELECT USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY "Service role manages all items"
  ON public.job_items FOR ALL USING (true) WITH CHECK (true);

-- job_events
CREATE POLICY "Platform admins view all events"
  ON public.job_events FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY "Tenant users view own job events"
  ON public.job_events FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.upload_jobs WHERE tenant_id = public.get_my_tenant_id()
    )
  );
CREATE POLICY "Service role manages all events"
  ON public.job_events FOR ALL USING (true) WITH CHECK (true);

-- ── 8. Stale claim recovery function ─────────────────────────────────────────
-- Runs via pg_cron every 5 minutes inside the DB.
-- Releases jobs claimed by workers that crashed/timed out.
-- Vercel Hobby-safe: runs entirely in Supabase, zero Vercel cron budget used.

CREATE OR REPLACE FUNCTION public.recover_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _stale_threshold constant interval := interval '10 minutes';
  _recovered int := 0;
BEGIN
  -- Release stale claimed/processing jobs back to queued or awaiting_retry
  WITH stale AS (
    UPDATE public.upload_jobs
    SET
      status         = CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'awaiting_retry' END,
      claimed_by     = NULL,
      claimed_at     = NULL,
      next_attempt_at = CASE
                          WHEN attempt_count >= max_attempts THEN NULL
                          ELSE now() + (interval '1 minute' * LEAST(POWER(3, attempt_count)::int, 60))
                        END,
      error_category = 'system',
      last_error_code    = 'STALE_CLAIM',
      last_error_message = 'Worker claim expired without completion — released by stale recovery'
    WHERE
      status IN ('claimed', 'processing')
      AND claimed_at < now() - _stale_threshold
    RETURNING id, tenant_id
  )
  SELECT count(*) INTO _recovered FROM stale;

  -- Append a job_event for each recovered job
  INSERT INTO public.job_events (job_id, event_type, severity, message, metadata_json)
  SELECT
    j.id,
    'stale_claim_recovered',
    'warn',
    'Stale worker claim released by pg_cron recovery',
    jsonb_build_object('recovered_at', now(), 'threshold_minutes', 10)
  FROM public.upload_jobs j
  WHERE j.last_error_code = 'STALE_CLAIM'
    AND j.updated_at > now() - interval '1 minute';

END;
$$;

COMMENT ON FUNCTION public.recover_stale_jobs() IS
  'Called by pg_cron every 5 minutes to release stale worker claims.';

-- ── 9. Schedule stale recovery via pg_cron ───────────────────────────────────
-- Requires the pg_cron extension (enabled by default on Supabase).
-- This runs at the DB level — completely independent of Vercel cron limits.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any existing schedule with this name before re-adding
    PERFORM cron.unschedule('mip-stale-recovery')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'mip-stale-recovery'
    );

    PERFORM cron.schedule(
      'mip-stale-recovery',
      '*/5 * * * *',                        -- every 5 minutes
      'SELECT public.recover_stale_jobs()'
    );
  END IF;
END $$;

-- ── 10. Retry scheduling function ────────────────────────────────────────────
-- Computes the next_attempt_at timestamp using capped exponential backoff.
-- Attempt 1: immediate  Attempt 2: +5m  Attempt 3: +15m  Attempt 4: +60m  5+: DLQ

CREATE OR REPLACE FUNCTION public.next_retry_at(p_attempt_count int)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_attempt_count
    WHEN 0 THEN now()
    WHEN 1 THEN now() + interval '5 minutes'
    WHEN 2 THEN now() + interval '15 minutes'
    WHEN 3 THEN now() + interval '60 minutes'
    ELSE         now() + interval '60 minutes'   -- capped; caller checks max_attempts
  END;
$$;

COMMENT ON FUNCTION public.next_retry_at(int) IS
  'Returns the next retry timestamp for a given attempt count (exponential backoff, capped at 60m).';

-- ── 11. Job claim function ────────────────────────────────────────────────────
-- Atomic single-row claim: prevents two workers racing for the same job.
-- Returns the claimed job row, or NULL if nothing available.

CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id text)
RETURNS public.upload_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _job public.upload_jobs;
BEGIN
  SELECT * INTO _job
  FROM public.upload_jobs
  WHERE status IN ('queued', 'awaiting_retry', 'pending')  -- pending = legacy compat
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;                   -- SKIP LOCKED: atomic, no contention

  IF _job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.upload_jobs
  SET
    status      = 'claimed',
    claimed_by  = p_worker_id,
    claimed_at  = now(),
    attempt_count = attempt_count + 1
  WHERE id = _job.id;

  SELECT * INTO _job FROM public.upload_jobs WHERE id = _job.id;

  -- Emit claim event
  INSERT INTO public.job_events (job_id, event_type, severity, message, metadata_json)
  VALUES (_job.id, 'job_claimed', 'info',
    format('Job claimed by worker %s (attempt %s)', p_worker_id, _job.attempt_count),
    jsonb_build_object('worker_id', p_worker_id, 'attempt', _job.attempt_count)
  );

  RETURN _job;
END;
$$;

COMMENT ON FUNCTION public.claim_next_job(text) IS
  'Atomically claims the highest-priority eligible job for a worker. Returns NULL if none available.';
