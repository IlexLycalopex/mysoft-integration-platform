'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';

export type TenantFormState = {
  error?: string;
  success?: boolean;
  tenantId?: string;
};

export async function createTenant(
  _prev: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Only Platform Super Admins can create tenants' };
  }

  const name = formData.get('name') as string;
  const region = formData.get('region') as string;

  if (!name?.trim()) return { error: 'Tenant name is required' };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const admin = createAdminClient();
  const { data: newTenant, error } = await admin
    .from('tenants')
    .insert({ name: name.trim(), slug, region: region as 'uk' | 'us' | 'eu' })
    .select('id')
    .single<{ id: string }>();

  if (error) {
    if (error.code === '23505') return { error: 'A tenant with that name already exists' };
    return { error: error.message };
  }

  await logAudit({ userId: user.id, operation: 'create_tenant', resourceType: 'tenant', resourceId: newTenant.id, newValues: { name, region } });

  revalidatePath('/platform/tenants');
  return { success: true, tenantId: newTenant.id };
}

export async function updateTenant(
  tenantId: string,
  _prev: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = formData.get('name') as string;
  const region = formData.get('region') as string;
  const fileRetentionDaysRaw = formData.get('file_retention_days') as string;
  const fileRetentionDays = fileRetentionDaysRaw
    ? Math.min(3650, Math.max(30, parseInt(fileRetentionDaysRaw, 10) || 90))
    : 90;
  const approvalRequired = formData.get('approval_required') === 'true';

  if (!name?.trim()) return { error: 'Tenant name is required' };

  // Fetch current settings to merge
  const admin = createAdminClient();
  const { data: currentTenant } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single<{ settings: Record<string, unknown> }>();
  const mergedSettings = { ...(currentTenant?.settings ?? {}), approval_required: approvalRequired ? 'true' : 'false' };

  const { error } = await supabase
    .from('tenants')
    .update({ name: name.trim(), region: region as 'uk' | 'us' | 'eu', file_retention_days: fileRetentionDays, settings: mergedSettings })
    .eq('id', tenantId);

  if (error) return { error: error.message };

  await logAudit({ userId: user.id, tenantId, operation: 'update_tenant', resourceType: 'tenant', resourceId: tenantId, newValues: { name, region, file_retention_days: fileRetentionDays, approval_required: approvalRequired } });

  revalidatePath('/settings');
  revalidatePath('/platform/tenants');
  return { success: true };
}

export async function platformUpdateTenant(
  tenantId: string,
  _prev: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (!['platform_super_admin', 'mysoft_support_admin'].includes(role.data as string)) {
    return { error: 'Platform admin access required' };
  }

  const name = (formData.get('name') as string)?.trim();
  const region = formData.get('region') as string;
  const status = formData.get('status') as string;

  if (!name) return { error: 'Tenant name is required' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({ name, region: region as 'uk' | 'us' | 'eu', status: status as 'active' | 'suspended' | 'trial' | 'offboarded' })
    .eq('id', tenantId);

  if (error) return { error: error.message };

  await logAudit({ userId: user.id, tenantId, operation: 'update_tenant', resourceType: 'tenant', resourceId: tenantId, newValues: { name, region, status } });

  revalidatePath('/platform/tenants');
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}

/**
 * Platform super admin only — soft-deletes a tenant by marking it offboarded.
 * Sets archived_at = now() which starts the 90-day data-purge countdown.
 * Blocked if the tenant has an active subscription.
 */
export async function archiveTenant(tenantId: string): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Only Platform Super Admins can archive tenants' };
  }

  const admin = createAdminClient();

  // Block if active subscription exists
  const { data: activeSub } = await admin
    .from('tenant_subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .is('superseded_by', null)
    .maybeSingle();

  if (activeSub) {
    return { error: 'This tenant has an active subscription. Cancel the subscription before archiving.' };
  }

  const { error } = await admin
    .from('tenants')
    .update({ status: 'offboarded', archived_at: new Date().toISOString() })
    .eq('id', tenantId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId,
    operation: 'archive_tenant',
    resourceType: 'tenant',
    resourceId: tenantId,
    newValues: { status: 'offboarded', archived_at: new Date().toISOString() },
  });

  revalidatePath('/platform/tenants');
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}

export async function createSandboxTenant(
  productionTenantId: string,
  _prev: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Only Platform Super Admins can create sandbox tenants' };
  }

  const admin = createAdminClient();

  const { data: prod } = await admin
    .from('tenants')
    .select('name, slug, region')
    .eq('id', productionTenantId)
    .single<{ name: string; slug: string; region: string }>();

  if (!prod) return { error: 'Production tenant not found' };

  // Enforce one sandbox per tenant
  const { data: existing } = await admin
    .from('tenants')
    .select('id')
    .eq('sandbox_of', productionTenantId)
    .maybeSingle();

  if (existing) return { error: 'A sandbox already exists for this tenant' };

  const sandboxSlug = `${prod.slug}-sandbox`;

  const { data: sandbox, error: insertError } = await admin
    .from('tenants')
    .insert({
      name: `${prod.name} (Sandbox)`,
      slug: sandboxSlug,
      region: prod.region as 'uk' | 'us' | 'eu',
      status: 'active',
      is_sandbox: true,
      sandbox_of: productionTenantId,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    if (insertError.code === '23505') return { error: 'Slug conflict — sandbox tenant name already in use' };
    return { error: insertError.message };
  }

  const cloneMappings = formData.get('cloneMappings') === 'true';
  if (cloneMappings && sandbox) {
    const { data: mappings } = await admin
      .from('field_mappings')
      .select('name, description, transaction_type, is_default, column_mappings')
      .eq('tenant_id', productionTenantId);

    if (mappings?.length) {
      await admin.from('field_mappings').insert(
        mappings.map((m) => ({ ...m, tenant_id: sandbox.id, created_by: user.id }))
      );
    }
  }

  await logAudit({
    userId: user.id,
    tenantId: productionTenantId,
    operation: 'create_sandbox_tenant',
    resourceType: 'tenant',
    resourceId: sandbox?.id,
    newValues: { sandbox_slug: sandboxSlug, clone_mappings: cloneMappings },
  });

  revalidatePath(`/platform/tenants/${productionTenantId}`);
  return { success: true };
}

export async function deleteTenant(
  tenantId: string,
  confirmedName: string
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Only Platform Super Admins can delete tenants' };
  }

  const admin = createAdminClient();

  const { data: result, error } = await admin.rpc('delete_tenant', {
    p_tenant_id: tenantId,
    p_confirmed_name: confirmedName,
    p_deleted_by: user.id,
  });

  if (error) return { error: error.message };
  if (result) return { error: result as string }; // function returns error text or NULL

  revalidatePath('/platform/tenants');
  return { success: true };
}

export async function detachSandboxTenant(
  sandboxTenantId: string
): Promise<TenantFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Platform Super Admin access required' };
  }

  const admin = createAdminClient();

  const { data: sandbox } = await admin
    .from('tenants')
    .select('id, sandbox_of, name')
    .eq('id', sandboxTenantId)
    .eq('is_sandbox', true)
    .single<{ id: string; sandbox_of: string; name: string }>();

  if (!sandbox) return { error: 'Sandbox tenant not found' };

  const { error } = await admin
    .from('tenants')
    .update({ sandbox_of: null, is_sandbox: false })
    .eq('id', sandboxTenantId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: sandbox.sandbox_of,
    operation: 'detach_sandbox_tenant',
    resourceType: 'tenant',
    resourceId: sandboxTenantId,
    newValues: { detached_name: sandbox.name },
  });

  revalidatePath(`/platform/tenants/${sandbox.sandbox_of}`);
  return { success: true };
}
