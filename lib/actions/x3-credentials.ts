'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';
import { checkX3Health } from '@/lib/connectors/x3/client';
import { logAudit } from '@/lib/actions/audit';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { X3Credentials } from '@/lib/connectors/x3/types';
import type { UserRole } from '@/types/database';

// ── Public shape (no password) ────────────────────────────────────────────────

export interface X3CredentialsSummary {
  baseUrl:     string;
  solution:    string;
  folder:      string;
  username:    string;
  apiVersion?: string;
  useGraphQL?: boolean;
}

export type X3FormState = { error?: string; success?: boolean };

// ── Save ─────────────────────────────────────────────────────────────────────

export async function saveX3Credentials(
  _prev: X3FormState,
  formData: FormData
): Promise<X3FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) {
    return { error: 'You do not have permission to manage credentials' };
  }
  if (!profile.tenant_id) return { error: 'No tenant associated with your account' };

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);
  if (!effectiveTenantId) return { error: 'No tenant associated with your account' };

  const creds: X3Credentials = {
    baseUrl:    (formData.get('baseUrl')    as string)?.trim(),
    solution:   (formData.get('solution')   as string)?.trim(),
    folder:     (formData.get('folder')     as string)?.trim(),
    username:   (formData.get('username')   as string)?.trim(),
    password:   (formData.get('password')   as string),
    apiVersion: (formData.get('apiVersion') as string)?.trim() || undefined,
    useGraphQL: formData.get('useGraphQL') === 'true',
  };

  if (!creds.baseUrl)  return { error: 'Server URL is required' };
  if (!creds.solution) return { error: 'Solution code is required' };
  if (!creds.folder)   return { error: 'Folder code is required' };
  if (!creds.username) return { error: 'Username is required' };
  if (!creds.password) return { error: 'Password is required' };

  // Normalise URL — strip trailing slash
  creds.baseUrl = creds.baseUrl.replace(/\/$/, '');

  let blob;
  try {
    blob = encrypt(JSON.stringify(creds));
  } catch {
    return { error: 'Encryption key is not configured. Contact your administrator.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenant_credentials')
    .upsert({
      tenant_id:      effectiveTenantId,
      provider:       'sage_x3',
      encrypted_data: blob.ciphertext,
      iv:             blob.iv,
      auth_tag:       blob.authTag,
    }, { onConflict: 'tenant_id,provider' });

  if (error) return { error: error.message };

  await logAudit({
    userId:       user.id,
    tenantId:     effectiveTenantId,
    operation:    'save_credentials',
    resourceType: 'tenant_credentials',
    newValues:    { provider: 'sage_x3', baseUrl: creds.baseUrl, solution: creds.solution },
  });

  revalidatePath('/settings/integrations');
  return { success: true };
}

// ── Test Connection ───────────────────────────────────────────────────────────

export async function testX3Credentials(
  _prev: X3FormState,
  formData: FormData
): Promise<X3FormState> {
  const baseUrl  = (formData.get('baseUrl')  as string)?.trim().replace(/\/$/, '');
  const solution = (formData.get('solution') as string)?.trim();
  const folder   = (formData.get('folder')   as string)?.trim();
  const username = (formData.get('username') as string)?.trim();
  const password =  formData.get('password') as string;

  if (!baseUrl || !solution || !folder || !username || !password) {
    return { error: 'Fill in all required fields before testing' };
  }

  const creds: X3Credentials = {
    baseUrl,
    solution,
    folder,
    username,
    password,
    useGraphQL: formData.get('useGraphQL') === 'true',
  };

  try {
    const result = await checkX3Health(creds);
    if (!result.ok) {
      return { error: result.message ?? 'Connection failed — check server URL and credentials' };
    }
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Connection error' };
  }
}

// ── Read (for the connector runtime) ─────────────────────────────────────────

/**
 * Returns full X3Credentials for API use (server-side / job processing only).
 * Returns null if no credentials have been saved for the tenant.
 */
export async function getX3Credentials(tenantId: string): Promise<X3Credentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_credentials')
    .select('encrypted_data, iv, auth_tag')
    .eq('tenant_id', tenantId)
    .eq('provider', 'sage_x3')
    .single<{ encrypted_data: string; iv: string; auth_tag: string }>();

  if (!data) return null;

  try {
    const plaintext = decrypt({
      ciphertext: data.encrypted_data,
      iv:         data.iv,
      authTag:    data.auth_tag,
    });
    return JSON.parse(plaintext) as X3Credentials;
  } catch {
    return null;
  }
}

/**
 * Returns a safe (no-password) summary for displaying in the UI.
 */
export async function getX3CredentialsSummary(
  tenantId: string
): Promise<X3CredentialsSummary | null> {
  const creds = await getX3Credentials(tenantId);
  if (!creds) return null;
  return {
    baseUrl:    creds.baseUrl,
    solution:   creds.solution,
    folder:     creds.folder,
    username:   creds.username,
    apiVersion: creds.apiVersion,
    useGraphQL: creds.useGraphQL,
  };
}
