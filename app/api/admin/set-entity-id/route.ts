/**
 * POST /api/admin/set-entity-id
 * One-shot endpoint to update the entityId on encrypted tenant credentials
 * without needing to re-enter the full credential set.
 *
 * Body: { tenantId, entityId, adminToken }
 * adminToken must match ADMIN_SEED_TOKEN env var (or falls back to ENCRYPTION_KEY prefix check).
 *
 * REMOVE THIS FILE once entity IDs are stable and the settings form is in use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  const body = await req.json() as { tenantId?: string; entityId?: string; adminToken?: string };
  const { tenantId, entityId, adminToken } = body;

  // Simple token check — use ADMIN_SEED_TOKEN env var or first 8 chars of ENCRYPTION_KEY
  const expected = process.env.ADMIN_SEED_TOKEN ?? process.env.ENCRYPTION_KEY?.slice(0, 16);
  if (!expected || adminToken !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_credentials')
    .select('encrypted_data, iv, auth_tag')
    .eq('tenant_id', tenantId)
    .eq('provider', 'intacct')
    .single<{ encrypted_data: string; iv: string; auth_tag: string }>();

  if (!data) return NextResponse.json({ error: 'No credentials found' }, { status: 404 });

  // Decrypt existing credentials
  let existing: Record<string, unknown>;
  try {
    const plaintext = decrypt({ ciphertext: data.encrypted_data, iv: data.iv, authTag: data.auth_tag });
    existing = JSON.parse(plaintext) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt existing credentials' }, { status: 500 });
  }

  // Merge in the new entityId (or remove it if entityId is empty string)
  if (entityId && entityId.trim()) {
    existing.entityId = entityId.trim();
  } else {
    delete existing.entityId;
  }

  // Re-encrypt and save
  const blob = encrypt(JSON.stringify(existing));
  const { error: saveError } = await admin
    .from('tenant_credentials')
    .update({
      encrypted_data: blob.ciphertext,
      iv: blob.iv,
      auth_tag: blob.authTag,
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'intacct');

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({ ok: true, tenantId, entityId: existing.entityId ?? null });
}
