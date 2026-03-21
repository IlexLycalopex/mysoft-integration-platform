'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ConnectorLicenceRow {
  id: string;
  tenant_id: string;
  connector_id: string;
  is_enabled: boolean;
  licence_type: 'included' | 'paid_monthly' | 'paid_annual' | 'trial' | 'complimentary';
  price_gbp_monthly: number | null;
  trial_ends_at: string | null;
  notes: string | null;
  enabled_by: string | null;
  enabled_at: string;
  created_at: string;
  updated_at: string;
  // Joined
  connector_key?: string;
  display_name?: string;
  connector_type?: string | null;
  is_active?: boolean;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getTenantConnectorLicences(tenantId: string): Promise<ConnectorLicenceRow[]> {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('tenant_connector_licences')
    .select(`
      *,
      endpoint_connectors ( connector_key, display_name, connector_type, is_active )
    `)
    .eq('tenant_id', tenantId)
    .order('enabled_at', { ascending: false });

  return (data ?? []).map((row: any) => ({
    ...row,
    connector_key:   row.endpoint_connectors?.connector_key,
    display_name:    row.endpoint_connectors?.display_name,
    connector_type:  row.endpoint_connectors?.connector_type,
    is_active:       row.endpoint_connectors?.is_active,
  }));
}

/** Returns connector IDs the tenant is licenced to use (enabled only). */
export async function getLicencedConnectorIds(tenantId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('tenant_connector_licences')
    .select('connector_id')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true);

  return (data ?? []).map((r: any) => r.connector_id as string);
}

/** Returns connector keys the tenant is licenced to use (enabled only). */
export async function getLicencedConnectorKeys(tenantId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from('tenant_connector_licences')
    .select('connector_id, endpoint_connectors(connector_key)')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true);

  return (data ?? [])
    .map((r: any) => r.endpoint_connectors?.connector_key as string)
    .filter(Boolean);
}

// ── Writes (platform admin only) ──────────────────────────────────────────────

export async function createConnectorLicence(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '')) {
    return { error: 'Forbidden' };
  }

  const tenantId    = formData.get('tenant_id') as string;
  const connectorId = formData.get('connector_id') as string;
  const licenceType = formData.get('licence_type') as string;
  const priceRaw    = formData.get('price_gbp_monthly') as string;
  const trialEnds   = formData.get('trial_ends_at') as string | null;
  const notes       = formData.get('notes') as string | null;

  const price = priceRaw && priceRaw !== '' ? parseFloat(priceRaw) : null;

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('tenant_connector_licences')
    .upsert({
      tenant_id:         tenantId,
      connector_id:      connectorId,
      is_enabled:        true,
      licence_type:      licenceType,
      price_gbp_monthly: price,
      trial_ends_at:     trialEnds || null,
      notes:             notes || null,
      enabled_by:        user.id,
      enabled_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'tenant_id,connector_id' });

  if (error) return { error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/connectors`);
  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  return { success: true };
}

export async function updateConnectorLicence(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '')) {
    return { error: 'Forbidden' };
  }

  const licenceId   = formData.get('licence_id') as string;
  const tenantId    = formData.get('tenant_id') as string;
  const licenceType = formData.get('licence_type') as string;
  const priceRaw    = formData.get('price_gbp_monthly') as string;
  const trialEnds   = formData.get('trial_ends_at') as string | null;
  const notes       = formData.get('notes') as string | null;
  const isEnabled   = formData.get('is_enabled') === 'true';

  const price = priceRaw && priceRaw !== '' ? parseFloat(priceRaw) : null;

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('tenant_connector_licences')
    .update({
      is_enabled:        isEnabled,
      licence_type:      licenceType,
      price_gbp_monthly: price,
      trial_ends_at:     trialEnds || null,
      notes:             notes || null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', licenceId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/connectors`);
  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  return { success: true };
}

export async function removeConnectorLicence(licenceId: string, tenantId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!['platform_super_admin'].includes(profile?.role ?? '')) {
    return { error: 'Only platform super admins can remove licences' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('tenant_connector_licences')
    .delete()
    .eq('id', licenceId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/connectors`);
  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  return { success: true };
}

export async function toggleConnectorLicence(licenceId: string, tenantId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '')) {
    return { error: 'Forbidden' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('tenant_connector_licences')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', licenceId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/connectors`);
  revalidatePath(`/platform/tenants/${tenantId}/subscription`);
  return { success: true };
}
