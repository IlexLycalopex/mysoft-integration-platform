'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import type { UserRole, TransactionType, ColumnMappingEntry } from '@/types/database';

const ALLOWED_ROLES: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];

async function getAuthorisedProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile || !ALLOWED_ROLES.includes(profile.role) || !profile.tenant_id) return null;
  return { user, profile };
}

export type MappingFormState = { error?: string; fieldErrors?: Record<string, string>; mappingId?: string; success?: boolean };

export async function createMapping(
  _prev: MappingFormState,
  formData: FormData
): Promise<MappingFormState> {
  const auth = await getAuthorisedProfile();
  if (!auth) return { error: 'Not authorised' };

  const name = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const transaction_type = formData.get('transaction_type') as TransactionType;
  const is_default = formData.get('is_default') === 'true';
  const mappingsJson = formData.get('column_mappings') as string;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Name is required';
  if (!transaction_type) fieldErrors.transaction_type = 'Transaction type is required';

  let column_mappings: ColumnMappingEntry[] = [];
  try {
    column_mappings = mappingsJson ? JSON.parse(mappingsJson) : [];
  } catch {
    fieldErrors.column_mappings = 'Invalid mapping data';
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();

  // If setting as default, unset any existing default for this type
  if (is_default) {
    await admin
      .from('field_mappings')
      .update({ is_default: false })
      .eq('tenant_id', auth.profile.tenant_id!)
      .eq('transaction_type', transaction_type)
      .eq('is_default', true);
  }

  const { data: mapping, error } = await admin
    .from('field_mappings')
    .insert({
      tenant_id: auth.profile.tenant_id!,
      created_by: auth.user.id,
      name,
      description,
      transaction_type,
      is_default,
      column_mappings,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    tenantId: auth.profile.tenant_id!,
    operation: 'create_mapping',
    resourceType: 'field_mapping',
    resourceId: mapping.id,
    newValues: { name, transaction_type },
  });

  revalidatePath('/mappings');
  redirect(`/mappings/${mapping.id}`);
}

export async function updateMapping(
  mappingId: string,
  _prev: MappingFormState,
  formData: FormData
): Promise<MappingFormState> {
  const auth = await getAuthorisedProfile();
  if (!auth) return { error: 'Not authorised' };

  const name = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const transaction_type = formData.get('transaction_type') as TransactionType;
  const is_default = formData.get('is_default') === 'true';
  const mappingsJson = formData.get('column_mappings') as string;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Name is required';

  let column_mappings: ColumnMappingEntry[] = [];
  try {
    column_mappings = mappingsJson ? JSON.parse(mappingsJson) : [];
  } catch {
    fieldErrors.column_mappings = 'Invalid mapping data';
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();

  if (is_default) {
    await admin
      .from('field_mappings')
      .update({ is_default: false })
      .eq('tenant_id', auth.profile.tenant_id!)
      .eq('transaction_type', transaction_type)
      .eq('is_default', true)
      .neq('id', mappingId);
  }

  const { error } = await admin
    .from('field_mappings')
    .update({ name, description, transaction_type, is_default, column_mappings })
    .eq('id', mappingId)
    .eq('tenant_id', auth.profile.tenant_id!);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    tenantId: auth.profile.tenant_id!,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
    newValues: { name, transaction_type, column_count: column_mappings.length },
  });

  revalidatePath('/mappings');
  revalidatePath(`/mappings/${mappingId}`);
  return { success: true };
}

export async function cloneMapping(sourceMappingId: string): Promise<{ error?: string; mappingId?: string }> {
  const auth = await getAuthorisedProfile();
  if (!auth) return { error: 'Not authorised' };

  const admin = createAdminClient();

  // Fetch source — allows templates (tenant_id IS NULL) or own tenant mappings
  const { data: source, error: fetchErr } = await admin
    .from('field_mappings')
    .select('name, description, transaction_type, column_mappings')
    .eq('id', sourceMappingId)
    .single<{ name: string; description: string | null; transaction_type: TransactionType; column_mappings: ColumnMappingEntry[] }>();

  if (fetchErr || !source) return { error: 'Source mapping not found' };

  const { data: cloned, error } = await admin
    .from('field_mappings')
    .insert({
      tenant_id: auth.profile.tenant_id!,
      created_by: auth.user.id,
      name: `${source.name} (copy)`,
      description: source.description,
      transaction_type: source.transaction_type,
      is_default: false,
      column_mappings: source.column_mappings,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    tenantId: auth.profile.tenant_id!,
    operation: 'create_mapping',
    resourceType: 'field_mapping',
    resourceId: cloned.id,
    newValues: { name: `${source.name} (copy)`, cloned_from: sourceMappingId },
  });

  revalidatePath('/mappings');
  return { mappingId: cloned.id };
}

export async function deleteMapping(mappingId: string): Promise<{ error?: string }> {
  const auth = await getAuthorisedProfile();
  if (!auth) return { error: 'Not authorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('tenant_id', auth.profile.tenant_id!);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    tenantId: auth.profile.tenant_id!,
    operation: 'delete_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
  });

  revalidatePath('/mappings');
  redirect('/mappings');
}

// ─── Template management (platform_super_admin only) ───────────────────────

export type TemplateFormState = { error?: string; fieldErrors?: Record<string, string>; templateId?: string };

async function getPlatformSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();
  if (profile?.role !== 'platform_super_admin') return null;
  return { user, profile };
}

export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const auth = await getPlatformSuperAdmin();
  if (!auth) return { error: 'Platform Super Admin access required' };

  const name = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const transaction_type = formData.get('transaction_type') as TransactionType;
  const mappingsJson = formData.get('column_mappings') as string;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Name is required';
  if (!transaction_type) fieldErrors.transaction_type = 'Transaction type is required';

  let column_mappings: ColumnMappingEntry[] = [];
  try {
    column_mappings = mappingsJson ? JSON.parse(mappingsJson) : [];
  } catch {
    fieldErrors.column_mappings = 'Invalid mapping data';
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from('field_mappings')
    .insert({
      tenant_id: null,
      created_by: auth.user.id,
      name,
      description,
      transaction_type,
      is_default: false,
      is_template: true,
      template_status: 'draft',
      column_mappings,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    operation: 'create_mapping',
    resourceType: 'field_mapping',
    resourceId: template.id,
    newValues: { name, transaction_type, is_template: true },
  });

  revalidatePath('/platform/mappings');
  redirect(`/platform/mappings/${template.id}`);
}

export async function updateTemplate(
  templateId: string,
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const auth = await getPlatformSuperAdmin();
  if (!auth) return { error: 'Platform Super Admin access required' };

  const name = (formData.get('name') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const transaction_type = formData.get('transaction_type') as TransactionType;
  const mappingsJson = formData.get('column_mappings') as string;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Name is required';

  let column_mappings: ColumnMappingEntry[] = [];
  try {
    column_mappings = mappingsJson ? JSON.parse(mappingsJson) : [];
  } catch {
    fieldErrors.column_mappings = 'Invalid mapping data';
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .update({ name, description, transaction_type, column_mappings })
    .eq('id', templateId)
    .eq('is_template', true);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: templateId,
    newValues: { name, transaction_type },
  });

  revalidatePath('/platform/mappings');
  revalidatePath(`/platform/mappings/${templateId}`);
  return {};
}

export async function deleteTemplate(templateId: string): Promise<{ error?: string }> {
  const auth = await getPlatformSuperAdmin();
  if (!auth) return { error: 'Platform Super Admin access required' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .delete()
    .eq('id', templateId)
    .eq('is_template', true);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    operation: 'delete_mapping',
    resourceType: 'field_mapping',
    resourceId: templateId,
    newValues: { is_template: true },
  });

  revalidatePath('/platform/mappings');
  redirect('/platform/mappings');
}

export async function setTemplateStatus(
  templateId: string,
  status: 'draft' | 'published'
): Promise<{ error?: string }> {
  const auth = await getPlatformSuperAdmin();
  if (!auth) return { error: 'Platform Super Admin access required' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .update({ template_status: status })
    .eq('id', templateId)
    .eq('is_template', true);

  if (error) return { error: error.message };

  await logAudit({
    userId: auth.user.id,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: templateId,
    newValues: { template_status: status },
  });

  revalidatePath('/platform/mappings');
  revalidatePath(`/platform/mappings/${templateId}`);
  return {};
}
