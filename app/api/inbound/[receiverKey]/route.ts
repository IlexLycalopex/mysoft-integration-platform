/**
 * POST/GET /api/inbound/[receiverKey]
 *
 * Public inbound webhook receiver. No authentication required —
 * the receiver_key itself acts as a shared secret URL component.
 *
 * Optional HMAC validation:
 *   If the receiver has a `secret` configured, the request MUST include
 *   a valid HMAC-SHA256 signature in one of these headers:
 *     - X-Hub-Signature-256: sha256={hex}    (GitHub/Xero convention)
 *     - X-Mysoft-Signature: sha256={hex}     (Mysoft convention)
 *
 * Rate limiting: relies on Vercel's edge DDoS protection.
 * For production, add explicit per-key rate limiting (e.g., Upstash Redis).
 *
 * Returns:
 *   200 { received: true, id: string }  — payload logged
 *   404                                 — receiver not found or disabled
 *   401 { error: "Invalid signature" }  — HMAC mismatch
 *   500                                 — unexpected error
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs'; // need crypto

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ receiverKey: string }> }
) {
  return handleInbound(req, await params);
}

// Some systems send GET pings to verify the endpoint exists
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiverKey: string }> }
) {
  const { receiverKey } = await params;
  const admin = createAdminClient();

  const { data: receiver } = await (admin as any)
    .from('webhook_receivers')
    .select('id, enabled')
    .eq('receiver_key', receiverKey)
    .single();

  if (!receiver || !receiver.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message: 'Mysoft inbound receiver is active' });
}

async function handleInbound(
  req: NextRequest,
  { receiverKey }: { receiverKey: string }
): Promise<NextResponse> {
  const admin = createAdminClient();

  // Look up receiver
  const { data: receiverRaw } = await (admin as any)
    .from('webhook_receivers')
    .select('id, tenant_id, name, secret, enabled')
    .eq('receiver_key', receiverKey)
    .single();

  const receiver = receiverRaw as { id: string; tenant_id: string; name: string; secret: string | null; enabled: boolean } | null;

  if (!receiver || !receiver.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Read raw body (needed for HMAC validation)
  const rawBody = await req.text();

  // Parse headers we care about
  const signatureHeader =
    req.headers.get('x-hub-signature-256') ??
    req.headers.get('x-mysoft-signature');

  let signatureValid: boolean | null = null;

  if (receiver.secret) {
    if (!signatureHeader) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const expected = `sha256=${crypto
      .createHmac('sha256', receiver.secret)
      .update(rawBody)
      .digest('hex')}`;

    signatureValid = crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );

    if (!signatureValid) {
      // Log the failed attempt before rejecting
      await (admin as any).from('webhook_receive_log').insert({
        receiver_id: receiver.id,
        tenant_id: receiver.tenant_id,
        source_ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
        method: 'POST',
        headers: Object.fromEntries(req.headers.entries()),
        raw_body: rawBody.slice(0, 4000),
        signature_valid: false,
        error: 'Signature mismatch',
      });

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // Parse body as JSON (best effort)
  let parsedPayload: unknown = null;
  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    // Non-JSON body is fine — store raw_body
  }

  // Capture relevant headers (strip sensitive ones)
  const headersToLog: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (!['authorization', 'cookie', 'x-hub-signature-256', 'x-mysoft-signature'].includes(k.toLowerCase())) {
      headersToLog[k] = v;
    }
  }

  // Insert receive log
  const { data: logEntryRaw } = await (admin as any)
    .from('webhook_receive_log')
    .insert({
      receiver_id: receiver.id,
      tenant_id: receiver.tenant_id,
      source_ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
      method: 'POST',
      headers: headersToLog,
      payload: parsedPayload,
      raw_body: rawBody.slice(0, 8000),
      signature_valid: signatureValid,
    })
    .select('id')
    .single();
  const logEntry = logEntryRaw as { id: string } | null;

  return NextResponse.json({
    received: true,
    id: logEntry?.id ?? null,
  });
}
