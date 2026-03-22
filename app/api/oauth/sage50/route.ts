import { NextRequest, NextResponse } from 'next/server';
import { cookies }   from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { sage50Connector } from '@/lib/connectors/sage50/index';

export async function GET(req: NextRequest) {
  const connectorId = req.nextUrl.searchParams.get('connector_id');
  if (!connectorId) {
    return NextResponse.json({ error: 'connector_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const state = `${crypto.randomUUID()}.${connectorId}`;
  const jar = await cookies();
  jar.set('oauth_state_sage50', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 900,
    path: '/',
    sameSite: 'lax',
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/sage50/callback`;
  const authUrl = sage50Connector.getAuthorizationUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
