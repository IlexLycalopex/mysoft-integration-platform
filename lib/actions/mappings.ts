'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import { getAuthContext } from '@/lib/actions/auth-context';
import type { TransactionType, ColumnMappingEntry } from '@/types/database';

const TENANT_ROLES = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'] as const;

export type MappingFormState = { error?: string; fieldErrors?: Record<string, string>; mappingId?: string; success?: boolean };

export async function createMapping(
  _prev: MappingFormState,
  formData: FormData
): Promise<MappingFormState> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

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
      .eq('tenant_id', ctx.tenantId!)
      .eq('transaction_type', transaction_type)
      .eq('is_default', true);
  }

  const { data: mapping, error } = await admin
    .from('field_mappings')
    .insert({
      tenant_id: ctx.tenantId!,
      created_by: ctx.userId,
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
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
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
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

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
      .eq('tenant_id', ctx.tenantId!)
      .eq('transaction_type', transaction_type)
      .eq('is_default', true)
      .neq('id', mappingId);
  }

  const { error } = await admin
    .from('field_mappings')
    .update({ name, description, transaction_type, is_default, column_mappings })
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!);

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
    newValues: { name, transaction_type, column_count: column_mappings.length },
  });

  revalidatePath('/mappings');
  revalidatePath(`/mappings/${mappingId}`);
  return { success: true };
}

export async function cloneMapping(
  sourceMappingId: string,
  inheritanceMode: 'standalone' | 'linked' | 'inherit' = 'standalone',
): Promise<{ error?: string; mappingId?: string }> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

  const admin = createAdminClient();

  // Fetch source — allows templates (tenant_id IS NULL) or own tenant mappings
  const { data: source, error: fetchErr } = await (admin as any)
    .from('field_mappings')
    .select('name, description, transaction_type, object_type_id, column_mappings, is_template, template_version')
    .eq('id', sourceMappingId)
    .single();

  if (fetchErr || !source) return { error: 'Source mapping not found' };

  // For 'inherit' mode: mark all rows as override_state: 'inherited'
  let column_mappings = source.column_mappings ?? [];
  if (inheritanceMode === 'inherit') {
    column_mappings = column_mappings.map((row: ColumnMappingEntry) => ({
      ...row,
      override_state: 'inherited',
    }));
  }

  // Only link to parent if source is a platform template
  const parentLink = source.is_template && inheritanceMode !== 'standalone'
    ? {
        parent_template_id: sourceMappingId,
        parent_template_version: source.template_version ?? 1,
        inheritance_mode: inheritanceMode,
        sync_status: 'up_to_date',
      }
    : {
        inheritance_mode: 'standalone',
      };

  const { data: cloned, error } = await (admin as any)
    .from('field_mappings')
    .insert({
      tenant_id: ctx.tenantId!,
      created_by: ctx.userId,
      name: `${source.name} (copy)`,
      description: source.description,
      transaction_type: source.transaction_type,
      object_type_id: source.object_type_id,
      is_default: false,
      column_mappings,
      ...parentLink,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
    operation: 'create_mapping',
    resourceType: 'field_mapping',
    resourceId: cloned.id,
    newValues: { name: `${source.name} (copy)`, cloned_from: sourceMappingId, inheritance_mode: inheritanceMode },
  });

  revalidatePath('/mappings');
  return { mappingId: cloned.id };
}

export async function deleteMapping(mappingId: string): Promise<{ error?: string }> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!);

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
    operation: 'delete_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
  });

  revalidatePath('/mappings');
  redirect('/mappings');
}

// ─── Template management (platform_super_admin only) ───────────────────────

export type TemplateFormState = { error?: string; fieldErrors?: Record<string, string>; templateId?: string };

export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

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
      created_by: ctx.userId,
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
    userId: ctx.userId,
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
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

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
    userId: ctx.userId,
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
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('field_mappings')
    .delete()
    .eq('id', templateId)
    .eq('is_template', true);

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
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
  status: 'draft' | 'published',
  changeSummary?: string,
): Promise<{ error?: string }> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const admin = createAdminClient();

  // Fetch current template for versioning
  const { data: current } = await (admin as any)
    .from('field_mappings')
    .select('template_version, column_mappings, template_status')
    .eq('id', templateId)
    .eq('is_template', true)
    .single();

  if (!current) return { error: 'Template not found' };

  const currentVersion: number = current.template_version ?? 1;
  const isPublishing = status === 'published' && current.template_status !== 'published';
  const nextVersion = isPublishing ? currentVersion + 1 : currentVersion;

  // Update template status (and version if publishing)
  const updatePayload: Record<string, unknown> = { template_status: status };
  if (isPublishing) updatePayload.template_version = nextVersion;

  const { error } = await (admin as any)
    .from('field_mappings')
    .update(updatePayload)
    .eq('id', templateId)
    .eq('is_template', true);

  if (error) return { error: error.message };

  // Write version snapshot when publishing
  if (isPublishing) {
    await (admin as any)
      .from('template_version_history')
      .insert({
        template_id: templateId,
        version: nextVersion,
        column_mappings: current.column_mappings ?? [],
        change_summary: changeSummary ?? null,
        published_by: ctx.userId,
      });

    // Notify all linked/inherit children that an update is available
    await (admin as any)
      .from('field_mappings')
      .update({ sync_status: 'update_available' })
      .eq('parent_template_id', templateId)
      .in('inheritance_mode', ['linked', 'inherit']);
  }

  await logAudit({
    userId: ctx.userId,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: templateId,
    newValues: { template_status: status, template_version: nextVersion },
  });

  revalidatePath('/platform/mappings');
  revalidatePath(`/platform/mappings/${templateId}`);
  return {};
}

// ── Inheritance management actions ────────────────────────────────────────────

export async function acceptTemplateUpdate(
  mappingId: string,
): Promise<{ error?: string }> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

  const admin = createAdminClient();

  // Load the child mapping
  const { data: child } = await (admin as any)
    .from('field_mappings')
    .select('parent_template_id, inheritance_mode, tenant_id')
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!)
    .single();

  if (!child) return { error: 'Mapping not found' };
  if (!child.parent_template_id) return { error: 'This mapping is not linked to a platform template' };
  if (child.inheritance_mode === 'standalone') return { error: 'Cannot accept update on a standalone mapping' };

  // Load the current platform template
  const { data: template } = await (admin as any)
    .from('field_mappings')
    .select('column_mappings, template_version')
    .eq('id', child.parent_template_id)
    .eq('is_template', true)
    .single();

  if (!template) return { error: 'Platform template not found' };

  let newColumnMappings = template.column_mappings;

  if (child.inheritance_mode === 'inherit') {
    // Load current child mappings for row-level merge
    const { data: currentChild } = await (admin as any)
      .from('field_mappings')
      .select('column_mappings')
      .eq('id', mappingId)
      .single();

    const { mergeInheritUpdate } = await import('@/lib/mapping-engine/merge');
    const result = mergeInheritUpdate(
      currentChild?.column_mappings ?? [],
      template.column_mappings,
    );
    newColumnMappings = result.merged;

    const newSyncStatus = result.conflictCount > 0 ? 'conflict' : 'up_to_date';
    const { error } = await (admin as any)
      .from('field_mappings')
      .update({
        column_mappings: newColumnMappings,
        parent_template_version: template.template_version,
        sync_status: newSyncStatus,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', mappingId)
      .eq('tenant_id', ctx.tenantId!);

    if (error) return { error: error.message };
  } else {
    // 'linked' mode: simple overwrite
    const { error } = await (admin as any)
      .from('field_mappings')
      .update({
        column_mappings: newColumnMappings,
        parent_template_version: template.template_version,
        sync_status: 'up_to_date',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', mappingId)
      .eq('tenant_id', ctx.tenantId!);

    if (error) return { error: error.message };
  }

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
    newValues: { accepted_template_version: template.template_version },
  });

  revalidatePath('/mappings');
  revalidatePath(`/mappings/${mappingId}`);
  return {};
}

export async function resolveRowConflict(
  mappingId: string,
  rowId: string,
  resolution: 'keep_mine' | 'accept_platform',
): Promise<{ error?: string }> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

  const admin = createAdminClient();

  const { data: child } = await (admin as any)
    .from('field_mappings')
    .select('column_mappings, parent_template_id, inheritance_mode, tenant_id')
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!)
    .single();

  if (!child) return { error: 'Mapping not found' };
  if (child.inheritance_mode !== 'inherit') return { error: 'Row conflict resolution is only available for inherit-mode mappings' };

  let platformEntry: unknown = undefined;

  if (resolution === 'accept_platform' && child.parent_template_id) {
    const { data: template } = await (admin as any)
      .from('field_mappings')
      .select('column_mappings')
      .eq('id', child.parent_template_id)
      .single();

    if (template) {
      platformEntry = (template.column_mappings as unknown[]).find(
        (r: any) => r.id === rowId,
      );
    }
  }

  const { resolveConflict } = await import('@/lib/mapping-engine/merge');
  const updatedMappings = resolveConflict(
    child.column_mappings,
    rowId,
    resolution,
    platformEntry as any,
  );

  // Check if any conflicts remain
  const remainingConflicts = updatedMappings.filter((r: any) => r.override_state === 'conflict');
  const newSyncStatus = remainingConflicts.length > 0 ? 'conflict' : 'up_to_date';

  const { error } = await (admin as any)
    .from('field_mappings')
    .update({
      column_mappings: updatedMappings,
      sync_status: newSyncStatus,
    })
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!);

  if (error) return { error: error.message };

  revalidatePath(`/mappings/${mappingId}`);
  return {};
}

export async function breakTemplateLink(
  mappingId: string,
): Promise<{ error?: string }> {
  const ctx = await getAuthContext([...TENANT_ROLES]);
  if (!ctx || !ctx.tenantId) return { error: 'Not authorised' };

  const admin = createAdminClient();

  // Clear override_state from all rows (become standalone custom mapping)
  const { data: child } = await (admin as any)
    .from('field_mappings')
    .select('column_mappings')
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!)
    .single();

  if (!child) return { error: 'Mapping not found' };

  const cleaned = (child.column_mappings as any[]).map(({ override_state, ...rest }: any) => rest);

  const { error } = await (admin as any)
    .from('field_mappings')
    .update({
      column_mappings: cleaned,
      parent_template_id: null,
      parent_template_version: null,
      inheritance_mode: 'standalone',
      sync_status: null,
      last_synced_at: null,
    })
    .eq('id', mappingId)
    .eq('tenant_id', ctx.tenantId!);

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId!,
    operation: 'update_mapping',
    resourceType: 'field_mapping',
    resourceId: mappingId,
    newValues: { inheritance_mode: 'standalone', broke_link: true },
  });

  revalidatePath('/mappings');
  revalidatePath(`/mappings/${mappingId}`);
  return {};
}
