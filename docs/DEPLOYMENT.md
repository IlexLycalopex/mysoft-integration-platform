# Deployment Guide — Mysoft Integration Platform

This guide covers everything needed to deploy a fresh instance of the platform from a clean clone of the repository. Follow the steps in order.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | `node --version` to confirm |
| Git | For cloning the repo |
| Supabase account | https://supabase.com — free tier is sufficient to start |
| Vercel account | https://vercel.com — Hobby tier works; Pro recommended for cron jobs |
| Resend account | https://resend.com — free tier (3,000 emails/month) |
| Sage Intacct Web Services | ISV Sender ID + Sender Password from the Intacct partner programme |
| GitHub repo access | CI pipeline runs on push to `main` |

---

## 1. Clone & Install

```bash
git clone https://github.com/IlexLycalopex/mysoft-integration-platform.git
cd mysoft-integration-platform
npm install
```

---

## 2. Create a Supabase Project

1. Go to https://supabase.com/dashboard → **New Project**.
2. Choose a name, region (recommend `eu-west-2` London), and a strong database password. Save the password.
3. Once the project is created, go to **Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **Storage → Buckets** → **New bucket** → name it `uploads` → set it to **Private**.

### Enable Email Auth

5. Go to **Authentication → Providers** → confirm **Email** is enabled.
6. Go to **Authentication → Email Templates** → customise invite and password-reset emails as needed.

---

## 3. Apply Database Migrations

Migrations must be applied **in the exact order below** via the Supabase SQL Editor (**SQL Editor → New query** → paste → **Run**).

| Order | File | What it creates |
|-------|------|----------------|
| 1 | `supabase/migrations/001_initial_schema.sql` | Core tables: tenants, user_profiles, upload_jobs, field_mappings; RLS policies |
| 2 | `supabase/migrations/002_credentials.sql` | Per-tenant encrypted credential storage |
| 3 | `supabase/migrations/003_jobs.sql` | Audit log table and additional RLS |
| 4 | `supabase/migrations/004_mappings.sql` | Per-row error capture (`job_errors` table) |
| 5 | `supabase/migrations/005_mapping_templates.sql` | Platform templates with `is_template` flag; seeds 4 system templates |
| *(006 skipped — merged into 005)* | | |
| 6 | `supabase/migrations/007_sandbox_tenants.sql` | Sandbox tenant support |
| 7 | `supabase/migrations/008_platform_credentials.sql` | Platform-level ISV sender credential storage |
| 8 | `supabase/migrations/009_template_status.sql` | `template_status` (draft/published) on field_mappings |
| 9 | `supabase/migrations/010_automated_ingestion.sql` | API keys, watcher_configs, upload_jobs additions (sha256, auto_process, source_type) |
| 10 | `supabase/migrations/011_intacct_record_nos.sql` | `intacct_record_nos` JSONB column on upload_jobs |
| 11 | `supabase/migrations/012_processing_log.sql` | `processing_log` JSONB column on upload_jobs |
| 12 | `supabase/migrations/013_extended_templates.sql` | Updates all 4 templates with date_format; adds Payroll Journal, AR Payment, AP Payment templates |
| 13 | `supabase/migrations/014_p1_features.sql` | Phase 1 feature additions |
| 14 | `supabase/migrations/015_approval_workflow.sql` | Approval workflow columns on upload_jobs |
| 15 | `supabase/migrations/015_new_modules_retention.sql` | Timesheet/Vendor/Customer templates; file retention columns |
| 16 | `supabase/migrations/016_multi_entity.sql` | Multi-entity override columns on watcher_configs and upload_jobs |
| 17 | `supabase/migrations/017_usage_metering.sql` | Plans table (4 tiers), usage snapshots, plan columns on tenants |
| 18 | `supabase/migrations/018_white_label.sql` | Tenant branding table with RLS |

> **Important:** Both `015_approval_workflow.sql` and `015_new_modules_retention.sql` carry the `015` prefix — they were developed in parallel. Apply them in the order listed above (approval workflow first, then new modules).

---

## 4. Configure Environment Variables

### Local Development

Create `.env.local` in the project root (never commit this file):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Credential encryption — MUST be 64 hex chars (32 bytes)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CREDENTIAL_ENCRYPTION_KEY=your-64-char-hex-string

# Email (Resend)
RESEND_API_KEY=re_your_key
RESEND_FROM_EMAIL=Mysoft Integrations <integrations@yourdomain.com>

# App URL — no trailing slash
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron security — generate: openssl rand -hex 32
CRON_SECRET=your-cron-secret
```

Start the dev server:
```bash
npm run dev
```

### Production (Vercel)

Add every variable from the table below in **Vercel → Project → Settings → Environment Variables**. Set scope to **Production** (and **Preview** if you use preview deployments).

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) | Supabase → Settings → API |
| `CREDENTIAL_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM encryption | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `RESEND_API_KEY` | Resend API key for transactional email | Resend dashboard |
| `RESEND_FROM_EMAIL` | Sender display name + address | e.g. `Mysoft Integrations <integrations@yourdomain.com>` |
| `NEXT_PUBLIC_APP_URL` | Full public URL of the deployment (no trailing slash) | e.g. `https://mysoft-integration-platform.vercel.app` |
| `CRON_SECRET` | Bearer token protecting cron endpoints | `openssl rand -hex 32` |

> **Warning — `CREDENTIAL_ENCRYPTION_KEY`:** Once tenants have saved Intacct credentials, this key must never change. Changing it makes all stored credentials unreadable. Store it securely (password manager / secrets manager) and never commit it to git.

---

## 5. Deploy to Vercel

### Option A — Vercel Git Integration (recommended)

1. Go to https://vercel.com/new → Import your GitHub repository.
2. Framework preset: **Next.js** (auto-detected).
3. Add all environment variables from Section 4.
4. Click **Deploy**.

Subsequent deployments happen automatically on every push to `main`.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

### Build Configuration

The `vercel.json` in the repo root is pre-configured:
- Region: `lhr1` (London)
- Function max duration: 60 seconds for processing routes
- Cron jobs: see Section 7
- CORS headers on `/api/v1/*` for the Windows Agent

---

## 6. Configure Resend Email

1. Go to https://resend.com → **Domains** → **Add Domain** → follow the DNS verification steps for your sending domain.
2. Once verified, create an API key (**API Keys → Create API key**).
3. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel environment variables.
4. If you are sending from a subdomain (e.g. `integrations@mysoftx3.com`), add the DKIM and SPF records as shown in Resend's domain setup guide.

---

## 7. Verify Cron Jobs

Cron jobs are declared in `vercel.json` and are activated automatically on deployment. They require a **Vercel Pro** plan (or higher) for cron support.

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/health-check` | `*/5 * * * *` | Marks watcher agent status as online/offline based on recent heartbeats |
| `/api/cron/retention` | `0 2 * * *` | Deletes stored files from Supabase Storage for jobs older than the tenant's `file_retention_days` setting (default: 90 days) |
| `/api/cron/usage-snapshot` | `0 1 * * *` | Computes and stores a monthly usage snapshot (job count, rows processed, storage used) per tenant |

Each cron endpoint validates the `Authorization: Bearer <CRON_SECRET>` header. Vercel sends this automatically from the cron config — you do not need to configure it separately beyond setting the `CRON_SECRET` environment variable.

To confirm crons are running: **Vercel → Project → Settings → Cron Jobs**.

---

## 8. First-Run Platform Setup

After the first successful deployment:

### 8.1 Create the first platform admin user

1. Navigate to your deployment URL (e.g. `https://your-app.vercel.app`).
2. Sign up with an email and password at `/login` (or `/sign-up` if exposed).
3. In the **Supabase SQL Editor**, promote this user to platform super admin:

```sql
UPDATE user_profiles
SET role = 'platform_super_admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
```

### 8.2 Enter Sage Intacct ISV sender credentials

4. Log in and navigate to **Platform → Settings**.
5. Enter the **ISV Sender ID** and **ISV Sender Password** from your Intacct Web Services partner credentials.
6. These are encrypted with `CREDENTIAL_ENCRYPTION_KEY` and stored in `platform_credentials`. They are required for all Intacct API calls across all tenants.

### 8.3 Create the first tenant

7. Go to **Platform → Tenants → New Tenant**.
8. Fill in the tenant name and slug.
9. The tenant will default to the `free` plan. To change the plan, go to **Platform → Tenants → [Tenant] → Usage & Plan**.

### 8.4 Invite the first tenant user

10. From **Platform → Tenants → [Tenant]**, use the **Invite User** section to send an invite email.
11. The invited user will receive an email with a sign-up link. They will appear with an **Invited** badge until first login.

### 8.5 Enter tenant Intacct credentials

12. As the tenant admin, go to **Settings → Integrations**.
13. Enter the Intacct **Company ID**, **API User ID**, and **API User Password**.
14. Click **Test Connection** to verify.
15. If using multi-entity: click **Select Entity** to choose from a live dropdown of Intacct locations, then save.

---

## 9. Set Up the Windows Agent (optional)

The Windows Agent automates file ingestion from local or network folders. See [`agent/README.md`](../agent/README.md) for full installation instructions.

**Quick setup:**
1. Go to **Settings → API Keys** → **Create new API key** → label it with the machine name.
2. Copy the raw key (shown once only).
3. On the target Windows machine, run `agent/install.ps1` and provide the API key and platform URL when prompted.
4. Configure folder watchers in **Settings → Watchers**.

For enterprise deployment (Group Policy, domain service accounts), see [`agent/docs/deployment-guide.md`](../agent/docs/deployment-guide.md).

---

## 10. GitHub Actions CI

The CI workflow at `.github/workflows/ci.yml` runs on every push to `main`, `staging`, and `feature/**` branches. It:
- Installs dependencies
- Runs `eslint`
- Runs `tsc --noEmit` (TypeScript type-check)
- Runs `next build`

### Required GitHub Secrets

Add these in **GitHub → Repository → Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

The build step needs these two public variables to compile successfully. The service role key and other secrets are **not** needed for the CI build — they are only used at runtime.

---

## 11. Custom Domain (optional)

1. In **Vercel → Project → Settings → Domains**, add your custom domain.
2. Follow Vercel's DNS instructions (CNAME or A record depending on your registrar).
3. Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables to the new domain.
4. Redeploy (or trigger a redeploy) to pick up the updated URL.
5. Update `RESEND_FROM_EMAIL` if your email sender domain is changing.

---

## 12. Starting a Second Thread of Development

To spin up a second independent instance (e.g. for a new client deployment, a staging environment, or a parallel development fork):

### 12.1 Fork or clone the repository

```bash
git clone https://github.com/IlexLycalopex/mysoft-integration-platform.git my-new-instance
cd my-new-instance
npm install
```

### 12.2 Create a new Supabase project

Each deployment instance must have its own Supabase project — do **not** share a database between instances. Follow Section 2 above.

### 12.3 Generate fresh secrets

```bash
# New encryption key (CREDENTIAL_ENCRYPTION_KEY)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# New cron secret (CRON_SECRET)
openssl rand -hex 32
```

> **Critical:** Each deployment must have its own `CREDENTIAL_ENCRYPTION_KEY`. Never reuse the encryption key from another deployment — credentials are cryptographically bound to the key that encrypted them.

### 12.4 Apply all migrations

Apply migrations 001 through 018 in order to the new Supabase project (Section 3 above).

### 12.5 Create a new Vercel project

Create a new Vercel project pointing to the same repo (or your fork). Add all environment variables with the new deployment's values. Do not copy environment variables from the original deployment.

### 12.6 Update vercel.json region if needed

If deploying outside the UK, update `"regions": ["lhr1"]` in `vercel.json` to the appropriate Vercel region code.

### 12.7 Run first-time platform setup

Follow Section 8 above in full for the new instance.

---

## 13. Post-Deployment Checklist

After any fresh deployment, verify the following:

- [ ] All 18 migrations applied successfully (check `supabase/migrations/` in SQL editor)
- [ ] Supabase Storage `uploads` bucket exists and is private
- [ ] All 7 environment variables set in Vercel
- [ ] `NEXT_PUBLIC_APP_URL` points to the correct deployment URL
- [ ] ISV Sender credentials entered at Platform → Settings
- [ ] At least one platform super admin user promoted in `user_profiles`
- [ ] Test connection works in Settings → Integrations for at least one tenant
- [ ] Cron jobs visible and active in Vercel → Settings → Cron Jobs
- [ ] Email delivery working — send a test invite and confirm it arrives
- [ ] GitHub Actions CI passing on the `main` branch
- [ ] Windows Agent (if used) — heartbeat showing as online in the platform dashboard

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `CREDENTIAL_ENCRYPTION_KEY must be 64 hex chars` at startup | Wrong key format | Regenerate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Auth redirect loop | `NEXT_PUBLIC_APP_URL` wrong | Update to match your actual deployment URL |
| Cron endpoints returning 401 | `CRON_SECRET` not set in Vercel | Add `CRON_SECRET` to Vercel environment variables |
| Processing jobs stuck in `processing` | Function timeout | Check Vercel function logs; ensure `maxDuration: 60` in `vercel.json` |
| `XL03000006` from Intacct | Sender not authorised | Intacct Company Admin → Web Services Authorizations → add the ISV Sender ID |
| Email not delivered | Resend domain not verified | Check Resend dashboard for DNS verification status |
| Agent not connecting | API key wrong or revoked | Regenerate API key in Settings → API Keys |
| Migration fails with constraint error | Out-of-order application | Ensure migrations are applied strictly in numeric order |
