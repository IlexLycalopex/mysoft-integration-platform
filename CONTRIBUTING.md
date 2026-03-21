# Contributing — Mysoft Integration Platform

Practical guidelines for developers working on this codebase.

---

## 1. Development Setup

```bash
git clone <repo-url>
cd mysoft-integration-platform-main
npm install
cp .env.local.example .env.local   # fill in values (see Section 10 below)
npm run dev
```

The app runs at `http://localhost:3000`. Connect to the shared Supabase project (remote) or configure a local Supabase instance with `supabase start`.

**Required env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. See `.env.local.example` for the full template.

---

## 2. Project Structure

```
app/                  Next.js App Router pages and API routes
  (auth)/             Login / sign-up pages
  (dashboard)/        Authenticated UI (tenant + platform admin)
  api/                All API routes (v1/*, jobs/*, cron/*, intacct/*)
components/           Shared React components
lib/                  Server-side business logic and helpers
  actions/            Server actions (mutations called from client components)
  intacct/            Intacct XML Gateway client and processing pipeline
  jobs/               Job orchestration helpers
supabase/
  migrations/         Numbered SQL migration files
types/                TypeScript types — database.ts is the source of truth
agent/                .NET 8 Windows Agent (separate build)
docs/                 Technical documentation (HANDOVER.md, csv-format.md)
```

See `README.md` for the full directory tree and feature inventory.

---

## 3. Code Style

- **TypeScript strict mode** — no `any`, no implicit returns, no unchecked nulls. Run `npx tsc --noEmit` before committing.
- **No Tailwind** — styling uses inline styles and CSS variables only. Do not add Tailwind classes.
- **Next.js App Router patterns** — use server components by default. Add `'use client'` only when browser APIs or React state are genuinely required.
- **Server actions for mutations** — data writes go in `lib/actions/`. API routes handle external calls (agents, webhooks, cron); server actions handle in-app mutations from UI components.
- **No `const` for mutated objects** — `processor.ts` mutates `creds`; use `let` for variables that are reassigned.

---

## 4. Database Migrations

Migrations live in `supabase/migrations/` and are numbered sequentially (`042_description.sql`, `043_description.sql`, ...).

**To add a new migration:**

1. Create the file: `supabase/migrations/<next_number>_<snake_case_description>.sql`
2. Write idempotent SQL (use `IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE` where applicable).
3. Apply via Supabase MCP (`apply_migration`) or the CLI (`supabase db push`).
4. **Manually update `types/database.ts`** to reflect any schema changes — type generation is not automatic.
5. Run `npx tsc --noEmit` to confirm no type errors.

**Known numbering gaps:** 006 was merged into 005 — do not reuse 006. Two migrations share the `015` prefix; apply `015_approval_workflow.sql` before `015_new_modules_retention.sql`.

---

## 5. CSS Variables

All colours are defined as CSS variables in `app/globals.css` and used via inline `style` props. Do not hardcode colour hex values in components.

| Variable | Purpose |
|----------|---------|
| `--navy` | Primary brand dark blue |
| `--muted` | Secondary text / subdued elements |
| `--border` | Default border colour |
| `--surface` | Card / panel background |
| `--green` | Success states |
| `--red` | Error / destructive states |
| `--orange` | Warning states |

Tenant white-labelling overrides `--primary` and `--accent` at runtime via a SSR-injected `<style>` block in the dashboard layout — do not rely on these being the Mysoft defaults.

---

## 6. Commit Conventions

Use a short prefix followed by a concise description:

```
feat: add dry-run mode to push-records endpoint
fix: handle null home_region in job region trigger
chore: bump next to 15.3.0
docs: update HANDOVER with supdoc processing flow
```

- `feat:` — new capability
- `fix:` — bug correction
- `chore:` — dependency updates, config, tooling
- `docs:` — documentation only

Keep the subject line under 72 characters. Add a body if the why is not obvious from the subject.

---

## 7. Adding New Features — Checklist

Work through this list for any user-facing feature:

- [ ] Migration — create numbered `.sql` file, apply to Supabase
- [ ] Types — update `types/database.ts` to match schema changes
- [ ] Server action — add to `lib/actions/<feature>.ts`
- [ ] UI component — add under `components/` or relevant `app/(dashboard)/` page
- [ ] Help section — if user-facing, add an entry in `components/help/HelpCentre.tsx`
- [ ] README update — add to the feature inventory table
- [ ] `npx tsc --noEmit` — confirm zero errors
- [ ] Commit with appropriate prefix

---

## 8. Multi-Region Considerations

The platform has a multi-region foundation in place (migrations 040–041). When building new features:

- Store region-scoped data on `upload_jobs.region` or `tenants.home_region` — not on global tables.
- Read `tenants.home_region` (not `tenants.region` — that column was renamed in migration 040).
- Settings that vary per region should have `scope = 'regional'` in `platform_settings`.
- Do not assume a single global Supabase URL for data queries — future regional cells will use separate project URLs.

See `docs/HANDOVER.md` § 21 for the full multi-region architecture and Phase 2 trigger criteria.

---

## 9. Testing

There is currently no automated test suite. Before committing:

1. **Type-check:** `npx tsc --noEmit` — must pass with zero errors.
2. **Manual verification:** use Supabase MCP or the Supabase dashboard to inspect table state after applying migrations.
3. **Processing pipeline:** test end-to-end with a real or simulated file upload against the dev environment. Use the `mip_simkey_acme_001` test API key against the ACME sandbox tenant.
4. **Intacct calls:** change `description` or `posting_date` on test rows to avoid duplicate-transaction rejections from Intacct.

High-value targets for future unit tests: `normaliseDate()` in `lib/intacct/processor.ts` and the XML builder in `lib/intacct/client.ts`.

---

## 10. Key Files — Quick Reference

| File | Purpose |
|------|---------|
| `lib/intacct/client.ts` | Intacct XML Gateway HTTP client; `createSupdoc()`, session auth |
| `lib/intacct/processor.ts` | Full job processing pipeline (~800 lines); entity resolution, CSV mapping, Intacct submission |
| `lib/jobs/job-orchestrator.ts` | Job lifecycle helpers; uses `home_region` for date locale |
| `lib/actions/` | All server actions — one file per domain (e.g. `platform-settings.ts`, `usage.ts`) |
| `types/database.ts` | Hand-maintained TypeScript types for the Supabase schema — update after every migration |
| `components/help/HelpCentre.tsx` | In-app help panel — add entries here for all user-facing features |
| `app/globals.css` | CSS variable definitions |
| `supabase/migrations/` | Numbered SQL migrations — sequential, snake_case filenames |
| `docs/HANDOVER.md` | Full technical handover — architecture, schema, API reference, gotchas |
