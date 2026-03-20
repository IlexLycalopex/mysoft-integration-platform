# process-job — DEPRECATED

> **This Edge Function approach was superseded in Sprint 4 and is no longer used.**
> Do not deploy this function. Do not configure a Database Webhook to call it.
> The files are retained for historical reference only.

---

## Why It Was Replaced

The original Phase 2 spec proposed using a Supabase Database Webhook → Edge Function (`process-job`) to auto-trigger job processing on INSERT to `upload_jobs`. This approach was implemented but replaced during Sprint 4 for the following reasons:

1. **Vercel timeout handling**: The processing pipeline can run for 30–50 seconds on large files. Coordinating a Supabase Edge Function calling back into a Vercel API route introduced two timeout surfaces. The Edge Function itself has a 150-second wall-clock limit, but the Vercel function it calls has a 60-second limit. Managing this reliably required complex retry logic.

2. **Simpler deployment**: The replacement approach — an inline background `fetch()` from within `/api/v1/ingest` to `/api/jobs/[id]/process` — requires no Supabase secrets, no webhook configuration, no Edge Function deployment, and no cold-start latency. It is entirely within the Next.js codebase and deployed automatically with the app.

3. **No Edge Function cold start**: Edge Functions can have cold-start delays of several seconds. The inline fetch approach calls a Vercel function that shares the same warm pool as the ingest endpoint that just ran.

4. **Debugging**: Logs from the Edge Function appeared in Supabase dashboard logging, separated from the rest of the application. All logs are now in Vercel function logs in one place.

---

## What It Did

This function was designed to:
1. Receive a Database Webhook payload on INSERT to `upload_jobs`.
2. Check `auto_process = true` and `mapping_id IS NOT NULL`.
3. Download the file from Supabase Storage.
4. Parse CSV, apply field mappings, decrypt Intacct credentials.
5. Submit to the Sage Intacct XML Gateway.
6. Update `upload_jobs` with status, counts, and processing log.
7. Insert any failed rows into `job_errors`.

---

## Where Processing Now Lives

All job processing is handled by the Next.js API route:

```
app/api/jobs/[id]/process/route.ts
```

This route calls the processing pipeline in `lib/intacct/processor.ts`.

It is triggered in two ways:
1. **Automatically**: fire-and-forget background `fetch()` from `app/api/v1/ingest/route.ts` immediately after job creation.
2. **Manually**: direct `POST /api/jobs/[id]/process` call (from the UI, a curl command, or the agent if needed).

---

## Required Cleanup

If this Edge Function was ever deployed to your Supabase project:
- Delete any Database Webhook named `auto-process-upload-jobs` from Supabase Dashboard → Database → Webhooks.
- Run `supabase functions delete process-job` to remove the deployed function.
- Remove any Edge Function secrets that were set only for this function (`WEBHOOK_SECRET`, `INTACCT_SENDER_ID`, `INTACCT_SENDER_PASSWORD`) if they are not used elsewhere.
```

=== END FILE ===