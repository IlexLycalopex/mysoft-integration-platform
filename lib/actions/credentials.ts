'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';
import { testConnection } from '@/lib/intacct/client';
import { logAudit } from '@/lib/actions/audit';
import { getPlatformSenderCredentials } from '@/lib/actions/platform-credentials';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';

// Full merged credentials used internally for API calls
export interface IntacctCredentials {
  companyId: string;
  userId: string;
  userPassword: string;
  senderId: string;
  senderPassword: string;
  /** Optional entity/location ID for multi-entity companies. */
  entityId?: string;
}

// Only these fields are stored per-tenant (sender is platform-level)
interface TenantIntacctCredentials {
  companyId: string;
  userId: string;
  userPassword: string;
  /** Optional entity/location ID for multi-entity companies. */
  entityId?: string;
  // Legacy: credentials saved before the platform-sender split may include sender fields
  senderId?: string;
  senderPassword?: string;
}

export type CredFormState = { error?: string; success?: boolean };

export async function saveCredentials(
  _prev: CredFormState,
  formData: FormData
): Promise<CredFormState> {
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

  const entityIdRaw = (formData.get('entityId') as string | null)?.trim();
  const credentials: TenantIntacctCredentials = {
    companyId:    (formData.get('companyId')    as string)?.trim(),
    userId:       (formData.get('userId')       as string)?.trim(),
    userPassword:  formData.get('userPassword') as string,
    ...(entityIdRaw ? { entityId: entityIdRaw } : {}),
  };

  if (!credentials.companyId)    return { error: 'Company ID is required' };
  if (!credentials.userId)       return { error: 'User ID is required' };
  if (!credentials.userPassword) return { error: 'User password is required' };

  let blob;
  try {
    blob = encrypt(JSON.stringify(credentials));
  } catch {
    return { error: 'Encryption key is not configured. Contact your administrator.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenant_credentials')
    .upsert({
      tenant_id: effectiveTenantId,
      provider: 'intacct',
      encrypted_data: blob.ciphertext,
      iv: blob.iv,
      auth_tag: blob.authTag,
    }, { onConflict: 'tenant_id,provider' });

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    tenantId: effectiveTenantId,
    operation: 'save_credentials',
    resourceType: 'tenant_credentials',
    newValues: { provider: 'intacct', companyId: credentials.companyId },
  });

  revalidatePath('/settings/integrations');
  return { success: true };
}

export async function testCredentials(
  _prev: CredFormState,
  formData: FormData
): Promise<CredFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const companyId    = (formData.get('companyId')    as string)?.trim();
  const userId       = (formData.get('userId')       as string)?.trim();
  const userPassword =  formData.get('userPassword') as string;

  if (!companyId || !userId || !userPassword) {
    return { error: 'Fill in all fields before testing' };
  }

  // Merge with platform-level sender credentials
  const sender = await getPlatformSenderCredentials();
  if (!sender) {
    return { error: 'Platform Intacct sender credentials are not configured. Ask your platform administrator to set them up under Platform → Settings.' };
  }

  const credentials: IntacctCredentials = {
    companyId,
    userId,
    userPassword,
    senderId: sender.senderId,
    senderPassword: sender.senderPassword,
  };

  try {
    const result = await testConnection(credentials);
    if (!result.success) {
      const msg = result.errors?.[0]?.description ?? 'Connection failed';
      return { error: `Intacct rejected the credentials: ${msg}` };
    }
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Connection error' };
  }
}

/**
 * Returns the full merged credentials for API use.
 * Tenant fields (company/user) come from tenant_credentials.
 * Sender fields come from platform_credentials (falling back to legacy
 * tenant-stored sender fields for credentials saved before the split).
 */
export async function getCredentials(tenantId: string): Promise<IntacctCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_credentials')
    .select('encrypted_data, iv, auth_tag')
    .eq('tenant_id', tenantId)
    .eq('provider', 'intacct')
    .single<{ encrypted_data: string; iv: string; auth_tag: string }>();

  if (!data) return null;

  let tenantCreds: TenantIntacctCredentials;
  try {
    const plaintext = decrypt({
      ciphertext: data.encrypted_data,
      iv: data.iv,
      authTag: data.auth_tag,
    });
    tenantCreds = JSON.parse(plaintext) as TenantIntacctCredentials;
  } catch {
    return null;
  }

  // Prefer platform-level sender; fall back to legacy tenant-stored sender
  const sender = await getPlatformSenderCredentials();

  // Sender credential priority:
  // 1. Platform DB (Platform → Settings)
  // 2. Legacy tenant-stored sender (pre-split credentials)
  // 3. Environment variables (local dev / Vercel env vars)
  // 4. Empty string → buildControl will throw a clear error
  return {
    companyId:      tenantCreds.companyId,
    userId:         tenantCreds.userId,
    userPassword:   tenantCreds.userPassword,
    senderId:       sender?.senderId       ?? tenantCreds.senderId       ?? process.env.INTACCT_SENDER_ID       ?? '',
    senderPassword: sender?.senderPassword ?? tenantCreds.senderPassword ?? process.env.INTACCT_SENDER_PASSWORD ?? '',
    ...(tenantCreds.entityId ? { entityId: tenantCreds.entityId } : {}),
  };
}
