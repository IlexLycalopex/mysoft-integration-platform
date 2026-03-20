# Technical Handover — Mysoft Integration Platform

**Last updated:** March 2026
**Status:** Core improvements build complete — Phase 3 + 7 UX/security improvements shipped; platform in active rollout
**Prepared for:** Incoming developer / maintainer / product-lifecycle team

---

## 1. Project Overview

The Mysoft Integration Platform (MIP) is a multi-tenant SaaS web application that automates the ingestion of finance and payroll data into Sage Intacct. Built for Mysoft Ltd to replace manual, error-prone upload workflows with a managed, auditable, and scalable pipeline.

Key user journeys:
- A customer's Windows server runs the MIP Agent, watches a folder, picks up a payroll export CSV, and uploads it via REST API.
- The platform auto-processes the job: parses the CSV, applies field mapping, groups rows into GLBATCH transactions, and posts to Intacct via the XML Gateway.
- If the tenant has `approval_required` enabled, the job enters `awaiting_approval` and must be approved before processing begins.
- The job record is updated with status, row counts, entity used, and RECORDNOs returned by Intacct.
- Tenant users review the processing log, inspect errors, and re-submit failed rows.
- Platform admins have a separate admin shell to manage tenants, users, branding, usage, and platform-level credentials.

---

## 2. Live Environment

| Item | Value |
|------|-------|
| Production URL | https://mysoft-integration-platform.vercel.app |
| Hosting | Vercel — auto-deployed from `main` branch |
| Database | Supabase (PostgreSQL + RLS) |
| Storage | Supabase Storage — `uploads` bucket (private) |
| Email | Resend |
| Intacct | Sage Intacct XML Gateway |

**Deployment notes:**
- Vercel deploys automatically on push to `main`. Build takes ~3 minutes.
- Jobs triggered immediately after a push may run against the previous build's code — wait for the deployment to complete before testing.
- All environment variables are set in Vercel → Project → Settings → Environment Variables.

---

## 3. Architecture Overview

```
+------------------+        +------------------+        +-------------------+
|  Browser / UI    |        |  Windows Agent   |        |  External system  |
|  (Next.js SSR)   |        |  (.NET 8 Worker) |        |  (direct API call)|
+--------+---------+        +--------+---------+        +---------+---------+
         |                           |                            |
         | HTTPS                     | HTTPS (Bearer mip_...)     | HTTPS
         v                           v                            v
+--------+-----------------------------------------------------------+
|                     Vercel (Next.js 15 App Router)                 |
|                                                                    |
|  app/(dashboard)/...     — authenticated UI pages (SSR)            |
|  app/(auth)/...          — login / sign-up                         |
|  app/api/v1/ingest          — POST: multipart upload + auto-process |
|  app/api/v1/ingest/check   — POST: pre-flight duplicate/limit check |
|  app/api/v1/jobs/[id]/status — GET: poll job status                |
|  app/api/v1/config          — GET: agent watcher config            |
|  app/api/v1/heartbeat       — POST: agent heartbeat                |
|  app/api/v1/check           — POST: simple duplicate check         |
|  app/api/jobs/[id]/process — job processing pipeline               |
|  app/api/jobs/[id]/approve — approve awaiting_approval job         |
|  app/api/jobs/[id]/reject  — reject awaiting_approval job          |
|  app/api/intacct/*       — Intacct helpers (locations, set-entity) |
|  app/api/cron/*          — retention, usage-snapshot, health-check |
|                                                                    |
|  lib/intacct/client.ts   — Intacct XML Gateway client              |
|  lib/intacct/processor.ts— full processing pipeline                |
|  lib/crypto.ts           — AES-256-GCM encrypt/decrypt             |
|  lib/branding.ts         — getTenantBranding() server helper       |
|  lib/tenant-context.ts   — sandbox context resolution              |
+--------+---------------------------+------------------------------+
         |                           |
         | SQL + RLS                 | Storage (bucket: uploads)
         v                           v
+--------+---------------------------+
|          Supabase (PostgreSQL)      |
|  tenants, user_profiles,           |
|  upload_jobs, field_mappings,       |
|  api_keys, watcher_configs,        |
|  job_errors, audit_log,            |
|  tenant_credentials,               |
|  platform_credentials,             |
|  plans, tenant_usage_monthly,      |
|  tenant_branding                   |
+-------------------------------------+
         |
         | XML Gateway HTTPS
         v
+--------+--------+
|  Sage Intacct   |
|  (XML Gateway)  |
+-----------------+
```

**Key design decisions:**

1. **No job queue** — Auto-processing uses a background `fetch()` from within `/api/v1/ingest` to `/api/jobs/[id]/process`. This stays within Vercel's 60-second function timeout and avoids Redis, queues, or Edge Functions. The background fetch is fire-and-forget; ingest returns `201` immediately.

2. **No Supabase Edge Functions in the processing path** — `supabase/functions/process-job/` is deprecated. Processing was moved to inline Next.js in Sprint 4. Simpler to deploy, debug, and test locally.

3. **Entity scoping via `<locationid>` in Intacct login** — The entity ID is passed inside the `<login>` block in every session request. It must appear *after* `<password>` in the XML — order matters.

4. **RECORDNO in `result.key`** — Sage Intacct returns the created RECORDNO in `result.key`, not `result.data[0].RECORDNO`.

5. **AES-256-GCM for credentials** — All per-tenant and platform credentials are encrypted with AES-256-GCM. Key lives only in `CREDENTIAL_ENCRYPTION_KEY`. If this key is lost, all stored credentials are unrecoverable.

6. **RLS everywhere** — Every table has RLS policies. The service role key bypasses RLS (server-side only). API routes (`/api/v1/*`, `/api/jobs/*`, `/api/intacct/*`, `/api/cron/*`) enforce tenant scoping programmatically.

7. **Inline CSS variables for branding** — The dashboard layout SSR-renders tenant branding as a `<style>` block with CSS variable overrides. No client-side flash. Custom CSS from `tenant_branding.custom_css` is appended to the same block.

---

## 4. Authentication & Security

### User Auth
- Supabase Auth handles session management (httpOnly cookies, JWT).
- `proxy.ts` (Next.js middleware) validates the session on every request and redirects unauthenticated users to `/login`.
- Paths excluded from the auth middleware: `/api/v1/*`, `/api/jobs/*`, `/api/intacct/*`, `/api/cron/*` — these use API key or CRON_SECRET auth.
- **Important:** these exclusions must be listed explicitly in `proxy.ts` — failure causes 302 redirects on API routes.

### Row Level Security
- All tables have RLS policies. Reads/writes are scoped to `tenant_id = (current tenant)`.
- Tenant context is resolved from the `mip-tenant-ctx` httpOnly cookie (sandbox switching) + `user_profiles.tenant_id`.

### API Key Auth
- Format: `mip_` + 40 base58 random characters.
- Only the SHA-256 hash is stored in `api_keys.key_hash`.
- On each request: hash the key → look up in `api_keys` where `key_hash = hash AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())` → update `last_used_at`.
- Raw key shown once at creation only.

### Cron Auth
- Cron endpoints (`/api/cron/*`) require `Authorization: Bearer <CRON_SECRET>`.
- Vercel sends this automatically from the cron config when `CRON_SECRET` is set as an environment variable.
- **Never expose cron endpoints publicly without this check.**

### Credential Encryption
- `lib/crypto.ts` exports `encrypt(plaintext)` and `decrypt(ciphertext)`.
- Output format: `iv:authTag:ciphertext` (hex strings, colon-delimited).
- `CREDENTIAL_ENCRYPTION_KEY` must be a 64-char hex string (32 bytes).
- Credentials stored encrypted in `tenant_credentials` (per-tenant) and `platform_credentials` (ISV keys).

### Platform Credentials
- ISV Sender ID and Password stored in `platform_credentials` (one row, platform_super_admin only).
- Loaded at request time by the processing pipeline — not baked into env vars — so they can be rotated without a deployment.

---

## 5. Intacct Integration

### XML Gateway
- All communication via HTTPS POST to `https://api.intacct.com/ia/xml/xmlgw.phtml`.
- Every request: `<request>` → `<control>` (ISV auth) + `<operation>` → `<authentication>` (company login) + `<content>` (function call).
- `fast-xml-parser` for XML parsing. Its `isArray` config **must** include `error`, `result`, `location`, `LOCATION` — without this, single-item arrays are returned as plain objects and cause runtime failures.

### Session Authentication
- Each request creates a new session — no pooling or token reuse.
- `<locationid>` must appear **after** `<password>` in the XML — this is an Intacct requirement.

### Multi-Entity Resolution Chain

Entity ID is resolved via a **three-level priority chain** (highest priority first):

```
1. upload_jobs.entity_id_override   (set at upload time — UI or API)
        ↓ (if null)
2. watcher_configs.entity_id_override  (set in Settings → Watchers)
        ↓ (if null)
3. tenant_credentials.intacct_entity_id_enc  (set in Settings → Integrations)
```

The resolved entity ID is:
- Passed as `<locationid>` in the Intacct login block (scopes the session to that entity)
- Written back to `upload_jobs.entity_id_used` after processing completes (full audit trail)

In `processor.ts`:
```typescript
const effectiveEntityId = jobEntityOverride ?? watcherEntityOverride ?? creds.entityId ?? null;
if (effectiveEntityId) creds = { ...creds, entityId: effectiveEntityId };
```

### Error Codes
| Code | Meaning | Resolution |
|------|---------|------------|
| `XL03000006` | Sender not authorised for Web Services | Intacct Company Admin → Web Services Authorizations → add sender |
| `BL03000018` | Missing required Location dimension | Set Entity ID in tenant credentials or job/watcher override |

### Three Independent Failure Points
Always check at three levels independently:
1. `control.status` — overall request control
2. `operation.authentication.status` — session auth
3. `operation.result.status` — the actual function result

A `control.status = success` response can still have `operation.result.status = failure`.

---

## 6. Processing Pipeline

Full pipeline in `lib/intacct/processor.ts`. Invoked by `POST /api/jobs/[id]/process`.

**Steps:**

1. **Load job** — fetch `upload_jobs` row, verify tenant ownership, check status is `pending` (or bypasses this check if called internally after approval).
2. **Check approval** — if `upload_jobs.requires_approval = true` and not yet approved, insert `awaiting_approval` status and send notification email. Stop.
3. **Update status to `processing`** — set status and log entry.
4. **Fetch tenant branding** — `getTenantBranding(tenantId)` — used for email notifications.
5. **Download file** — fetch CSV from Supabase Storage via `storage_path`.
6. **Parse CSV** — PapaParse into rows using the file header.
7. **Load mapping** — fetch `field_mappings.column_mappings` for the job's `mapping_id`.
8. **Apply mapping** — map source columns to Intacct target fields; apply transforms (date_format, decimal, tr_type, boolean, trim); apply default values.
9. **Resolve entity ID** — apply the three-level priority chain (job override → watcher override → credentials). Mutate `creds.entityId` accordingly.
10. **Load platform credentials** — decrypt `platform_credentials` for ISV sender ID and password.
11. **Group rows** — by transaction type's grouping key (e.g. `journal_symbol + posting_date + description` for journal entries).
12. **Submit to Intacct** — for each group, build XML payload, POST via `client.ts`, parse response, extract RECORDNO from `result.key`.
13. **Record results** — append RECORDNO to `upload_jobs.intacct_record_nos`; log each submission.
14. **Handle errors** — failed batches: insert rows into `job_errors`; log error.
15. **Finalise** — set status to `completed`, `completed_with_errors`, or `failed`; write `processed_count`, `error_count`, `entity_id_used`; write final log entry.

**Auto-process trigger (in `/api/v1/ingest`):**
```typescript
fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${jobId}/process`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
})
// Fire-and-forget — ingest endpoint returns 201 immediately
```

---

## 7. Approval Workflow

Enabled per-tenant: `tenants.settings.approval_required = 'true'` (JSONB field).

**Flow:**
1. File uploaded → job created with `requires_approval = true`.
2. Processor receives job → sets status to `awaiting_approval` → sends notification email to tenant admins.
3. Approver navigates to `/approvals` → sees all `awaiting_approval` jobs.
4. **Approve**: `POST /api/jobs/[id]/approve` → writes `approved_by`, `approved_at` → sets status back to `pending` → triggers processing.
5. **Reject**: `POST /api/jobs/[id]/reject` → writes `rejected_by`, `rejected_at`, `rejection_note` → sets status to `failed`.

Both approval and rejection are captured in the audit log.

---

## 8. Data Retention

- `tenants.file_retention_days` (default: 90) — number of days to keep files in Supabase Storage.
- Nightly cron at `/api/cron/retention` (02:00 UTC):
  1. Queries `upload_jobs` where `completed_at < now() - file_retention_days AND file_deleted_at IS NULL`.
  2. Calls `supabase.storage.from('uploads').remove([storage_path])` for each.
  3. Sets `upload_jobs.file_deleted_at = now()` — job metadata and processing log are preserved.

---

## 9. Usage Metering

- `plans` table: seeded with 4 tiers (free/starter/professional/enterprise). Platform-defined, not tenant-editable.
- `tenants.plan_id` FK → plans. Default: `free`. Set by platform admins.
- Nightly cron at `/api/cron/usage-snapshot` (01:00 UTC): counts jobs, rows processed, and storage bytes per tenant for the current month → upserts `tenant_usage_monthly`.
- `components/usage/UsageBanner.tsx`: rendered in the dashboard layout; shows amber warning at >80% and red at >100% of any plan limit. Silent for unlimited (Enterprise) plans.
- `lib/actions/usage.ts` exports: `getUsageForTenant`, `updateTenantPlan`, `refreshUsageSnapshot`, `listPlans`.

---

## 10. White Labelling

- `tenant_branding` table (one row per tenant, optional): `brand_name`, `logo_url`, `favicon_url`, `primary_color`, `accent_color`, `support_email`, `support_url`, `custom_css`.
- `lib/branding.ts` exports `getTenantBranding(tenantId)` — uses admin client, falls back to hardcoded defaults if no branding row exists.
- The dashboard layout (`app/(dashboard)/layout.tsx`) fetches branding SSR and injects:
  ```html
  <style>
    :root {
      --primary: #0069B4;   /* tenant primary_color */
      --accent: #00A3E0;    /* tenant accent_color */
    }
    /* tenant custom_css appended here */
  </style>
  ```
- `components/layout/Sidebar.tsx` shows tenant `logo_url` and `brand_name` instead of Mysoft defaults.
- `lib/email.ts` uses `brand_name` in email subjects and bodies when available.
- `lib/intacct/processor.ts` fetches branding once per job and passes it to notification email helpers.

---

## 11. Date Handling

All date parsing via `normaliseDate()` in `lib/intacct/processor.ts`.

**Supported input formats:**

| Format | Example | Notes |
|--------|---------|-------|
| `DD/MM/YYYY` | `31/03/2026` | Default (UK) |
| `MM/DD/YYYY` | `03/31/2026` | US region tenants |
| `YYYY-MM-DD` | `2026-03-31` | ISO 8601 |
| `DD-MM-YYYY` | `31-03-2026` | Dash separator |
| `DD.MM.YYYY` | `31.03.2026` | Dot separator |
| Excel serial | `46116` | Days since 1900-01-01 (with Lotus 1-2-3 leap year bug correction) |

**Output:** `MM/DD/YYYY` — required by the Intacct XML Gateway.

**Region detection:** `tenants.region = 'us'` → ambiguous `XX/XX/XXXX` values parsed as `MM/DD/YYYY`. Otherwise `DD/MM/YYYY` assumed.

---

## 12. Standard Templates (10 types)

All seeded by migrations 005, 013, and 015b. `tenant_id = NULL`, `is_template = true`.

| Template | Transaction Type | Intacct Object | Migration |
|----------|-----------------|---------------|-----------|
| Standard Journal Entry | `journal_entry` | `GLBATCH` | 005 |
| Standard AR Invoice | `ar_invoice` | `ARINVOICE` | 005 |
| Standard AP Bill | `ap_bill` | `APBILL` | 005 |
| Standard Expense Report | `expense_report` | `EEXPENSES` | 005 |
| Payroll Journal | `journal_entry` | `GLBATCH` | 013 |
| AR Payment / Cash Receipt | `ar_payment` | `ARPYMT` | 013 |
| AP Payment | `ap_payment` | `APPYMT` | 013 |
| Timesheet | `timesheet` | `TIMESHEET` | 015b |
| Vendor Import | `vendor` | `VENDOR` | 015b |
| Customer Import | `customer` | `CUSTOMER` | 015b |

Full column definitions: [`csv-format.md`](csv-format.md).

---

## 13. API Reference

### Authentication

All `/api/v1/*`, `/api/jobs/*`, and `/api/intacct/*` endpoints use API key auth:
```
Authorization: Bearer mip_<key>
```

Cron endpoints use:
```
Authorization: Bearer <CRON_SECRET>
```

### v1 Public Endpoints (API key scoped to tenant)

#### `POST /api/v1/ingest/check`
Pre-flight: duplicate detection + usage limit check before uploading. Run this before transferring large files.

**Request (JSON):** `{ "sha256": "hex...", "filename": "payroll.csv" }`

| Response | Status | Body |
|----------|--------|------|
| File is new, within limits | 200 | `{ "exists": false }` |
| File already submitted | 200 | `{ "exists": true, "jobId": "uuid", "status": "...", "processedAt": "ISO8601" }` |
| Usage limit exceeded | 402 | `{ "error": "...", "overLimit": true }` |

---

#### `POST /api/v1/ingest`
Upload a file and create a processing job.

**Request:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `file` | ✅ | File content (binary) |
| `filename` | ✅ | Original filename |
| `sha256` | ✅ | Client-computed SHA-256 hex of the file |
| `mappingId` | | UUID of the mapping; triggers auto-process |
| `watcherConfigId` | | UUID of the watcher (sets mapping + auto-process from config) |
| `sourceType` | | `agent` (default) or `sftp_poll` |

| Response | Status | Body |
|----------|--------|------|
| Accepted, queued | 200 | `{ "jobId": "uuid", "status": "pending", "autoProcess": false }` |
| Accepted, processing triggered | 200 | `{ "jobId": "uuid", "status": "processing", "autoProcess": true }` |
| Duplicate file | 409 | `{ "error": "Duplicate file", "jobId": "uuid", "status": "..." }` |
| Usage limit exceeded | 402 | `{ "error": "..." }` |

---

#### `GET /api/v1/jobs/{id}/status`
Poll job status. Scope-checked: the job must belong to the authenticated tenant.

**Response 200:**
```json
{
  "jobId": "uuid",
  "status": "completed",
  "rowsProcessed": 142,
  "rowsErrored": 3,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

#### `GET /api/v1/config`
Fetch enabled watcher configurations for the tenant's agent.

**Response 200:**
```json
{
  "watchers": [{
    "id": "uuid",
    "name": "Payroll Exports",
    "sourceType": "folder",
    "folderPath": "C:\\Exports\\Payroll",
    "filePattern": "*.csv",
    "mappingId": "uuid",
    "archiveAction": "move",
    "archiveFolder": "C:\\Exports\\Archive",
    "pollInterval": 60,
    "autoProcess": true
  }]
}
```

---

#### `POST /api/v1/heartbeat`
Agent heartbeat. Updates `api_keys.last_used_at` — drives Online/Idle/Offline badge in Platform UI.

**Request:** empty body accepted. **Response 200:** `{ "ok": true }`

---

#### `POST /api/v1/check`
Simpler duplicate-only check (no usage limit check). Returns `{ isDuplicate: bool, existingJobId?: uuid }`.

---

#### `POST /api/v1/push/:token`
HTTP push receiver. Accepts a file from any external system that knows the per-watcher push token. **No API key required** — the token in the URL is the credential.

The server computes SHA-256 server-side; the caller does not need to pre-compute it.

**Request:** `multipart/form-data`

| Field | Required | Description |
|-------|----------|-------------|
| `file` | ✅ | Binary file content |
| `filename` | | Override filename; defaults to the file field name |

| Response | Status | Body |
|----------|--------|------|
| Accepted, queued | 200 | `{ "jobId": "uuid", "status": "pending", "autoProcess": false }` |
| Accepted, auto-processing | 200 | `{ "jobId": "uuid", "status": "processing", "autoProcess": true }` |
| Duplicate | 409 | `{ "isDuplicate": true, "jobId": "uuid", "status": "..." }` |
| Pattern mismatch | 422 | `{ "error": "Filename does not match required pattern: *.csv" }` |

Push tokens are UUIDs stored in `watcher_configs.push_token`. In the UI, they are hidden behind a reveal pattern to prevent shoulder-surfing.

---

### Internal API Endpoints (session auth, internal use only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/[id]/process` | Trigger processing; called by ingest auto-process or UI |
| `POST` | `/api/jobs/[id]/approve` | Approve awaiting_approval job → triggers processing |
| `POST` | `/api/jobs/[id]/reject` | Reject with optional note → sets status to failed |
| `POST` | `/api/jobs/[id]/reprocess` | Re-submit a failed job |
| `GET`  | `/api/intacct/locations` | List Intacct entities for the dropdown in Settings |
| `POST` | `/api/intacct/set-entity` | Save entity ID choice |

---

## 14. Database Schema

### `tenants`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `name` | text | Display name |
| `slug` | text | URL-safe identifier |
| `status` | text | `active`, `trial`, `suspended` |
| `is_sandbox` | boolean | True for sandbox environments |
| `sandbox_of` | uuid FK | Points to production tenant if sandbox |
| `region` | text | `uk` or `us` — affects date parsing |
| `settings` | jsonb | Per-tenant settings; `approval_required: 'true'` to enable approval workflow |
| `file_retention_days` | int | Days to keep files in Storage (default: 90) |
| `plan_id` | text FK → plans | Active plan (default: `free`) |
| `plan_assigned_at` | timestamptz | When plan was last changed |
| `trial_ends_at` | timestamptz | For trial plans |

### `plans`
| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | `free`, `starter`, `professional`, `enterprise` |
| `name` | text | Display name |
| `max_jobs_per_month` | int | NULL = unlimited |
| `max_rows_per_month` | int | NULL = unlimited |
| `max_storage_mb` | int | NULL = unlimited |
| `max_watchers` | int | |
| `max_api_keys` | int | |
| `max_users` | int | |
| `price_gbp_monthly` | numeric | NULL for Enterprise (custom pricing) |
| `features` | text[] | Feature flags (e.g. `dry_run`, `webhooks`, `approval_workflow`) |

### `tenant_usage_monthly`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `year_month` | text | `YYYY-MM` (e.g. `2026-03`) |
| `jobs_count` | int | |
| `rows_processed` | bigint | |
| `storage_bytes` | bigint | |
| `computed_at` | timestamptz | When this snapshot was last computed |

### `tenant_branding`
| Column | Type | Description |
|--------|------|-------------|
| `tenant_id` | uuid PK FK | One row per tenant |
| `brand_name` | text | Replaces "Mysoft Integration Platform" in UI and emails |
| `logo_url` | text | Must start with `https://` |
| `favicon_url` | text | Must start with `https://` |
| `primary_color` | text | Hex colour (e.g. `#0069B4`) |
| `accent_color` | text | Hex colour (e.g. `#00A3E0`) |
| `support_email` | text | |
| `support_url` | text | |
| `custom_css` | text | Injected into `<style>` tag — no sandboxing |
| `updated_by` | uuid FK → auth.users | |
| `updated_at` | timestamptz | |

### `upload_jobs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `filename` | text | |
| `storage_path` | text | Path in Supabase Storage `uploads` bucket |
| `file_size` | bigint | Bytes |
| `mime_type` | text | |
| `status` | text | `pending`, `processing`, `completed`, `completed_with_errors`, `failed`, `awaiting_approval`, `cancelled` |
| `mapping_id` | uuid FK → field_mappings | |
| `row_count` | int | Total rows |
| `processed_count` | int | Successfully processed |
| `error_count` | int | Failed rows |
| `sha256` | text | For deduplication |
| `source_type` | text | `manual`, `agent`, `sftp_poll` |
| `auto_process` | boolean | |
| `watcher_config_id` | uuid FK | |
| `entity_id_override` | text | Job-level entity ID override |
| `entity_id_used` | text | Resolved entity ID written after processing |
| `intacct_record_nos` | jsonb | Array of RECORDNOs from Intacct |
| `processing_log` | jsonb | Array of `ProcessingLogEntry` |
| `requires_approval` | boolean | Set when approval_required is enabled at upload time |
| `approved_by` | uuid FK → auth.users | |
| `approved_at` | timestamptz | |
| `rejected_by` | uuid FK → auth.users | |
| `rejected_at` | timestamptz | |
| `rejection_note` | text | |
| `file_deleted_at` | timestamptz | Set when retention cron removes the file |

### `watcher_configs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `name` | text | |
| `source_type` | text | `local_folder`, `sftp`, or `http_push` |
| `folder_path` | text | For local_folder watchers |
| `sftp_host` | text | SFTP hostname |
| `sftp_port` | int | Default 22 |
| `sftp_username` | text | |
| `sftp_password_enc` | text | AES-256-GCM encrypted |
| `sftp_remote_path` | text | Remote directory to poll |
| `push_token` | uuid | Token embedded in HTTP push URL (`/api/v1/push/{token}`) |
| `file_pattern` | text | Glob (e.g. `payroll_*.csv`) |
| `mapping_id` | uuid FK | |
| `entity_id_override` | text | Watcher-level entity ID override |
| `archive_action` | text | `move`, `delete`, `leave` |
| `archive_folder` | text | Destination for `move` |
| `poll_interval` | int | Seconds |
| `auto_process` | boolean | |
| `enabled` | boolean | |

### `watcher_execution_logs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `watcher_id` | uuid FK → watcher_configs | |
| `tenant_id` | uuid FK | |
| `ran_at` | timestamptz | When the execution completed |
| `source_type` | text | `sftp_poll`, `http_push`, or `agent_push` |
| `files_found` | int | Files matching the pattern (SFTP only) |
| `files_ingested` | int | New files accepted and uploaded as jobs |
| `files_skipped` | int | Duplicate files (SHA-256 already seen) |
| `files_rejected` | int | Pattern mismatch or processing errors |
| `error_message` | text | NULL on success |
| `duration_ms` | int | Execution time in milliseconds |

### `tenant_credentials`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK UNIQUE | One row per tenant |
| `intacct_company_id_enc` | text | AES-256-GCM encrypted |
| `intacct_user_id_enc` | text | AES-256-GCM encrypted |
| `intacct_password_enc` | text | AES-256-GCM encrypted |
| `intacct_entity_id_enc` | text | AES-256-GCM encrypted (optional) |

### `platform_credentials`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `sender_id_enc` | text | Encrypted ISV Sender ID |
| `sender_password_enc` | text | Encrypted ISV Sender Password |
| `updated_at` | timestamptz | |

### `field_mappings`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | NULL for platform templates |
| `name` | text | |
| `description` | text | |
| `column_mappings` | jsonb | Array of `{ id, source_column, target_field, transform?, required? }` |
| `is_template` | boolean | Platform-managed |
| `is_default` | boolean | |
| `template_status` | text | `draft`, `published` (templates only) |
| `transaction_type` | text | `journal_entry`, `ar_invoice`, `ap_bill`, `expense_report`, `ar_payment`, `ap_payment`, `timesheet`, `vendor`, `customer` |

### `job_errors`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `job_id` | uuid FK | |
| `tenant_id` | uuid FK | |
| `row_number` | int | Original CSV row number |
| `original_data` | jsonb | Raw row values before mapping |
| `mapped_data` | jsonb | Mapped values attempted |
| `error_message` | text | Intacct or validation error |
| `status` | text | `pending`, `retried`, `dismissed` |

### `api_keys`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `name` | text | Human label |
| `key_hash` | text UNIQUE | SHA-256 of the raw key |
| `key_prefix` | text | First 8 chars for display |
| `last_used_at` | timestamptz | |
| `expires_at` | timestamptz | NULL = non-expiring |
| `revoked_at` | timestamptz | NULL = active |

### `audit_log`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `user_id` | uuid FK | |
| `operation` | text | e.g. `create_upload_job`, `approve_job`, `update_plan` |
| `resource_type` | text | e.g. `upload_job`, `field_mapping` |
| `resource_id` | text | |
| `old_values` | jsonb | |
| `new_values` | jsonb | |
| `created_at` | timestamptz | |

### `webhook_endpoints`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `name` | text | Human label |
| `url` | text | Must be HTTPS |
| `events` | text[] | e.g. `['job.completed', 'job.failed']` |
| `secret` | text | HMAC signing secret (stored plaintext — not encrypted) |
| `enabled` | boolean | |
| `last_triggered_at` | timestamptz | |
| `last_status_code` | int | HTTP status code from last delivery |
| `last_error` | text | Error message if last delivery failed |
| `created_at` | timestamptz | |

### `tenant_subscriptions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `plan_id` | text FK → plans | |
| `status` | text | `active`, `trial`, `cancelled`, `expired` |
| `period_start` | date | |
| `period_end` | date | |
| `discount_pct` | int | 0–100 |
| `is_free_of_charge` | boolean | Overrides price to £0 |
| `effective_price_gbp` | numeric | After discount |
| `commitment_end_date` | date | Minimum contract end date |
| `notes` | text | Internal notes (visible to platform admins) |
| `superseded_by` | uuid FK | Points to newer subscription if changed |
| `created_at` | timestamptz | |
| `created_by` | uuid FK → auth.users | |

---

## 15. Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only — never expose to client) | ✅ |
| `CREDENTIAL_ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM credential encryption | ✅ |
| `RESEND_API_KEY` | Resend API key for transactional email | ✅ |
| `RESEND_FROM_EMAIL` | Sender address (e.g. `Mysoft Integrations <integrations@mysoftx3.com>`) | ✅ |
| `NEXT_PUBLIC_APP_URL` | Full URL of the deployment — no trailing slash | ✅ |
| `CRON_SECRET` | Bearer token protecting cron endpoints | ✅ |

See `.env.local.example` for the template.

---

## 16. Cron Jobs

| Endpoint | Schedule | Auth | What it does |
|----------|----------|------|-------------|
| `/api/cron/health-check` | `*/5 * * * *` | CRON_SECRET | Marks watcher agents online/offline based on recent heartbeats |
| `/api/cron/usage-snapshot` | `0 1 * * *` | CRON_SECRET | Upserts `tenant_usage_monthly` for all tenants |
| `/api/cron/retention` | `0 2 * * *` | CRON_SECRET | Deletes Storage files past `file_retention_days`; sets `file_deleted_at` |
| `/api/cron/trial-expiry` | `0 3 * * *` | CRON_SECRET | Suspends tenants whose trial has ended with no active subscription |
| `/api/cron/subscription-renewal` | `0 4 * * *` | CRON_SECRET | Advances `period_end` on renewal; marks expired subscriptions |
| `/api/cron/offboarding` | `0 5 * * *` | CRON_SECRET | Data purge for tenants in `offboarded` status for ≥ 90 days |

Declared in `vercel.json`. Requires Vercel Pro or higher.

---

## 17. Agent

The Windows Agent is a .NET 8 Worker Service in `agent/MysoftAgent/`. See `agent/README.md` for installation and `agent/docs/deployment-guide.md` for enterprise deployment.

**Behaviour:**
- Calls `GET /api/v1/config` on startup to fetch watcher definitions.
- For each file match: compute SHA-256 → `POST /api/v1/ingest` → archive file.
- Heartbeat: `POST /api/v1/heartbeat` every 5 minutes.
- Config refresh: `GET /api/v1/config` every 10 minutes (no restart needed to pick up watcher changes).

**API key:** generate in Settings → API Keys. Store in Windows Credential Manager or as a system environment variable — not plain-text in `appsettings.json`.

---

## 18. Testing & Simulation

### Test API Key
`mip_simkey_acme_001` exists in the database for the ACME test tenant.

### Creating Unique Test Files
Intacct rejects duplicate transactions. To avoid this:
- Change the `description` field (creates a new GLBATCH grouping key).
- Or change `posting_date`.
- The SHA-256 dedup check is against file content — change at least one byte to avoid the platform duplicate check.

### Curl Examples

**Ingest a file:**
```bash
SHA=$(sha256sum myfile.csv | awk '{print $1}')
curl -X POST "https://mysoft-integration-platform.vercel.app/api/v1/ingest" \
  -H "Authorization: Bearer mip_simkey_acme_001" \
  -F "file=@myfile.csv;type=text/csv" \
  -F "filename=myfile.csv" \
  -F "sha256=$SHA" \
  -F "mappingId=dddddddd-0001-0001-0001-000000000001"
```

**Manually trigger processing:**
```bash
curl -X POST "https://mysoft-integration-platform.vercel.app/api/jobs/{JOB_ID}/process" \
  -H "Authorization: Bearer mip_simkey_acme_001"
```

**List jobs:**
```bash
curl "https://mysoft-integration-platform.vercel.app/api/v1/jobs" \
  -H "Authorization: Bearer mip_simkey_acme_001"
```

---

## 19. Known Issues & Gotchas

| Issue | Detail |
|-------|--------|
| **`fast-xml-parser` isArray config** | Must include `error`, `result`, `location`, `LOCATION`. Without this, single-item arrays are returned as plain objects — silent runtime failures. |
| **`<locationid>` must follow `<password>`** | Intacct login XML requires `<locationid>` after `<password>`. Wrong order → session created without entity scope. |
| **RECORDNO is in `result.key`** | Not in `result.data[0].RECORDNO`. Correct path: `operation.result[0].key`. |
| **Three independent failure points** | Always check `control.status`, `operation.authentication.status`, AND `operation.result[0].status` independently. |
| **XL03000006 — Sender not authorised** | Per-company setting: Intacct Company Admin → Web Services Authorizations → add the Sender ID. |
| **BL03000018 — Missing Location dimension** | GL account requires a Location dimension on each GLENTRY line. Set entity ID via the three-level override chain. |
| **Vercel build lag** | ~3-minute deploy. Jobs triggered immediately after `git push` may run against the old build. Always wait for deploy completion before testing. |
| **Background fetch auth** | The auto-process background `fetch()` must pass the original API key — `/api/jobs/[id]/process` requires API key auth, not a session. |
| **Middleware path exclusions** | `/api/intacct/*`, `/api/jobs/*`, `/api/cron/*` must be explicitly excluded in `proxy.ts` or auth middleware causes 302s. |
| **`CREDENTIAL_ENCRYPTION_KEY` immutability** | Changing this key after tenants have saved credentials makes all credentials unreadable. Store safely. |
| **`custom_css` injection** | The custom CSS from `tenant_branding.custom_css` is injected as-is with no sandboxing — platform admins should review before saving. |
| **Migration 006 gap** | 006 was merged into 005. Do not create a new 006 — it will cause ordering confusion. |
| **Duplicate `015` prefix** | Two migrations carry the `015` prefix: `015_approval_workflow.sql` and `015_new_modules_retention.sql`. Apply approval_workflow first. |
| **`const creds` in processor** | `creds` must be `let` (not `const`) because the multi-entity override mutates it: `creds = { ...creds, entityId: override }`. |
| **SFTP watcher** | `supabase/functions/sftp-poll/` is a skeleton — the Supabase Edge Function is not used. SFTP credentials are stored in `watcher_configs` (encrypted). The `testSftpConnection` server action in `lib/actions/sftp-test.ts` uses `ssh2-sftp-client` for the test-connection UI feature. A server-side poll cron using the same library would follow the same pattern. |
| **`GET /api/v1/jobs` does not exist** | Despite being documented in earlier handover drafts, there is no job-listing v1 endpoint. Only `GET /api/v1/jobs/{id}/status` (individual job) is implemented. Job listing is a roadmap item. |
| **`/api/intacct/locations` response shape** | Returns `{ locations: {id, name}[] }` (normalised). Previously returned raw `IntacctLocation[]` objects with `LOCATIONID/NAME/STATUS` keys — this caused React error #31 in `EntityIdSelect`. Do not change back to raw shape. |
| **`allowed_entity_ids` on user_profiles** | `text[]` column added in migration 026. NULL = no restriction (user can submit to any entity). Non-null = enforced server-side in `createUploadJob`. Only visible to tenant admins in the user management UI. |
| **`webhook_endpoints.secret` not encrypted** | Unlike tenant credentials, the webhook signing secret is stored plaintext. This is intentional (it is a platform-generated random string, not a customer credential) but should be noted for security reviews. |

---

## 20. Roadmap / Next Steps

### Completed (as of March 2026)
- ✅ Phase 1 — Core platform (auth, mappings, processing pipeline, error queue, audit log, sandbox)
- ✅ Phase 2 — Automated ingestion (Windows Agent, REST API, watchers, dedup, pre-flight validation, webhooks, dashboard analytics)
- ✅ Phase 3 — Approval workflow, multi-entity support, new modules (Timesheets, Vendors, Customers), data retention, usage metering + plan tiers, subscription management, white labelling, platform consistency pass
- ✅ Core improvements — HTTP push receiver (`POST /api/v1/push/:token`), SFTP connector (credentials + test), connection test buttons (Intacct + SFTP), watcher execution log (`watcher_execution_logs` table), per-user entity restrictions (`allowed_entity_ids`), HTTP push token reveal/mask UI, audit trail on credential and watcher changes, row quota projection on upload, mapping job-count column

**Current status:** Platform is feature-complete and in active customer rollout.

### Deferred / Upcoming
- **SharePoint folder polling** — via Azure AD app registration
- **Webhook retry with backoff** — currently best-effort, no retries
- **`GET /api/v1/jobs` listing endpoint** — paginated job list via API (currently only individual status available)
- **Sage X3 target** — second integration target; requires new `lib/sage-x3/` client
- **Self-service onboarding wizard** — guided setup for new tenants without platform admin involvement

### Technical Debt
- `processor.ts` is large (~800 lines) — consider splitting into per-transaction-type modules.
- No unit tests for the processing pipeline — `normaliseDate()` and the XML builder are high-value targets.
- `fast-xml-parser` `isArray` workaround is fragile — a more robust Intacct response parser would improve reliability.
- No error alerting — consider Sentry or similar for silent Intacct submission failures in production.
- Webhook delivery is best-effort with no retries — high-volume tenants may miss events during their endpoint downtime.
