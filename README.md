# Mysoft Integration Platform

A multi-tenant SaaS integration platform that automates payroll and finance data ingestion from customer file exports into **Sage Intacct**. Built for Mysoft Ltd to replace manual upload workflows with a managed, auditable, and scalable pipeline.

Live at: **https://mysoft-integration-platform.vercel.app**

---

## What It Does

Customers upload CSV files — manually via the web UI, automatically via the Windows Agent polling a local folder, or programmatically via the REST API. The platform validates, maps, and transforms the data using configurable field mappings, then submits it directly to Sage Intacct via the XML Gateway — with full approval workflow, error handling, audit logging, job status tracking, and a per-job processing log showing every step.

---

## Features

### Authentication & Multi-Tenancy
- Email/password auth via Supabase Auth with secure session management
- Full multi-tenant data isolation using Row Level Security (RLS) — no row is accessible outside the owning tenant
- Role-based access control: `platform_super_admin`, `mysoft_support_admin`, `tenant_admin`, `tenant_operator`, `tenant_auditor`
- Tenant-scoped user management with invite-by-email flow and inline role editing

### Sandbox Environments
- Each production tenant can have a linked **sandbox tenant** — a fully isolated copy for testing
- Platform admins create sandbox tenants from the tenant detail page, with optional mapping clone
- Users toggle Production/Sandbox via a dropdown in the top navigation bar
- Context tracked with an httpOnly cookie (`mip-tenant-ctx`); all queries are automatically scoped

### File Upload & Ingestion
- Drag-and-drop or click-to-upload with 50 MB limit
- **Supported file formats**: CSV (`.csv`), Excel (`.xlsx` / `.xls`), tab-delimited (`.tsv` / `.tab`), pipe-delimited (`.psv`), and plain-text delimited (`.txt` / `.dat` / `.log`)
  - Tab and pipe delimiters are detected from file extension; other text files use PapaParse auto-detection
- Files stored in Supabase Storage (tenant-scoped bucket paths)
- SHA-256 deduplication: identical file content is rejected with a reference to the existing job
- Per-upload entity ID override for multi-entity Intacct environments; entity list populated live from Intacct
- **Row quota projection**: after file validation, the upload page shows projected monthly row usage vs plan limit before submission
- **Per-user entity restrictions**: tenant admins can restrict individual users to a specific set of Intacct entities (`allowed_entity_ids`); enforced at the server action level

### Approval Workflow
- Per-tenant configurable: enable `approval_required` in tenant settings to hold all uploads for review
- Jobs enter `awaiting_approval` status instead of processing immediately
- Approvers (tenant admin / platform admin) see a dedicated **Approvals** queue at `/approvals`
- Approve → triggers processing; Reject → sets job to `failed` with rejection note
- Approval action captured in audit log with approver identity and timestamp

### Automated Ingestion
- **Windows Agent** — .NET 8 Worker Service; watches local or UNC folders; uploads matching files via REST API with SHA-256 deduplication; runs as a Windows Service
- **REST API** (`/api/v1/`) — authenticated with per-tenant API keys; endpoints for file ingest, JSON record push, job status, agent config, and heartbeat
- **JSON push endpoint** (`POST /api/v1/push-records`) — accepts a JSON array of pre-mapped row objects; converts to CSV internally and runs through the full pipeline; supports optional base64-encoded supporting document attachment; returns `{ jobId, rowCount, status, autoProcess }`
- **API Key management** — create, label, and revoke long-lived API keys from Settings → API Keys
- **Watcher configs** — configure folder watchers per tenant (path, file pattern, archive action, poll interval, auto-process)
- **Auto-process** — jobs uploaded by the agent with `auto_process = true` are processed inline immediately; no separate trigger required

### Multi-Entity Support
- Entity ID (Intacct location) resolved via a three-level priority chain:
  1. **Job-level override** — set at upload time in the web UI or via the API
  2. **Watcher-level override** — configured on the watcher definition in Settings → Watchers
  3. **Tenant credentials** — the `entityId` stored in Settings → Integrations
- The resolved `entity_id_used` is written back to the job record after processing for full auditability

### Field Mappings & Templates
- Tenants define reusable field mappings: source column → Intacct field
- Mapping builder with live preview and column detection from uploaded sample files
- Support for static default values and multi-sheet XLSX targeting
- Mappings can be cloned to sandbox for safe testing
- **Platform-managed templates**: platform admins create and publish master templates for all 10 supported transaction types; tenants clone published templates
- **Jobs counter**: the mappings list shows how many jobs have used each mapping, helping identify active vs unused mappings

### Job Processing Pipeline
- Parse → validate → transform → group → submit to Intacct
- Journal entries grouped by `journal_symbol + posting_date + description` into a single GLBATCH per group
- Per-row error capture with original values preserved
- Retry logic for individual failed rows
- Job statuses: `pending → processing → completed / completed_with_errors / failed / awaiting_approval / cancelled`
- **Processing log**: timestamped JSONB log on each job; drill-in page at `/jobs/[id]` shows every step

### Sage Intacct Integration
- XML Gateway API client with session-based authentication
- Multi-entity support: `entityId` sets `<locationid>` in the Intacct login block, scoping the session to that entity
- **Supported transaction types**: Journal Entry, Payroll Journal, AR Invoice, AP Bill, Expense Report, AR Payment, AP Payment, Timesheet, Vendor Import, Customer Import
- Platform-level Web Services sender credentials (ISV credentials shared across all tenants); env var fallback is intentionally absent — credentials must come from the database to prevent cross-tenant leakage
- Per-tenant Company ID + API User credentials, AES-256-GCM encrypted at rest
- RECORDNO returned from Intacct on successful posting, stored in `upload_jobs.intacct_record_nos`
- **Supporting document attachments** (`create_supdoc`): optionally attach a PDF or image alongside a batch upload; the platform uploads it to Intacct as a supdoc and injects the returned `SUPDOCID` into every transaction in the job; supported via the web UI, file ingest API, and JSON push endpoint

### Data Retention
- Per-tenant configurable `file_retention_days` (default: 90 days)
- Nightly cron (`0 2 * * *`) at `/api/cron/retention` deletes files from Supabase Storage once the retention period expires
- `file_deleted_at` written to the job record when the file is removed; job metadata is preserved

### Error Queue
- Dedicated error queue view for rows that failed processing
- Inline correction: edit field values and re-submit individual rows
- Bulk retry and bulk dismiss actions

### Audit Log
- Immutable audit trail for all significant operations
- Captures: operation, resource type, old/new values, user, tenant, timestamp
- Filterable by date range, operation type, and resource
- **CSV export**: download the full audit log as a CSV file with one click
- Credential changes (save/update of Intacct credentials) and watcher changes (create/update/delete) are automatically logged with `create_watcher`, `update_watcher`, `delete_watcher`, and `update_credentials` entries

### Usage Metering & Plan Tiers
- Four platform-defined plan tiers: **Free**, **Starter**, **Professional**, **Enterprise**
- Per-plan limits on jobs/month, rows/month, storage, watchers, API keys, and users
- Nightly snapshot cron (`0 1 * * *`) records each tenant's usage in `tenant_usage_monthly`
- **UsageBanner** in the dashboard alerts tenants when approaching (>80%) or exceeding (>100%) their plan limits
- Upload page is blocked with a "Module not available — Limit reached" lockout when a tenant is over-limit
- Platform admins assign and change tenant plans from **Platform → Tenants → [Tenant] → Subscription**

| Plan | Jobs/mo | Rows/mo | Price |
|------|---------|---------|-------|
| Free | 10 | 1,000 | £0 |
| Starter | 100 | 50,000 | £49 |
| Professional | 1,000 | 500,000 | £149 |
| Enterprise | Unlimited | Unlimited | Custom |

### White Labelling
- Per-tenant branding stored in `tenant_branding`: brand name, logo URL, favicon URL, primary/accent colours, support email/URL, custom CSS
- Platform admins edit branding via **Platform → Tenants → [Tenant] → Branding** — full editor with live preview panels
- CSS variables (`--primary`, `--accent`) injected into the layout at render time; custom CSS appended to `<style>` tag
- Sidebar shows tenant logo and brand name instead of Mysoft defaults
- Email notifications use the tenant's `brand_name` in the subject and body

### Connector Licensing
- Per-tenant **connector licences** managed by platform admins via **Platform → Tenants → [Tenant] → Connectors**
- Licence types: `included` (bundled in plan), `paid_monthly`, `paid_annual`, `trial`, `complimentary`
- Per-connector `price_gbp_monthly` tracks recurring add-on revenue
- Platform billing report (`/platform/billing`) shows plan MRR, connector MRR, and total MRR across all tenants
- Tenant subscription page shows each connector licence with type badge, status, and connector MRR subtotal
- Tenant-facing billing page (`/settings/billing`) shows an itemised monthly bill: base plan + enabled add-on connectors = total; visible to all tenant roles
- Sage Intacct is always included in the plan at £0; other connectors may be add-on priced

### Platform Administration
- Platform dashboard: live stats (active/trial/suspended tenants, sandbox count, total users, new this month), job queue status strip, DLQ alert banner, recent activity, recent jobs
- Tenant management: create, search, filter, and manage all tenants; sandbox tenants shown with SANDBOX badge
- Per-tenant tab navigation: **Details** (users, sandbox, API keys), **Usage** (monthly metrics), **Subscription** (plan, billing, history, connector licences), **Branding** (white-label editor), **Connectors** (licence management)
- Status-coloured header accent on tenant detail for trial/suspended/offboarded/archived tenants
- User management across all tenants with tenant filter and search
- Platform-level Intacct sender credentials management (Platform → Settings)
- Platform sidebar is fully separate from the tenant workspace — super admins never see tenant-level nav

### Observability & Health Monitoring
- **`GET /api/health`** — public health check endpoint for uptime monitoring (UptimeRobot, Vercel, etc.); returns `{ status, timestamp, checks: { database, jobQueue, errorRate, agents } }`; HTTP 200 for ok/degraded, 503 for unhealthy
- **`/platform/jobs`** — platform-level job queue management: live queue depth by status, dead letter queue (DLQ) with one-click retry, active jobs table, recent failures; accessible to all platform admins
- DLQ warning banner on the platform dashboard links to `/platform/jobs` when jobs are waiting for review
- Queue status strip on the platform dashboard shows live counts for processing/queued/pending/retry/failed/DLQ with a link to the full job queue page

### User Management
- Invite users by email from the tenant settings page or directly from the platform tenant detail page
- Invited users appear with an amber **Invited** badge until first login
- Inline role editing from any user list view
- Platform admins can manage users across any tenant

### Settings
- **Integrations tab**: Sage Intacct company and API user credentials; separate **⚡ Test Connection** button verifies credentials against Intacct before saving; sandbox and production credentials fully isolated
- **API Keys tab**: create, list, and revoke long-lived API keys for automated ingestion
- **Watchers tab**: configure folder watcher definitions (path, file pattern, archive, entity override); **watcher execution log** shows last poll time, files ingested/skipped/rejected per watcher; HTTP push token hidden behind a reveal pattern to prevent shoulder-surfing; **⚡ Test SFTP Connection** validates SFTP credentials before saving
- **Webhooks tab**: configure outbound webhook endpoints (URL, events, HMAC signing secret); last delivery status and error shown per endpoint; requires Professional/Enterprise plan
- **Users tab**: manage users and pending invites in a single merged table; tenant admins can restrict individual users to specific Intacct entities via `allowed_entity_ids`
- **Usage tab**: current-period usage progress bars and 6-month history; read-only view of plan limits
- **Profile tab**: update display name and password

### Email Notifications
- Transactional email via Resend
- User invite emails with magic link
- Job completion and failure notifications
- Approval required notifications (when `approval_required` is enabled)
- All emails respect tenant `brand_name` when set via white labelling

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Encryption | AES-256-GCM (Node.js `crypto`) |
| Email | Resend |
| Intacct API | Sage Intacct XML Gateway (custom client in `lib/intacct/client.ts`) |
| Hosting | Vercel (region: lhr1 London) |
| Agent | .NET 8 Windows Worker Service |
| Charts | Pure SVG (no external library) |
| CSV parsing | PapaParse |
| XML parsing | fast-xml-parser |

---

## Multi-Region Architecture

- `tenants.home_region` is a durable, immutable tenancy property (`uk | us | eu`) set at onboarding; changes require a formal managed migration process enforced by a database trigger
- All `upload_jobs` carry a `region` field auto-populated from the tenant via a BEFORE INSERT trigger, enabling future regional worker scoping and data residency enforcement without joins
- Platform follows a compliance-led regional cell architecture (see `Mysoft_Multi_Region_Architecture_Specification.docx`)
- Auth remains global; regional Supabase projects are provisioned per-cell when a data residency commitment is made (see `.env.local.example` for intended env-var structure)

---

## Database Migrations

Apply all migrations in order via the Supabase SQL Editor. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for full instructions.

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | Core tables: tenants, user_profiles, upload_jobs, field_mappings; RLS policies |
| 002 | `002_credentials.sql` | Per-tenant encrypted credential storage |
| 003 | `003_jobs.sql` | Audit log table and additional RLS |
| 004 | `004_mappings.sql` | Per-row error capture (`job_errors` table) |
| 005 | `005_mapping_templates.sql` | Platform templates with `is_template` flag; seeds 4 system templates |
| 006 | *(skipped — merged into 005)* | |
| 007 | `007_sandbox_tenants.sql` | Sandbox tenant support (`is_sandbox`, `sandbox_of` FK) |
| 008 | `008_platform_credentials.sql` | Platform-level ISV sender credential storage |
| 009 | `009_template_status.sql` | `template_status` (draft/published) on field_mappings |
| 010 | `010_automated_ingestion.sql` | API keys, watcher_configs, upload_jobs additions (sha256, auto_process, source_type) |
| 011 | `011_intacct_record_nos.sql` | `intacct_record_nos` JSONB column on upload_jobs |
| 012 | `012_processing_log.sql` | `processing_log` JSONB column on upload_jobs |
| 013 | `013_extended_templates.sql` | Updates templates with date_format; adds Payroll Journal, AR Payment, AP Payment |
| 014 | `014_p1_features.sql` | Phase 1 feature additions |
| 015a | `015_approval_workflow.sql` | Approval workflow columns on upload_jobs |
| 015b | `015_new_modules_retention.sql` | Timesheet/Vendor/Customer templates; file retention columns |
| 016 | `016_multi_entity.sql` | Multi-entity override columns on watcher_configs and upload_jobs |
| 017 | `017_usage_metering.sql` | Plans table (4 tiers), usage snapshots, plan columns on tenants |
| 018 | `018_white_label.sql` | Tenant branding table with RLS |
| 019 | `019_subscriptions.sql` | Subscription management: subscription_plans, tenant_subscriptions, billing history |
| 020 | `020_offboarding_trial.sql` | Trial expiry and tenant offboarding/archiving lifecycle columns |
| 021 | `021_http_push_sftp_poll.sql` | HTTP push receiver and SFTP poll watcher support: push_token on watcher_configs, sftp_* credential columns |
| 022 | `022_fix_change_subscription_order.sql` | Fix subscription plan change ordering constraints |
| 023 | `023_upcoming_subscriptions_delete_tenant.sql` | Cascade deletes for offboarded tenants; upcoming subscription scheduling |
| 024 | `024_branding_custom_domain.sql` | Custom domain support column on tenant_branding |
| 025 | *(skipped — merged into 024)* | |
| 026 | `026_user_entity_restrictions.sql` | `allowed_entity_ids text[]` on user_profiles — per-user Intacct entity access restriction |
| 027 | `027_watcher_execution_logs.sql` | Watcher execution log table — records each poll/push outcome per watcher |
| 028 | `028_watcher_soft_delete.sql` | Soft-delete (archive) support for watcher_configs — preserves FK integrity with upload_jobs |
| 029 | `029_branding_templates.sql` | Branding templates table — immutable versioned templates for reuse across tenants |
| 030 | `030_alter_tenant_branding_templates.sql` | Extends tenant_branding with template_id, allowed_template_ids, custom_branding_data, applied_by/at |
| 031 | `031_resilience_orchestration.sql` | Enterprise resilience: source artefacts, job steps/items/events, retry columns, pg_cron integration, expanded job statuses |
| 032 | `032_connector_registry.sql` | Connector registry: endpoint_connectors, endpoint_object_types tables; multi-target pipeline foundation |
| 033 | `033_template_versioning.sql` | Template versioning on field_mappings; template_version_history table |
| 034 | `034_field_discovery_cache.sql` | Connector field discovery cache for dynamic schema introspection |
| 035 | `035_webhook_enhancements.sql` | Webhook enhancements: Teams/Slack channels, delivery log, inbound receivers |
| 036 | `036_connector_registry_extended.sql` | Adds Xero, QuickBooks, Shopify, HubSpot, Salesforce (source) and Sage X3 (target) connector stubs |
| 037 | `037_connector_licensing.sql` | Per-tenant connector licences: licence type, pricing, platform-controlled billing |
| 038 | `038_attachment_support.sql` | Supporting document (supdoc) attachment columns on upload_jobs: storage path, filename, MIME type, file size, supdoc_id, folder name |
| 039 | `039_json_push_delimited_files.sql` | Adds `json_push` to `upload_jobs.source_type` check constraint for the new JSON push endpoint |
| 040 | `040_home_region_rename.sql` | Renames `tenants.region` → `tenants.home_region`; adds immutability trigger |
| 041 | `041_job_region_and_settings_scope.sql` | Adds `region` to `upload_jobs` (auto-set from tenant); adds `scope` to `platform_settings` |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (https://supabase.com)
- A Resend account (https://resend.com) for email
- Sage Intacct Web Services access (ISV Sender ID + Password from the Intacct partner programme)

### Environment Variables

Create `.env.local` in the project root:

```env
# Supabase — from your project's Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Credential encryption — MUST be 64 hex characters (32 bytes)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CREDENTIAL_ENCRYPTION_KEY=your-64-char-hex-string

# Email (Resend)
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Mysoft Integrations <integrations@yourdomain.com>

# App URL — no trailing slash
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron security — generate: openssl rand -hex 32
CRON_SECRET=your-cron-secret
```

### Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Apply all database migrations in order via the Supabase SQL Editor — see `supabase/migrations/` and apply 001 through 041 in sequence (note: 006 and 025 are skipped — merged into adjacent migrations).

### First-Run Platform Setup

1. Sign up and promote the first user to `platform_super_admin` via Supabase SQL:
   ```sql
   UPDATE user_profiles SET role = 'platform_super_admin'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
   ```
2. Navigate to **Platform → Settings** and enter the Sage Intacct ISV Sender ID and Password.
3. Create your first tenant from **Platform → Tenants → New Tenant**.
4. Invite tenant users from the tenant detail page.

For full deployment instructions including Vercel setup, cron configuration, and agent deployment, see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Project Structure

```
mysoft-integration-platform/
├── app/
│   ├── (auth)/                    # Login, sign-up, password reset
│   ├── (dashboard)/               # Authenticated app shell
│   │   ├── layout.tsx             # Auth check, CSS variable injection, Topbar, Sidebar
│   │   ├── dashboard/             # Tenant overview with SVG charts and usage banner
│   │   ├── uploads/               # File upload UI (drag-drop, entity override)
│   │   ├── mappings/              # Field mapping builder
│   │   ├── jobs/
│   │   │   ├── page.tsx           # Job list with status filters
│   │   │   └── [id]/page.tsx      # Job detail + processing log drill-in
│   │   ├── approvals/             # Approval queue (awaiting_approval jobs)
│   │   ├── errors/                # Error queue with inline correction
│   │   ├── audit/                 # Audit log with CSV export
│   │   ├── help/                  # Help centre (11 sections + Developer & API reference)
│   │   ├── settings/
│   │   │   ├── integrations/      # Sage Intacct credentials + connection test
│   │   │   ├── api-keys/          # Create, list, revoke API keys
│   │   │   ├── watchers/          # Folder watcher configuration
│   │   │   ├── webhooks/          # Outbound webhook endpoints (Professional/Enterprise)
│   │   │   ├── users/             # User management + pending invites
│   │   │   └── usage/             # Current period usage + 6-month history
│   │   └── platform/              # Platform-admin-only pages
│   │       ├── page.tsx           # Platform dashboard
│   │       ├── tenants/
│   │       │   ├── page.tsx       # Tenant list + search
│   │       │   ├── new/           # Create tenant form
│   │       │   └── [id]/
│   │       │       ├── page.tsx       # Tenant detail tab — users, sandbox, API keys, subscription summary
│   │       │       ├── usage/         # Usage tab — current period + 6-month history
│   │       │       ├── subscription/  # Subscription tab — plan assignment, billing, history, cancel
│   │       │       └── branding/      # Branding tab — white-label editor + reset to defaults
│   │       ├── jobs/              # Job queue management + DLQ
│   │       │   ├── page.tsx       # Queue status, DLQ, active jobs, recent failures
│   │       │   └── DlqRetryButton.tsx  # One-click DLQ retry client component
│   │       ├── users/             # Cross-tenant user management
│   │       ├── mappings/          # Platform template management
│   │       └── settings/          # Platform sender credentials
│   ├── settings/
│   │   └── billing/               # Tenant-facing itemised billing page (all roles)
│   └── api/
│       ├── auth/                  # Supabase auth callback routes
│       ├── health/                # GET — public health check (database, queue, error rate, agents)
│       ├── set-context/           # Sandbox context cookie switch
│       ├── intacct/
│       │   ├── locations/         # GET — list Intacct entities
│       │   └── set-entity/        # POST — save entity ID to credentials
│       ├── jobs/
│       │   ├── [id]/process/      # POST — trigger job processing
│       │   ├── [id]/retry/        # POST — re-queue failed/dead_letter job
│       │   ├── [id]/approve/      # POST — approve awaiting_approval job
│       │   └── [id]/reject/       # POST — reject awaiting_approval job
│       ├── cron/
│       │   ├── health-check/      # Every 5 min — agent online/offline status
│       │   ├── retention/         # Daily 02:00 — file storage cleanup
│       │   └── usage-snapshot/    # Daily 01:00 — monthly usage snapshot
│       └── v1/                    # Agent REST API
│           ├── ingest/            # POST — file upload (CSV/XLSX/TSV/PSV/TXT) + auto-process
│           ├── push-records/      # POST — JSON record array push + optional attachment
│           ├── push/[token]/      # POST — webhook-style file push via watcher push token
│           ├── jobs/              # GET — job list
│           ├── config/            # GET — watcher configs
│           └── heartbeat/         # POST — agent heartbeat
├── agent/                         # .NET 8 Windows Worker Service
│   ├── MysoftAgent/               # C# source
│   ├── build.ps1                  # Compile to self-contained exe
│   ├── install.ps1                # Install as Windows Service
│   ├── package.ps1                # Package distributable zip
│   ├── README.md                  # Quick start
│   └── docs/
│       ├── deployment-guide.md    # IT admin guide (domain accounts, GPO)
│       └── troubleshooting.md     # Error reference
├── components/
│   ├── dashboard/                 # SVG chart components (no external libraries)
│   ├── help/                      # HelpCentre + HelpDrawer
│   ├── jobs/                      # ApprovalButtons, ReprocessButton
│   ├── layout/                    # Topbar, Sidebar (brand-aware), SettingsNav
│   ├── platform/                  # BrandingForm (white-label editor)
│   ├── ui/                        # Badge, Modal, EditRoleSelect
│   └── usage/                     # UsageBanner (amber/red limit warnings)
├── lib/
│   ├── actions/                   # Server actions (uploads, watchers, mappings, users,
│   │                              #   tenants, branding, usage, audit, webhooks, ...)
│   ├── intacct/
│   │   ├── client.ts              # XML Gateway API client
│   │   ├── processor.ts           # Full processing pipeline
│   │   ├── types.ts               # Intacct TypeScript types
│   │   ├── validator.ts           # Input validation
│   │   └── log-types.ts           # ProcessingLogEntry type
│   ├── supabase/                  # Client factories (server / client / admin)
│   ├── branding.ts                # getTenantBranding() server helper + defaults
│   ├── crypto.ts                  # AES-256-GCM encrypt/decrypt
│   ├── email.ts                   # Resend integration (brand-name aware)
│   └── tenant-context.ts          # Sandbox context resolution
├── supabase/
│   ├── functions/
│   │   ├── process-job/           # DEPRECATED — replaced by inline Next.js approach
│   │   └── sftp-poll/             # Skeleton — SFTP polling (future)
│   └── migrations/                # 001–018 (see table above)
├── types/
│   └── database.ts                # TypeScript types for all DB tables
├── docs/
│   ├── DEPLOYMENT.md              # Full deployment guide (start here for new instances)
│   ├── HANDOVER.md                # Technical handover for incoming developers
│   ├── csv-format.md              # Definitive CSV format reference (all 10 types)
│   └── phase2-automated-ingestion-spec.md
├── .env.local.example             # Environment variable template
├── vercel.json                    # Vercel config (region, function timeouts, crons, CORS)
└── .github/workflows/ci.yml       # GitHub Actions: lint + typecheck + build
```

---

## File Format Quick Reference

All transaction types share the same column headers regardless of file format. Date formats accepted: `DD/MM/YYYY` (default — UK), `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`, `DD.MM.YYYY`, or Excel serial numbers.

### Supported Input Formats

| Extension | Delimiter | Detection |
|-----------|-----------|-----------|
| `.csv` | Comma (auto-detected) | Extension |
| `.xlsx` / `.xls` | Excel binary | Extension |
| `.tsv` / `.tab` | Tab | Extension (forced) |
| `.psv` | Pipe `\|` | Extension (forced) |
| `.txt` / `.dat` / `.log` | Any (auto-detected) | PapaParse |

> **Tip**: If a `.txt` auto-detection produces only one column, rename the file to `.psv` or `.tsv` to force the correct delimiter.
>
> **JSON push** (`POST /api/v1/push-records`): send records as a JSON array — no file needed.

| Transaction Type | Intacct Object | Key Grouping |
|-----------------|---------------|--------------|
| Journal Entry | `GLBATCH` | `journal_symbol + posting_date + description` |
| Payroll Journal | `GLBATCH` | `journal_symbol + pay_date + pay_reference` |
| AR Invoice | `ARINVOICE` | `customer_id + invoice_date + reference_no` |
| AP Bill | `APBILL` | `vendor_id + bill_date + reference_no` |
| Expense Report | `EEXPENSES` | `employee_id + report_date + reference_no` |
| AR Payment | `ARPYMT` | One payment per row |
| AP Payment | `APPYMT` | One payment per row |
| Timesheet | `TIMESHEET` | `employee_id + week_start_date` |
| Vendor Import | `VENDOR` | One vendor record per row |
| Customer Import | `CUSTOMER` | One customer record per row |

See [docs/csv-format.md](docs/csv-format.md) for full column reference and example rows for all 10 types.

---

## Sandbox Environments

Each production tenant can have one linked sandbox environment. Sandbox tenants are full sibling rows in the `tenants` table, linked via `sandbox_of`. Data within a sandbox is completely isolated — uploads, jobs, mappings, credentials, and audit logs are all scoped to the sandbox tenant ID.

Platform admins create sandbox tenants from **Platform → Tenants → [Tenant] → Sandbox Environment**. Active field mappings can optionally be cloned into the sandbox at creation time.

Users switch context using the **Production / Sandbox** dropdown in the top navigation bar.

Sandbox credentials are fully independent of production — configure a separate Intacct company/user in Settings → Integrations while the sandbox context is active.

---

## Plan Tiers

| Plan | Jobs/mo | Rows/mo | Storage | Watchers | API Keys | Users | Price |
|------|---------|---------|---------|----------|----------|-------|-------|
| Free | 10 | 1,000 | 100 MB | 2 | 2 | 3 | £0/mo |
| Starter | 100 | 50,000 | 500 MB | 5 | 5 | 10 | £49/mo |
| Professional | 1,000 | 500,000 | 2 GB | 20 | 20 | 50 | £149/mo |
| Enterprise | ∞ | ∞ | ∞ | ∞ | ∞ | ∞ | Custom |

Plans are assigned by platform admins. Usage is tracked via daily snapshots. The `UsageBanner` component displays an amber warning at 80% and red at 100% of any limit.

---

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/health-check` | Every 5 minutes | Marks agents as online/offline based on recent heartbeats |
| `/api/cron/usage-snapshot` | Daily at 01:00 UTC | Computes and stores monthly usage snapshot per tenant |
| `/api/cron/retention` | Daily at 02:00 UTC | Deletes files from Storage when `file_retention_days` has elapsed |
| `/api/cron/trial-expiry` | Daily at 03:00 UTC | Suspends tenants whose trial period has ended with no active subscription |
| `/api/cron/subscription-renewal` | Daily at 04:00 UTC | Advances subscription `period_end` on renewal; marks expired subscriptions |
| `/api/cron/offboarding` | Daily at 05:00 UTC | Purges data for tenants that have been in `offboarded` status for ≥ 90 days |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`. This is handled automatically by Vercel when configured in `vercel.json`.

---

## Security

- All credentials encrypted at rest with AES-256-GCM; key stored in environment variable only (never in DB)
- Supabase RLS enforces tenant isolation at the database layer
- API routes use the service role key server-side only; clients never receive elevated credentials
- Platform credentials (ISV sender keys) accessible only to `platform_super_admin` role
- API keys stored as SHA-256 hashes only; the raw key is shown once at creation and never again
- CRON_SECRET protects all cron endpoints from public invocation
- Audit log captures all credential changes, job operations, and admin actions
- Intacct sender credentials **must** come from the database (Platform → Settings); env var fallback is intentionally absent to prevent cross-tenant credential leakage
- Webhook signatures use HMAC-SHA256 with `crypto.timingSafeEqual()` to prevent timing attacks
- Windows Agent API key should be stored in Windows Credential Manager — not plain text in `appsettings.json`

---

## REST API

The platform exposes a REST API for programmatic file submission and status polling. All endpoints require `Authorization: Bearer <api_key>` where the key is created in Settings → API Keys.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/ingest/check` | Pre-flight: duplicate check + usage limit check before uploading |
| `POST` | `/api/v1/ingest` | Submit a file (CSV/XLSX/TSV/PSV/TXT); triggers processing if `mappingId` or `watcherConfigId` is supplied |
| `POST` | `/api/v1/push-records` | Submit a JSON array of records directly; no file required; triggers processing if `mappingId` is supplied |
| `POST` | `/api/v1/push/{token}` | Webhook-style file push authenticated by push token (watcher config) |
| `GET`  | `/api/v1/jobs/{id}/status` | Poll job processing status |
| `GET`  | `/api/v1/config` | Retrieve enabled watcher configurations |
| `POST` | `/api/v1/heartbeat` | Agent liveness signal (updates `last_used_at` on key) |
| `POST` | `/api/v1/check` | Simple duplicate check (no usage limit check) |

**Error codes of note:**
- `401` — missing/invalid/revoked key
- `402` — tenant is over their plan usage limit
- `409` — duplicate file/payload (same SHA-256 already submitted)

**JSON push example:**
```bash
curl -X POST https://your-instance.vercel.app/api/v1/push-records \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      { "DATE": "01/04/2025", "JOURNAL": "GJ", "DEBIT_GL": "4000", "CREDIT_GL": "2100", "AMOUNT": "1500.00", "MEMO": "Payroll run" }
    ],
    "mappingId": "uuid-of-mapping",
    "entityIdOverride": "E100",
    "filename": "april-journals.csv"
  }'
```

Response: `{ "jobId": "uuid", "status": "processing", "rowCount": 1, "autoProcess": true }`

The JSON push endpoint also accepts an optional `attachment` object for supporting documents:
```json
{
  "attachment": {
    "filename": "invoice.pdf",
    "mimeType": "application/pdf",
    "data": "<base64-encoded content>"
  },
  "supdocFolderName": "Mysoft Imports"
}
```

See the **Developer & API** section in the in-app Help Centre for full request/response documentation and webhook verification examples.

---

## Webhooks

Outbound webhooks notify external systems when jobs complete or fail. Managed in Settings → Webhooks (requires Professional or Enterprise plan).

**Events:** `job.completed`, `job.failed`

**Payload example:**
```json
{
  "event": "job.completed",
  "jobId": "uuid",
  "tenantId": "uuid",
  "status": "completed",
  "filename": "payroll_march_2026.csv",
  "processedCount": 142,
  "errorCount": 0,
  "recordNos": ["2699", "2700"],
  "errorMessage": null,
  "timestamp": "2026-03-18T09:00:47.123Z"
}
```

**Signature verification:** All webhook deliveries include `X-Mysoft-Signature: sha256=<HMAC-SHA256>` computed over the raw JSON body using the per-endpoint signing secret. See `lib/webhooks.ts` for the dispatch implementation.

---

## Roadmap

### Complete
- ✅ Phase 1 — Core platform (auth, mappings, processing, error queue, audit, sandbox)
- ✅ Phase 2 — Automated ingestion (Windows Agent, REST API, watchers, deduplication, webhooks, pre-submission validation, dashboard analytics)
- ✅ Phase 3 — Approval workflow, multi-entity support, new modules (Timesheets, Vendors, Customers), data retention, usage metering + plan tiers, white labelling, subscription management, over-limit upload blocking, platform consistency pass
- ✅ Core improvements — HTTP push receiver, SFTP connector, connection test buttons (Intacct + SFTP), watcher execution log, per-user entity restrictions, HTTP push token reveal pattern, audit trail on credential/watcher changes, row quota projection on upload, mapping usage counter
- ✅ Multi-target connector registry (endpoint_connectors, endpoint_object_types), template versioning, branding templates (platform-managed, per-tenant), field discovery cache, webhook enhancements (Teams/Slack channels, delivery log)
- ✅ Connector licensing — per-tenant add-on connector billing; platform billing report with connector MRR; tenant-facing itemised billing page
- ✅ Platform observability — `/api/health` endpoint, `/platform/jobs` DLQ management, queue status on platform dashboard, DLQ alert banner
- ✅ Security hardening — removed Intacct env var fallback (credentials must come from DB)
- ✅ Intacct supporting documents — `create_supdoc` attachment support; base64 upload to Intacct; SUPDOCID injected into all transactions in a job; available via UI, file ingest API, and JSON push
- ✅ JSON push endpoint — `POST /api/v1/push-records` accepts JSON record arrays with optional base64 attachment; converts to CSV internally; full pipeline reuse
- ✅ Extended file format support — tab-delimited (`.tsv`/`.tab`), pipe-delimited (`.psv`), and auto-detected plain-text (`.txt`/`.dat`/`.log`) in addition to CSV and XLSX

### Deferred / Upcoming
- **SharePoint folder polling** — monitor SharePoint document libraries via Azure AD integration
- **Webhook retry with backoff** — automatic retry of failed webhook deliveries
- **Job listing API endpoint** — `GET /api/v1/jobs` with status filtering and pagination
- **Sage X3 target** — second integration target alongside Sage Intacct; requires new client in `lib/sage-x3/`
- **Self-service tenant onboarding** — guided setup wizard (credentials, connection test, mapping, dry-run — no platform admin required)

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | DevOps / Platform admin | Full deployment guide — Supabase, Vercel, env vars, crons, first-run setup |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Developer | Technical handover — architecture, pipeline internals, gotchas, security |
| [`docs/csv-format.md`](docs/csv-format.md) | End users / Developers | CSV format reference for all 10 transaction types with example rows |
| [`agent/README.md`](agent/README.md) | End users | Windows Agent quick start (5-minute setup) |
| [`agent/docs/deployment-guide.md`](agent/docs/deployment-guide.md) | IT admins | Full agent deployment guide — domain accounts, GPO, service hardening |
| [`agent/docs/troubleshooting.md`](agent/docs/troubleshooting.md) | IT admins / Support | Agent error reference and diagnostics |
| In-app Help Centre (`/help`) | End users | Contextual help, CSV reference, Intacct setup, Developer & API reference |

---

## Licence

Private — Mysoft Ltd. All rights reserved.
