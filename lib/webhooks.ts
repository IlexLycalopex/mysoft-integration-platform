/**
 * Webhook dispatch — outbound notifications to tenant-configured endpoints.
 *
 * Channel types:
 *   generic  — raw JSON POST (HMAC-signed if secret set)
 *   teams    — Microsoft Teams Adaptive Card (Workflows / Power Automate connector)
 *   slack    — Slack Block Kit incoming webhook
 *
 * Vercel Hobby notes:
 *   - Delivery is synchronous within the calling request (Promise.allSettled).
 *   - Each endpoint gets a 10-second timeout.
 *   - For production: move to a Supabase Edge Function triggered by
 *     a DB webhook on webhook_delivery_log INSERT to decouple delivery
 *     from the job processing request lifecycle.
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Event taxonomy ────────────────────────────────────────────────────────────

export type WebhookEvent =
  // Job lifecycle
  | 'job.submitted'
  | 'job.processing'
  | 'job.completed'
  | 'job.partially_completed'
  | 'job.failed'
  | 'job.approved'
  | 'job.rejected'
  // Mapping / template
  | 'mapping.template_updated'
  | 'mapping.conflict'
  // Quota
  | 'quota.warning'
  | 'quota.exceeded';

export type ChannelType = 'generic' | 'teams' | 'slack';

// ── Payload interfaces ────────────────────────────────────────────────────────

/** Legacy / generic job payload — kept for backward compat with complete-step.ts */
export interface WebhookPayload {
  jobId: string;
  tenantId: string;
  status: string;
  filename: string;
  processedCount: number;
  errorCount: number;
  recordNos: string[];
  errorMessage?: string;
  dryRun?: boolean;
}

export interface MappingWebhookPayload {
  mappingId: string;
  mappingName: string;
  tenantId: string;
  syncStatus: string;
  parentTemplateId?: string;
  parentTemplateName?: string;
}

export interface QuotaWebhookPayload {
  tenantId: string;
  metric: string;
  current: number;
  limit: number;
  percentUsed: number;
}

// ── Event metadata (labels + colours for UI) ──────────────────────────────────

export const WEBHOOK_EVENT_META: Record<
  WebhookEvent,
  { label: string; group: string; colour: string; bg: string; border: string }
> = {
  'job.submitted':           { label: 'Job submitted',           group: 'Jobs',    colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  'job.processing':          { label: 'Job processing started',  group: 'Jobs',    colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  'job.completed':           { label: 'Job completed',           group: 'Jobs',    colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  'job.partially_completed': { label: 'Job partially completed', group: 'Jobs',    colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  'job.failed':              { label: 'Job failed',              group: 'Jobs',    colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
  'job.approved':            { label: 'Job approved',            group: 'Jobs',    colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  'job.rejected':            { label: 'Job rejected',            group: 'Jobs',    colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
  'mapping.template_updated':{ label: 'Mapping template updated',group: 'Mappings',colour: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  'mapping.conflict':        { label: 'Mapping conflict',        group: 'Mappings',colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  'quota.warning':           { label: 'Quota warning',           group: 'Quota',   colour: '#92620A', bg: '#FFF8E6', border: '#F5D98C' },
  'quota.exceeded':          { label: 'Quota exceeded',          group: 'Quota',   colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
};

// ── Teams Adaptive Card formatter ────────────────────────────────────────────

function formatTeamsCard(event: WebhookEvent, payload: Record<string, unknown>): string {
  const meta = WEBHOOK_EVENT_META[event] ?? { label: event, colour: '#1E40AF' };

  const factRows: { title: string; value: string }[] = [];
  if (payload.filename)       factRows.push({ title: 'File',      value: String(payload.filename) });
  if (payload.processedCount !== undefined) factRows.push({ title: 'Processed', value: String(payload.processedCount) });
  if (payload.errorCount !== undefined)     factRows.push({ title: 'Errors',    value: String(payload.errorCount) });
  if (payload.mappingName)    factRows.push({ title: 'Mapping',   value: String(payload.mappingName) });
  if (payload.metric)         factRows.push({ title: 'Metric',    value: String(payload.metric) });
  if (payload.percentUsed !== undefined) factRows.push({ title: 'Usage', value: `${payload.percentUsed}%` });
  factRows.push({ title: 'Time', value: new Date().toUTCString() });

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.5',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: `Mysoft: ${meta.label}`,
              color: 'Accent',
            },
            ...(factRows.length > 0 ? [{
              type: 'FactSet',
              facts: factRows,
            }] : []),
            ...(payload.errorMessage ? [{
              type: 'TextBlock',
              text: `Error: ${payload.errorMessage}`,
              color: 'Attention',
              wrap: true,
            }] : []),
          ],
          actions: payload.jobId ? [
            {
              type: 'Action.OpenUrl',
              title: 'View job',
              url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/jobs`,
            },
          ] : [],
        },
      },
    ],
  };

  return JSON.stringify(card);
}

// ── Slack Block Kit formatter ────────────────────────────────────────────────

function formatSlackMessage(event: WebhookEvent, payload: Record<string, unknown>): string {
  const meta = WEBHOOK_EVENT_META[event] ?? { label: event };

  const fields: string[] = [];
  if (payload.filename)       fields.push(`*File:*\n\`${payload.filename}\``);
  if (payload.processedCount !== undefined) fields.push(`*Processed:*\n${payload.processedCount} rows`);
  if (payload.errorCount !== undefined)     fields.push(`*Errors:*\n${payload.errorCount}`);
  if (payload.mappingName)    fields.push(`*Mapping:*\n${payload.mappingName}`);
  if (payload.metric)         fields.push(`*Metric:*\n${payload.metric}`);
  if (payload.percentUsed !== undefined) fields.push(`*Usage:*\n${payload.percentUsed}%`);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Mysoft · ${meta.label}` },
    },
  ];

  if (fields.length > 0) {
    blocks.push({
      type: 'section',
      fields: fields.map((f) => ({ type: 'mrkdwn', text: f })),
    });
  }

  if (payload.errorMessage) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠ *Error:* ${payload.errorMessage}` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Event: \`${event}\` · ${new Date().toUTCString()}`,
      },
    ],
  });

  return JSON.stringify({
    text: `Mysoft · ${meta.label}`,  // fallback for notifications
    blocks,
  });
}

// ── Core dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatch a webhook event to all enabled, matching endpoints for a tenant.
 * Non-blocking — errors are caught and written to delivery log; never thrown.
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();

  const { data: endpoints } = await (admin as any)
    .from('webhook_endpoints')
    .select('id, url, secret, channel_type')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .contains('events', [event]);

  if (!endpoints || endpoints.length === 0) return;

  const basePayload: Record<string, unknown> = {
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  await Promise.allSettled(
    endpoints.map(async (ep: { id: string; url: string; secret: string | null; channel_type: ChannelType }) => {
      const channelType: ChannelType = ep.channel_type ?? 'generic';

      // Format body per channel type
      const body = channelType === 'teams'
        ? formatTeamsCard(event, basePayload)
        : channelType === 'slack'
          ? formatSlackMessage(event, basePayload)
          : JSON.stringify(basePayload);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mysoft-Integration-Platform/1.0',
        'X-Mysoft-Event': event,
      };

      // HMAC signing (always on raw body, before channel-specific formatting)
      if (ep.secret && channelType === 'generic') {
        const sig = crypto
          .createHmac('sha256', ep.secret)
          .update(body)
          .digest('hex');
        headers['X-Mysoft-Signature'] = `sha256=${sig}`;
      }

      let statusCode: number | null = null;
      let lastError: string | null = null;
      let responseBody: string | null = null;
      const startMs = Date.now();

      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          try { responseBody = await res.text(); } catch { /* ignore */ }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Request failed';
      }

      const durationMs = Date.now() - startMs;

      // Update last_triggered_at on endpoint
      await admin
        .from('webhook_endpoints')
        .update({
          last_triggered_at: new Date().toISOString(),
          last_status_code: statusCode,
          last_error: lastError,
        })
        .eq('id', ep.id);

      // Write delivery log
      await (admin as any)
        .from('webhook_delivery_log')
        .insert({
          endpoint_id: ep.id,
          tenant_id: tenantId,
          event,
          payload: basePayload,
          status_code: statusCode,
          response_body: responseBody ? responseBody.slice(0, 2000) : null,
          error: lastError,
          duration_ms: durationMs,
        });
    })
  );
}

/**
 * Dispatch a mapping-related event.
 */
export async function dispatchMappingEvent(
  tenantId: string,
  event: 'mapping.template_updated' | 'mapping.conflict',
  payload: MappingWebhookPayload
): Promise<void> {
  return dispatchWebhooks(tenantId, event, payload as unknown as Record<string, unknown>);
}

/**
 * Dispatch a quota event.
 */
export async function dispatchQuotaEvent(
  tenantId: string,
  event: 'quota.warning' | 'quota.exceeded',
  payload: QuotaWebhookPayload
): Promise<void> {
  return dispatchWebhooks(tenantId, event, payload as unknown as Record<string, unknown>);
}
