'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';

async function getAuthorisedAdmin(): Promise<
  { admin: ReturnType<typeof createAdminClient>; tenantId: string } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) return { error: 'Permission denied' };
  if (!profile.tenant_id) return { error: 'No tenant associated with your account' };

  return { admin: createAdminClient(), tenantId: profile.tenant_id };
}

export interface WebhookFormData {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
}

export type WebhookActionState = { error?: string; success?: boolean };

export async function createWebhook(
  _prev: WebhookActionState,
  formData: FormData
): Promise<WebhookActionState> {
  const ctx = await getAuthorisedAdmin();
  if ('error' in ctx) return { error: ctx.error };
  const { admin, tenantId } = ctx;

  const name = (formData.get('name') as string)?.trim();
  const url = (formData.get('url') as string)?.trim();
  const secret = (formData.get('secret') as string)?.trim() || null;
  const enabled = formData.get('enabled') === 'on';
  const events = formData.getAll('events') as string[];

  if (!name) return { error: 'Name is required' };
  if (!url || !url.startsWith('https://')) return { error: 'URL must start with https://' };
  if (events.length === 0) return { error: 'Select at least one event' };

  const { error } = await admin
    .from('webhook_endpoints')
    .insert({ tenant_id: tenantId, name, url, secret, events, enabled });

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

  const name = (formData.get('name') as string)?.trim();
  const url = (formData.get('url') as string)?.trim();
  const secret = (formData.get('secret') as string)?.trim() || undefined;
  const enabled = formData.get('enabled') === 'on';
  const events = formData.getAll('events') as string[];

  if (!name) return { error: 'Name is required' };
  if (!url || !url.startsWith('https://')) return { error: 'URL must start with https://' };
  if (events.length === 0) return { error: 'Select at least one event' };

  const updateData: Record<string, unknown> = { name, url, events, enabled };
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
      body: JSON.stringify({ event: 'test', message: 'Webhook test from Mysoft Integration Platform' }),
    });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Request failed' };
  }
}
