'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext } from '@/lib/actions/auth-context';
import { dispatchWebhooks } from '@/lib/webhooks';
import type { WebhookEvent, ChannelType } from '@/lib/webhooks';

async function getAuthorisedAdmin(): Promise<
  { admin: ReturnType<typeof createAdminClient>; tenantId: string; userId: string } | { error: string }
> {
  const ctx = await getAuthContext(['platform_super_admin', 'mysoft_support_admin', 'tenant_admin']);
  if (!ctx) return { error: 'Permission denied' };
  if (!ctx.tenantId) return { error: 'No tenant associated with your account' };
  return { admin: createAdminClient(), tenantId: ctx.tenantId, userId: ctx.userId };
}

export interface WebhookFormData {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  channel_type: ChannelType;
}

export type WebhookActionState = { error?: string; success?: boolean };

export async function createWebhook(
  _prev: WebhookActionState,
  formData: FormData
): Promise<WebhookActionState> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const name         = (formData.get('name') as string)?.trim();
  const url          = (formData.get('url') as string)?.trim();
  const secret       = (formData.get('secret') as string)?.trim() || null;
  const enabled      = formData.get('enabled') === 'on';
  const events       = formData.getAll('events') as string[];
  const channel_type = (formData.get('channel_type') as ChannelType) || 'generic';

  if (!name) return { error: 'Name is required' };
  if (!url || !url.startsWith('https://')) return { error: 'URL must start with https://' };
  if (events.length === 0) return { error: 'Select at least one event' };

  const { error } = await admin
    .from('webhook_endpoints')
    .insert({ tenant_id: tenantId, name, url, secret, events, enabled, channel_type });

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return { success: true };
}

export async function updateWebhook(
  id: string,
  _prev: WebhookActionState,
  formData: FormData
): Promise<WebhookActionState> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const name         = (formData.get('name') as string)?.trim();
  const url          = (formData.get('url') as string)?.trim();
  const secret       = (formData.get('secret') as string)?.trim() || undefined;
  const enabled      = formData.get('enabled') === 'on';
  const events       = formData.getAll('events') as string[];
  const channel_type = (formData.get('channel_type') as ChannelType) || 'generic';

  if (!name) return { error: 'Name is required' };
  if (!url || !url.startsWith('https://')) return { error: 'URL must start with https://' };
  if (events.length === 0) return { error: 'Select at least one event' };

  const updateData: Record<string, unknown> = { name, url, events, enabled, channel_type };
  if (secret !== undefined) updateData.secret = secret || null;

  const { error } = await admin
    .from('webhook_endpoints')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return { success: true };
}

export async function deleteWebhook(id: string): Promise<{ error?: string }> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const { error } = await admin
    .from('webhook_endpoints')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return {};
}

export async function testWebhook(id: string): Promise<{ error?: string; status?: number; ok?: boolean }> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const { data: webhook } = await admin
    .from('webhook_endpoints')
    .select('url')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single<{ url: string }>();

  if (!webhook) return { error: 'Webhook not found' };

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mysoft-Event': 'test' },
      body: JSON.stringify({ event: 'test', message: 'Webhook test from Mysoft Integration Platform', timestamp: new Date().toISOString() }),
    });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Request failed' };
  }
}

// ── Delivery log ──────────────────────────────────────────────────────────────

export interface DeliveryLogRow {
  id: string;
  endpoint_id: string;
  event: string;
  status_code: number | null;
  error: string | null;
  duration_ms: number | null;
  delivered_at: string;
  is_replay: boolean;
}

export async function getDeliveryLogs(endpointId: string): Promise<DeliveryLogRow[]> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return [];
  const { admin, tenantId } = ctx;

  const { data } = await (admin as any)
    .from('webhook_delivery_log')
    .select('id, endpoint_id, event, status_code, error, duration_ms, delivered_at, is_replay')
    .eq('endpoint_id', endpointId)
    .eq('tenant_id', tenantId)
    .order('delivered_at', { ascending: false })
    .limit(50);

  return (data ?? []) as DeliveryLogRow[];
}

export async function getRecentDeliveryLogs(tenantId: string): Promise<(DeliveryLogRow & { endpoint_name?: string })[]> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return [];
  const { admin } = ctx;

  const { data } = await (admin as any)
    .from('webhook_delivery_log')
    .select('id, endpoint_id, event, status_code, error, duration_ms, delivered_at, is_replay, webhook_endpoints(name)')
    .eq('tenant_id', tenantId)
    .order('delivered_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((r: any) => ({
    ...r,
    endpoint_name: r.webhook_endpoints?.name,
  })) as (DeliveryLogRow & { endpoint_name?: string })[];
}

export async function replayDelivery(logId: string): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  // Fetch original delivery
  const { data: log } = await (admin as any)
    .from('webhook_delivery_log')
    .select('id, endpoint_id, tenant_id, event, payload')
    .eq('id', logId)
    .eq('tenant_id', tenantId)
    .single();

  if (!log) return { error: 'Delivery log entry not found' };

  // Fetch the endpoint (may have been updated since original delivery)
  const { data: endpoint } = await admin
    .from('webhook_endpoints')
    .select('id, url, secret, enabled, channel_type')
    .eq('id', log.endpoint_id)
    .single<{ id: string; url: string; secret: string | null; enabled: boolean; channel_type: string }>();

  if (!endpoint) return { error: 'Webhook endpoint no longer exists' };
  if (!endpoint.enabled) return { error: 'Webhook endpoint is disabled' };

  // Re-dispatch the original payload
  const event = log.event as WebhookEvent;
  await dispatchWebhooks(tenantId, event, { ...log.payload, _replayed: true });

  // Mark original log entry to note replay happened
  await (admin as any)
    .from('webhook_delivery_log')
    .update({ is_replay: false }) // log entry itself is not a replay; the new one will be
    .eq('id', logId);

  return { ok: true };
}

// ── Inbound receivers ─────────────────────────────────────────────────────────

export interface ReceiverRow {
  id: string;
  name: string;
  description: string | null;
  receiver_key: string;
  enabled: boolean;
  created_at: string;
}

export type ReceiverActionState = { error?: string; success?: boolean };

export async function createReceiver(
  _prev: ReceiverActionState,
  formData: FormData
): Promise<ReceiverActionState> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId, userId } = ctx;

  const name        = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const secret      = (formData.get('secret') as string)?.trim() || null;

  if (!name) return { error: 'Name is required' };

  const { error } = await (admin as any)
    .from('webhook_receivers')
    .insert({ tenant_id: tenantId, name, description, secret, created_by: userId });

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return { success: true };
}

export async function deleteReceiver(id: string): Promise<{ error?: string }> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const { error } = await (admin as any)
    .from('webhook_receivers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return {};
}

export async function toggleReceiver(id: string, enabled: boolean): Promise<{ error?: string }> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const { error } = await (admin as any)
    .from('webhook_receivers')
    .update({ enabled })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath('/settings/webhooks');
  return {};
}
