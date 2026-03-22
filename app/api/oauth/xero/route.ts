/**
 * GET /api/oauth/xero
 * Initiates the Xero OAuth 2.0 flow.
 * Query params: connector_id (endpoint_connectors UUID)
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }   from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { xeroConnector } from '@/lib/connectors/xero/index';

export async function GET(req: NextRequest) {
  const connectorId = req.nextUrl.searchParams.get('connector_id');
  if (!connectorId) {
    return NextResponse.json({ error: 'connector_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // Store state in cookie for CSRF validation (15 min TTL)
  const state = `${crypto.randomUUID()}.${connectorId}`;
  const jar = await cookies();
  jar.set('oauth_state_xero', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 900,
    path: '/',
    sameSite: 'lax',
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/xero/callback`;
  const authUrl = xeroConnector.getAuthorizationUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
