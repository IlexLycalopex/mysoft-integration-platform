'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INTACCT_FIELDS } from '@/lib/intacct-fields';
import type { UserRole } from '@/types/database';
import type { DiscoveredField } from '@/lib/connectors/connector.interface';
import type { RegistryFieldDefinition } from '@/lib/connectors/registry';

// ── Cache TTL ──────────────────────────────────────────────────────────────────
const DEFAULT_TTL_HOURS = 24;

/**
 * Get fields for an object type, using the cache hierarchy:
 *   1. Tenant-specific cache (freshest, may include custom fields)
 *   2. Platform-level cache
 *   3. Static endpoint_object_types.field_schema (from DB registry)
 *   4. Hardcoded intacct-fields.ts (final fallback)
 */
export async function getFieldsForObjectType(
  connectorKey: string,
  objectTypeKey: string,
  tenantId?: string | null,
): Promise<{ fields: RegistryFieldDefinition[]; source: 'cache_tenant' | 'cache_platform' | 'registry' | 'static'; cachedAt?: string }> {
  const admin = createAdminClient();

  // 1. Try tenant-specific cache
  if (tenantId) {
    const { data: tenantCache } = await (admin as any)
      .from('connector_field_cache')
      .select('schema_data, discovered_at, ttl_hours')
      .eq('connector_key', connectorKey)
      .eq('object_type_key', objectTypeKey)
      .eq('tenant_id', tenantId)
      .single();

    if (tenantCache && !isCacheExpired(tenantCache.discovered_at, tenantCache.ttl_hours)) {
      return {
        fields: tenantCache.schema_data as RegistryFieldDefinition[],
        source: 'cache_tenant',
        cachedAt: tenantCache.discovered_at,
      };
    }
  }

  // 2. Try platform-level cache (tenant_id IS NULL)
  const { data: platformCache } = await (admin as any)
    .from('connector_field_cache')
    .select('schema_data, discovered_at, ttl_hours')
    .eq('connector_key', connectorKey)
    .eq('object_type_key', objectTypeKey)
    .is('tenant_id', null)
    .single();

  if (platformCache && !isCacheExpired(platformCache.discovered_at, platformCache.ttl_hours)) {
    return {
      fields: platformCache.schema_data as RegistryFieldDefinition[],
      source: 'cache_platform',
      cachedAt: platformCache.discovered_at,
    };
  }

  // 3. Try registry field_schema
  const { data: objectType } = await (admin as any)
    .from('endpoint_object_types')
    .select('field_schema, endpoint_connectors(connector_key)')
    .eq('object_key', objectTypeKey)
    .eq('endpoint_connectors.connector_key', connectorKey)
    .single();

  if (objectType?.field_schema?.fields) {
    return {
      fields: objectType.field_schema.fields as RegistryFieldDefinition[],
      source: 'registry',
    };
  }

  // 4. Hardcoded fallback
  const staticFields = INTACCT_FIELDS[objectTypeKey] ?? [];
  return {
    fields: staticFields.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      required: f.required,
      group: f.group,
    })),
    source: 'static',
  };
}

/**
 * Trigger field discovery from the connector API and write to cache.
 * Requires the tenant to have valid credentials configured.
 */
export async function refreshFieldCache(
  connectorKey: string,
  objectTypeKey: string,
): Promise<{ error?: string; fieldCount?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) return { error: 'Forbidden' };

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  const tenantId = isPlatformAdmin ? null : profile.tenant_id;

  // Only Intacct supported for now
  if (connectorKey !== 'intacct') {
    return { error: `Field discovery not supported for connector: ${connectorKey}` };
  }

  let fields: DiscoveredField[] = [];

  try {
    if (tenantId) {
      // Use tenant credentials for per-tenant discovery
      const admin = createAdminClient();
      const { data: creds } = await admin
        .from('tenant_credentials')
        .select('encrypted_data, iv, auth_tag')
        .eq('tenant_id', tenantId)
        .eq('provider', 'intacct')
        .single();

      if (!creds) return { error: 'No Intacct credentials configured for this tenant. Please set up your credentials first.' };

      const { discoverIntacctFields } = await import('@/lib/connectors/intacct/field-discovery');
      const { decrypt } = await import('@/lib/crypto');
      const decrypted = JSON.parse(decrypt({ ciphertext: creds.encrypted_data, iv: creds.iv, authTag: creds.auth_tag }));

      fields = await discoverIntacctFields(objectTypeKey, decrypted as any);
    } else {
      // Platform-level: use static fallback (no platform Intacct credentials by default)
      const { discoverIntacctFields } = await import('@/lib/connectors/intacct/field-discovery');
      fields = await discoverIntacctFields(objectTypeKey, {} as any);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Discovery failed';
    return { error: `Field discovery failed: ${msg}` };
  }

  if (fields.length === 0) {
    return { error: 'No fields returned from API — check credentials and try again' };
  }

  // Write to cache (upsert)
  const admin = createAdminClient();
  const { error: cacheErr } = await (admin as any)
    .from('connector_field_cache')
    .upsert({
      connector_key:   connectorKey,
      object_type_key: objectTypeKey,
      tenant_id:       tenantId,
      schema_data:     fields,
      source:          'api',
      ttl_hours:       DEFAULT_TTL_HOURS,
      discovered_at:   new Date().toISOString(),
      discovered_by:   user.id,
    }, { onConflict: 'connector_key,object_type_key,tenant_id' });

  if (cacheErr) return { error: cacheErr.message };

  revalidatePath('/mappings');
  return { fieldCount: fields.length };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isCacheExpired(discoveredAt: string, ttlHours: number): boolean {
  const age = Date.now() - new Date(discoveredAt).getTime();
  return age > ttlHours * 60 * 60 * 1000;
}
