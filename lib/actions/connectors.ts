'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/actions/audit';
import { getAuthContext } from '@/lib/actions/auth-context';

// ── Connector CRUD ─────────────────────────────────────────────────────────────

export type ConnectorFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  connectorId?: string;
};

export async function createConnector(
  _prev: ConnectorFormState,
  formData: FormData,
): Promise<ConnectorFormState> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const connectorKey = (formData.get('connector_key') as string)?.trim().toLowerCase().replace(/\s+/g, '_');
  const displayName  = (formData.get('display_name') as string)?.trim();
  const description  = (formData.get('description') as string)?.trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!connectorKey) fieldErrors.connector_key = 'Connector key is required';
  if (!displayName)  fieldErrors.display_name  = 'Display name is required';
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { data: connector, error } = await (admin as any)
    .from('endpoint_connectors')
    .insert({
      connector_key: connectorKey,
      display_name: displayName,
      description,
      is_system: false,
      is_active: true,
      capabilities: {},
      created_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'A connector with this key already exists' };
    return { error: error.message };
  }

  await logAudit({
    userId: ctx.userId,
    operation: 'create_connector',
    resourceType: 'endpoint_connector',
    resourceId: connector.id,
    newValues: { connector_key: connectorKey, display_name: displayName },
  });

  revalidatePath('/platform/connectors');
  redirect(`/platform/connectors/${connector.id}`);
}

export async function updateConnector(
  connectorId: string,
  _prev: ConnectorFormState,
  formData: FormData,
): Promise<ConnectorFormState> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const displayName   = (formData.get('display_name') as string)?.trim();
  const description   = (formData.get('description') as string)?.trim() || null;
  const isActive      = formData.get('is_active') !== 'false';

  const fieldErrors: Record<string, string> = {};
  if (!displayName) fieldErrors.display_name = 'Display name is required';
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('endpoint_connectors')
    .update({ display_name: displayName, description, is_active: isActive })
    .eq('id', connectorId)
    .eq('is_system', false); // system connectors cannot be edited via UI

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    operation: 'update_connector',
    resourceType: 'endpoint_connector',
    resourceId: connectorId,
    newValues: { display_name: displayName, is_active: isActive },
  });

  revalidatePath('/platform/connectors');
  revalidatePath(`/platform/connectors/${connectorId}`);
  return {};
}

// ── Object Type CRUD ───────────────────────────────────────────────────────────

export type ObjectTypeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  objectTypeId?: string;
};

export async function createObjectType(
  connectorId: string,
  _prev: ObjectTypeFormState,
  formData: FormData,
): Promise<ObjectTypeFormState> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const objectKey     = (formData.get('object_key') as string)?.trim().toLowerCase().replace(/\s+/g, '_');
  const displayName   = (formData.get('display_name') as string)?.trim();
  const description   = (formData.get('description') as string)?.trim() || null;
  const apiObjectName = (formData.get('api_object_name') as string)?.trim() || null;
  const fieldsJson    = formData.get('field_schema') as string;

  const fieldErrors: Record<string, string> = {};
  if (!objectKey)   fieldErrors.object_key   = 'Object key is required';
  if (!displayName) fieldErrors.display_name = 'Display name is required';

  let field_schema: unknown = null;
  if (fieldsJson) {
    try {
      field_schema = JSON.parse(fieldsJson);
    } catch {
      fieldErrors.field_schema = 'Invalid JSON for field schema';
    }
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { data: ot, error } = await (admin as any)
    .from('endpoint_object_types')
    .insert({
      connector_id: connectorId,
      object_key: objectKey,
      display_name: displayName,
      description,
      api_object_name: apiObjectName,
      field_schema,
      is_system: false,
      is_active: true,
      created_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'An object type with this key already exists for this connector' };
    return { error: error.message };
  }

  await logAudit({
    userId: ctx.userId,
    operation: 'create_object_type',
    resourceType: 'endpoint_object_type',
    resourceId: ot.id,
    newValues: { object_key: objectKey, display_name: displayName, connector_id: connectorId },
  });

  revalidatePath(`/platform/connectors/${connectorId}/object-types`);
  redirect(`/platform/connectors/${connectorId}/object-types`);
}

export async function updateObjectType(
  objectTypeId: string,
  connectorId: string,
  _prev: ObjectTypeFormState,
  formData: FormData,
): Promise<ObjectTypeFormState> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const displayName   = (formData.get('display_name') as string)?.trim();
  const description   = (formData.get('description') as string)?.trim() || null;
  const apiObjectName = (formData.get('api_object_name') as string)?.trim() || null;
  const isActive      = formData.get('is_active') !== 'false';
  const fieldsJson    = formData.get('field_schema') as string;

  const fieldErrors: Record<string, string> = {};
  if (!displayName) fieldErrors.display_name = 'Display name is required';

  let field_schema: unknown = null;
  if (fieldsJson) {
    try {
      field_schema = JSON.parse(fieldsJson);
    } catch {
      fieldErrors.field_schema = 'Invalid JSON for field schema';
    }
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('endpoint_object_types')
    .update({
      display_name: displayName,
      description,
      api_object_name: apiObjectName,
      field_schema,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', objectTypeId)
    .eq('is_system', false); // system types cannot be edited via UI

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    operation: 'update_object_type',
    resourceType: 'endpoint_object_type',
    resourceId: objectTypeId,
    newValues: { display_name: displayName, is_active: isActive },
  });

  revalidatePath(`/platform/connectors/${connectorId}/object-types`);
  return {};
}

export async function deleteObjectType(
  objectTypeId: string,
  connectorId: string,
): Promise<{ error?: string }> {
  const ctx = await getAuthContext(['platform_super_admin']);
  if (!ctx) return { error: 'Platform Super Admin access required' };

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('endpoint_object_types')
    .delete()
    .eq('id', objectTypeId)
    .eq('is_system', false); // system types cannot be deleted

  if (error) return { error: error.message };

  await logAudit({
    userId: ctx.userId,
    operation: 'delete_object_type',
    resourceType: 'endpoint_object_type',
    resourceId: objectTypeId,
  });

  revalidatePath(`/platform/connectors/${connectorId}/object-types`);
  redirect(`/platform/connectors/${connectorId}/object-types`);
}
