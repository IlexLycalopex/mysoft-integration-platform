/**
 * POST /api/intacct/set-entity
 * Update the entityId on a tenant's Intacct credentials using an API key.
 * Allows setting the multi-entity login context without re-entering full credentials.
 *
 * Body: { entityId: string }   (empty string to clear)
 * Auth: Bearer <api-key>
 *
 * TEMPORARY — remove once entity IDs are stable and the settings form is in regular use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer mip_')) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const ctx = await validateApiKey(authHeader);
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as { entityId?: string };
  const entityId = (body.entityId ?? '').trim();

  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_credentials')
    .select('encrypted_data, iv, auth_tag')
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', 'intacct')
    .single<{ encrypted_data: string; iv: string; auth_tag: string }>();

  if (!data) return NextResponse.json({ error: 'No Intacct credentials found for this tenant' }, { status: 404 });

  let existing: Record<string, unknown>;
  try {
    const plaintext = decrypt({ ciphertext: data.encrypted_data, iv: data.iv, authTag: data.auth_tag });
    existing = JSON.parse(plaintext) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt existing credentials' }, { status: 500 });
  }

  if (entityId) {
    existing.entityId = entityId;
  } else {
    delete existing.entityId;
  }

  const blob = encrypt(JSON.stringify(existing));
  const { error: saveError } = await admin
    .from('tenant_credentials')
    .update({ encrypted_data: blob.ciphertext, iv: blob.iv, auth_tag: blob.authTag })
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', 'intacct');

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({ ok: true, entityId: entityId || null });
}
