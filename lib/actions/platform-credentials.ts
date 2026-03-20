'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';
import { logAudit } from '@/lib/actions/audit';

export interface SenderCredentials {
  senderId: string;
  senderPassword: string;
}

export type PlatformCredFormState = { error?: string; success?: boolean };

export async function savePlatformSenderCredentials(
  _prev: PlatformCredFormState,
  formData: FormData
): Promise<PlatformCredFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = await supabase.rpc('get_my_role');
  if (role.data !== 'platform_super_admin') {
    return { error: 'Platform Super Admin access required' };
  }

  const senderId = (formData.get('senderId') as string)?.trim();
  const senderPassword = formData.get('senderPassword') as string;

  if (!senderId) return { error: 'Sender ID is required' };
  if (!senderPassword) return { error: 'Sender password is required' };

  let blob;
  try {
    blob = encrypt(JSON.stringify({ senderId, senderPassword }));
  } catch {
    return { error: 'Encryption key is not configured. Contact your administrator.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('platform_credentials')
    .upsert({
      provider: 'intacct_sender',
      encrypted_data: blob.ciphertext,
      iv: blob.iv,
      auth_tag: blob.authTag,
      updated_by: user.id,
    }, { onConflict: 'provider' });

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    operation: 'save_platform_credentials',
    resourceType: 'platform_credentials',
    newValues: { provider: 'intacct_sender', senderId },
  });

  revalidatePath('/platform/settings');
  return { success: true };
}

export async function getPlatformSenderCredentials(): Promise<SenderCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('platform_credentials')
    .select('encrypted_data, iv, auth_tag')
    .eq('provider', 'intacct_sender')
    .single<{ encrypted_data: string; iv: string; auth_tag: string }>();

  if (!data) return null;

  try {
    const plaintext = decrypt({
      ciphertext: data.encrypted_data,
      iv: data.iv,
      authTag: data.auth_tag,
    });
    return JSON.parse(plaintext) as SenderCredentials;
  } catch {
    return null;
  }
}
