import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type WebhookEvent = 'job.completed' | 'job.failed';

export interface WebhookPayload {
  jobId: string;
  tenantId: string;
  status: string;
  filename: string;
  processedCount: number;
  errorCount: number;
  recordNos: string[];
  errorMessage?: string;
}

/**
 * Dispatch a webhook event to all enabled endpoints for a tenant.
 * Non-blocking — errors are caught and logged but never thrown.
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<void> {
  const admin = createAdminClient();

  const { data: endpoints } = await admin
    .from('webhook_endpoints')
    .select('id, url, secret')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .contains('events', [event]);

  if (!endpoints || endpoints.length === 0) return;

  const body = JSON.stringify({
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  });

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mysoft-Integration-Platform/1.0',
      };

      if (ep.secret) {
        const sig = crypto
          .createHmac('sha256', ep.secret)
          .update(body)
          .digest('hex');
        headers['X-Mysoft-Signature'] = `sha256=${sig}`;
      }

      let statusCode: number | null = null;
      let lastError: string | null = null;

      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        if (!res.ok) lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Request failed';
      }

      // Update last_triggered_at regardless of success/failure
      await admin
        .from('webhook_endpoints')
        .update({
          last_triggered_at: new Date().toISOString(),
          last_status_code: statusCode,
          last_error: lastError,
        })
        .eq('id', ep.id);
    })
  );
}
