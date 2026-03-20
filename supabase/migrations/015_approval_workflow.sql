-- Migration 015: Approval workflow

-- New columns on upload_jobs
ALTER TABLE upload_jobs
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_note    text;

-- Per-tenant approval setting (stored in tenants.settings JSONB — no schema change needed)
-- We'll read/write tenants.settings->>'approval_required' = 'true'/'false'

-- Index for approval queue queries
CREATE INDEX IF NOT EXISTS upload_jobs_awaiting ON upload_jobs (tenant_id, status)
  WHERE status = 'awaiting_approval';
