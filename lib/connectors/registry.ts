/**
 * Connector Registry — types and data access for endpoint_connectors
 * and endpoint_object_types.
 *
 * Provides a resolution layer so the rest of the codebase can look up
 * field definitions without knowing whether they come from the DB registry
 * or the legacy intacct-fields.ts static file.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { INTACCT_FIELDS } from '@/lib/intacct-fields';

// ── Registry types ─────────────────────────────────────────────────────────────

export interface RegistryFieldDefinition {
  key: string;
  label: string;
  description: string;
  required: boolean;
  group: string; // 'header' | 'line' | custom group names
}

export interface ObjectFieldSchema {
  fields: RegistryFieldDefinition[];
}

export interface EndpointConnector {
  id: string;
  connectorKey: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  isSystem: boolean;
  isActive: boolean;
  capabilities: Record<string, unknown>;
  sortOrder: number;
}

export interface EndpointObjectType {
  id: string;
  connectorId: string;
  connectorKey: string;
  objectKey: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  fieldSchema: ObjectFieldSchema | null;
  apiObjectName: string | null;
  sortOrder: number;
}

// ── Data access ────────────────────────────────────────────────────────────────

export async function getConnectors(): Promise<EndpointConnector[]> {
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('endpoint_connectors')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    connectorKey: row.connector_key,
    displayName: row.display_name,
    description: row.description,
    logoUrl: row.logo_url,
    isSystem: row.is_system,
    isActive: row.is_active,
    capabilities: row.capabilities ?? {},
    sortOrder: row.sort_order,
  }));
}

export async function getConnectorById(id: string): Promise<EndpointConnector | null> {
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('endpoint_connectors')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    connectorKey: data.connector_key,
    displayName: data.display_name,
    description: data.description,
    logoUrl: data.logo_url,
    isSystem: data.is_system,
    isActive: data.is_active,
    capabilities: data.capabilities ?? {},
    sortOrder: data.sort_order,
  };
}

export async function getObjectTypesForConnector(connectorId: string): Promise<EndpointObjectType[]> {
  const admin = createAdminClient();
  const { data: connector } = await (admin as any)
    .from('endpoint_connectors')
    .select('connector_key')
    .eq('id', connectorId)
    .single();

  const { data, error } = await (admin as any)
    .from('endpoint_object_types')
    .select('*')
    .eq('connector_id', connectorId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    connectorId: row.connector_id,
    connectorKey: connector?.connector_key ?? '',
    objectKey: row.object_key,
    displayName: row.display_name,
    description: row.description,
    isSystem: row.is_system,
    isActive: row.is_active,
    fieldSchema: row.field_schema ?? null,
    apiObjectName: row.api_object_name,
    sortOrder: row.sort_order,
  }));
}

export async function getObjectTypeById(id: string): Promise<EndpointObjectType | null> {
  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('endpoint_object_types')
    .select('*, endpoint_connectors(connector_key)')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    connectorId: data.connector_id,
    connectorKey: data.endpoint_connectors?.connector_key ?? '',
    objectKey: data.object_key,
    displayName: data.display_name,
    description: data.description,
    isSystem: data.is_system,
    isActive: data.is_active,
    fieldSchema: data.field_schema ?? null,
    apiObjectName: data.api_object_name,
    sortOrder: data.sort_order,
  };
}

// ── Field resolution ───────────────────────────────────────────────────────────
// Resolves fields for a mapping row — tries DB registry first, falls back to
// legacy intacct-fields.ts static data.

export async function resolveFieldsForObjectType(
  transactionType: string | null,
  objectTypeId: string | null,
): Promise<RegistryFieldDefinition[]> {
  // If we have an object_type_id, use the registry
  if (objectTypeId) {
    const ot = await getObjectTypeById(objectTypeId);
    if (ot?.fieldSchema?.fields) return ot.fieldSchema.fields;
  }

  // Fall back to static intacct-fields.ts
  if (transactionType && INTACCT_FIELDS[transactionType]) {
    return INTACCT_FIELDS[transactionType].map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      required: f.required,
      group: f.group,
    }));
  }

  return [];
}

// Synchronous version using pre-loaded registry data (for client components
// where async is not available at render time).
export function resolveFieldsSync(
  transactionType: string | null,
  objectTypeSchema: ObjectFieldSchema | null,
): RegistryFieldDefinition[] {
  if (objectTypeSchema?.fields) return objectTypeSchema.fields;

  if (transactionType && INTACCT_FIELDS[transactionType]) {
    return INTACCT_FIELDS[transactionType].map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      required: f.required,
      group: f.group,
    }));
  }

  return [];
}
