'use server';

import { revalidatePath } from 'next/cache';
import { createClient }   from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt }  from '@/lib/crypto';
import type { OAuthTokens }  from '@/lib/connectors/source.interface';

export interface SourceConnectionStatus {
  connected:       boolean;
  connectorId:     string;
  connectorKey:    string;
  connectorName:   string;
  connectedAt?:    string;
  refreshedAt?:    string;
  tokenExpiresAt?: string;
  extraData?:      Record<string, string>;
}

/** Return connection status for all source connectors for the current tenant */
export async function getSourceConnections(): Promise<SourceConnectionStatus[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single<{ tenant_id: string }>();
  if (!profile) return [];

  const admin = createAdminClient();

  // All active source connectors
  const { data: connectors } = await (admin as any)
    .from('endpoint_connectors')
    .select('id, connector_key, display_name')
    .eq('connector_type', 'source')
    .eq('is_active', true)
    .order('sort_order') as { data: { id: string; connector_key: string; display_name: string }[] | null };

  if (!connectors?.length) return [];

  // Existing credentials
  const { data: creds } = await admin
    .from('source_credentials')
    .select('connector_id, connected_at, refreshed_at, token_expires_at, extra_data')
    .eq('tenant_id', profile.tenant_id) as {
      data: {
        connector_id: string;
        connected_at: string;
        refreshed_at: string | null;
        token_expires_at: string | null;
        extra_data: Record<string, string> | null;
      }[] | null
    };

  const credMap = new Map((creds ?? []).map((c) => [c.connector_id, c]));

  return connectors.map((conn) => {
    const cred = credMap.get(conn.id);
    return {
      connected:       !!cred,
      connectorId:     conn.id,
      connectorKey:    conn.connector_key,
      connectorName:   conn.display_name,
      connectedAt:     cred?.connected_at,
      refreshedAt:     cred?.refreshed_at ?? undefined,
      tokenExpiresAt:  cred?.token_expires_at ?? undefined,
      extraData:       cred?.extra_data ?? undefined,
    };
  });
}

/** Store newly-obtained OAuth tokens for a source connector */
export async function saveSourceCredentials(
  tenantId: string,
  connectorId: string,
  tokens: OAuthTokens,
  connectedByUserId: string
): Promise<void> {
  const admin = createAdminClient();
  const blob = encrypt(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));

  await admin.from('source_credentials').upsert({
    tenant_id:        tenantId,
    connector_id:     connectorId,
    encrypted_data:   blob.ciphertext,
    iv:               blob.iv,
    auth_tag:         blob.authTag,
    token_expires_at: tokens.expiresAt?.toISOString() ?? null,
    extra_data:       tokens.extraData ?? {},
    connected_at:     new Date().toISOString(),
    connected_by:     connectedByUserId,
  }, { onConflict: 'tenant_id,connector_id' });
}

/** Decrypt and return tokens (server-side only) */
export async function loadSourceTokens(
  tenantId: string,
  connectorId: string
): Promise<OAuthTokens | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('source_credentials')
    .select('encrypted_data, iv, auth_tag, token_expires_at, extra_data')
    .eq('tenant_id', tenantId)
    .eq('connector_id', connectorId)
    .single<{
      encrypted_data: string; iv: string; auth_tag: string;
      token_expires_at: string | null; extra_data: Record<string, string> | null;
    }>();

  if (!data) return null;

  try {
    const plain = decrypt({ ciphertext: data.encrypted_data, iv: data.iv, authTag: data.auth_tag });
    const tokens = JSON.parse(plain) as OAuthTokens;
    tokens.extraData = data.extra_data ?? undefined;
    tokens.expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : undefined;
    return tokens;
  } catch {
    return null;
  }
}

/** Disconnect (delete) a source connector credential */
export async function disconnectSourceConnector(connectorId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single<{ tenant_id: string }>();
  if (!profile) return { error: 'Profile not found' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('source_credentials')
    .delete()
    .eq('tenant_id', profile.tenant_id)
    .eq('connector_id', connectorId);

  if (error) return { error: error.message };

  revalidatePath('/settings/connections');
  return {};
}
