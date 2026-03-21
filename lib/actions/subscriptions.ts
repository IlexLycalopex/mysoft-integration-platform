'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { TenantSubscription, ActiveSubscription } from '@/types/database';
import {
  sendSubscriptionChangedEmail,
  sendSubscriptionCancelledEmail,
} from '@/lib/email';

export type SubscriptionActionState = {
  error?: string;
  success?: boolean;
};

async function requireSuperAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();
  if (profile?.role !== 'platform_super_admin') return null;
  return user.id;
}

export async function getActiveSubscription(tenantId: string): Promise<ActiveSubscription | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('active_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle<ActiveSubscription>();
  return data ?? null;
}

export async function getUpcomingSubscription(tenantId: string): Promise<TenantSubscription | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'upcoming')
    .maybeSingle<TenantSubscription>();
  return data ?? null;
}

export async function getSubscriptionHistory(tenantId: string): Promise<TenantSubscription[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return (data as TenantSubscription[] | null) ?? [];
}

export async function createOrChangeSubscription(
  tenantId: string,
  _prev: SubscriptionActionState,
  formData: FormData
): Promise<SubscriptionActionState> {
  const userId = await requireSuperAdmin();
  if (!userId) return { error: 'Super admin access required' };

  const planId = (formData.get('plan_id') as string ?? '').trim();
  const minMonths = Number(formData.get('min_months') ?? 1);
  const isFree = formData.get('is_free_of_charge') === 'true';
  const discountPct = Number(formData.get('discount_pct') ?? 0);
  const notes = (formData.get('notes') as string) || null;
  const customPriceStr = (formData.get('custom_price_gbp') as string ?? '').trim();
  const customPrice = customPriceStr !== '' && !isNaN(Number(customPriceStr)) ? Number(customPriceStr) : null;
  const commencementDateStr = (formData.get('commencement_date') as string ?? '').trim();
  const commencementDate = commencementDateStr || null;

  if (!planId) return { error: 'Plan is required' };
  if (minMonths < 1 || minMonths > 36) return { error: 'Minimum months must be between 1 and 36' };
  if (discountPct < 0 || discountPct > 100) return { error: 'Discount must be between 0 and 100' };

  const admin = createAdminClient();

  // Require at least one enabled connector licence
  const { data: enabledLicences } = await (admin as any)
    .from('tenant_connector_licences')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .limit(1);

  if (!enabledLicences || enabledLicences.length === 0) {
    return { error: 'This tenant has no enabled connector licences. At least one connector must be licenced before creating or changing a subscription.' };
  }

  // Verify plan exists
  const { data: plan } = await admin
    .from('plans')
    .select('id, name')
    .eq('id', planId)
    .single<{ id: string; name: string }>();
  if (!plan) return { error: `Plan '${planId}' not found` };

  // Get tenant name and old subscription (for email)
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single<{ id: string; name: string }>();
  if (!tenant) return { error: 'Tenant not found' };

  const oldSub = await getActiveSubscription(tenantId);

  // Call atomic Postgres function
  const { data: newSubId, error } = await admin
    .rpc('change_tenant_subscription', {
      p_tenant_id: tenantId,
      p_plan_id: planId,
      p_min_months: minMonths,
      p_is_free_of_charge: isFree,
      p_discount_pct: discountPct,
      p_notes: notes,
      p_created_by: userId,
      p_commencement_date: commencementDate,
    });

  if (error) return { error: error.message };

  // If a custom price was provided (enterprise plans with no standard price), override plan_price_gbp
  if (customPrice !== null && !isFree && newSubId) {
    await admin
      .from('tenant_subscriptions')
      .update({ plan_price_gbp: customPrice })
      .eq('id', newSubId as string);
  }

  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/usage`);

  // If this was a future-dated change, return early (no email yet — email on activation)
  const isScheduled = commencementDate && new Date(commencementDate) > new Date();
  if (isScheduled) return { success: true };

  // Email notifications (non-blocking — don't fail the action on email error)
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const subscriptionUrl = `${appUrl}/platform/tenants/${tenantId}/subscription`;

    // Get tenant admin emails
    const { data: admins } = await admin
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'tenant_admin') as { data: { id: string }[] | null };

    const adminIds = (admins ?? []).map(a => a.id);
    let adminEmails: string[] = [];
    if (adminIds.length > 0) {
      const { data: { users } } = await admin.auth.admin.listUsers();
      adminEmails = users
        .filter(u => adminIds.includes(u.id) && u.email)
        .map(u => u.email as string);
    }

    const allRecipients = [...new Set([...adminEmails, 'jamie.watts@mysoftx3.com'])];

    for (const to of allRecipients) {
      await sendSubscriptionChangedEmail({
        to,
        tenantName: tenant.name,
        oldPlanName: oldSub?.plan_name ?? null,
        newPlanName: plan.name,
        effectiveDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        isFreeOfCharge: isFree,
        discountPct,
        subscriptionUrl,
      });
    }
  } catch (emailErr) {
    console.error('[subscription email] failed', emailErr);
    // Log to audit but don't fail the action
    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: userId,
      operation: 'subscription_email_failed',
      resource_type: 'subscription',
      resource_id: newSubId ?? undefined,
      new_values: { error: String(emailErr) },
    });
  }

  return { success: true };
}

export async function cancelSubscription(
  subscriptionId: string,
  tenantId: string,
  _prev: SubscriptionActionState,
  formData: FormData
): Promise<SubscriptionActionState> {
  const userId = await requireSuperAdmin();
  if (!userId) return { error: 'Super admin access required' };

  const notes = (formData.get('notes') as string) || 'Cancelled by platform admin';

  const admin = createAdminClient();

  // Get the subscription to know its period_end and plan
  const { data: sub } = await admin
    .from('tenant_subscriptions')
    .select('id, plan_id, period_end, tenant_id, commitment_end_date')
    .eq('id', subscriptionId)
    .single<{ id: string; plan_id: string; period_end: string; tenant_id: string; commitment_end_date: string }>();

  if (!sub) return { error: 'Subscription not found' };

  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single<{ name: string }>();

  const { data: plan } = await admin
    .from('plans')
    .select('name')
    .eq('id', sub.plan_id)
    .single<{ name: string }>();

  // Mark as cancelled — takes effect at period_end
  const { error } = await admin
    .from('tenant_subscriptions')
    .update({
      status: 'cancelled',
      cancellation_date: sub.period_end,
      cancelled_by: userId,
      cancelled_at: new Date().toISOString(),
      notes,
    })
    .eq('id', subscriptionId);

  if (error) return { error: error.message };

  // Audit
  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    user_id: userId,
    operation: 'subscription_cancelled',
    resource_type: 'subscription',
    resource_id: subscriptionId,
    new_values: { cancellation_date: sub.period_end, notes },
  });

  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  revalidatePath(`/platform/tenants/${tenantId}`);

  // Email notifications
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    const { data: admins } = await admin
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'tenant_admin') as { data: { id: string }[] | null };

    const adminIds = (admins ?? []).map(a => a.id);
    let adminEmails: string[] = [];
    if (adminIds.length > 0) {
      const { data: { users } } = await admin.auth.admin.listUsers();
      adminEmails = users
        .filter(u => adminIds.includes(u.id) && u.email)
        .map(u => u.email as string);
    }

    const allRecipients = [...new Set([...adminEmails, 'jamie.watts@mysoftx3.com'])];

    for (const to of allRecipients) {
      await sendSubscriptionCancelledEmail({
        to,
        tenantName: tenant?.name ?? tenantId,
        planName: plan?.name ?? sub.plan_id,
        cancellationDate: new Date(sub.period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        subscriptionUrl: `${appUrl}/platform/tenants/${tenantId}/subscription`,
      });
    }
  } catch (emailErr) {
    console.error('[subscription cancel email] failed', emailErr);
  }

  return { success: true };
}

export async function cancelUpcomingSubscription(
  subscriptionId: string,
  tenantId: string,
  _prev: SubscriptionActionState,
  _formData: FormData
): Promise<SubscriptionActionState> {
  const userId = await requireSuperAdmin();
  if (!userId) return { error: 'Super admin access required' };

  const admin = createAdminClient();

  const { error } = await admin
    .from('tenant_subscriptions')
    .update({
      status: 'cancelled',
      cancellation_date: new Date().toISOString().slice(0, 10),
      cancelled_by: userId,
      cancelled_at: new Date().toISOString(),
      notes: 'Pending plan change cancelled by platform admin',
    })
    .eq('id', subscriptionId)
    .eq('status', 'upcoming');

  if (error) return { error: error.message };

  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    user_id: userId,
    operation: 'subscription_upcoming_cancelled',
    resource_type: 'subscription',
    resource_id: subscriptionId,
  });

  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}
