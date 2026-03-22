import { NextRequest, NextResponse } from 'next/server';
import { cookies }   from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { sage50Connector } from '@/lib/connectors/sage50/index';
import { saveSourceCredentials } from '@/lib/actions/source-credentials';

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const storedState = jar.get('oauth_state_sage50')?.value;
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const redirectBase = '/settings/connections';

  if (error) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=invalid_state`, req.url));
  }

  const connectorId = state.split('.').slice(1).join('.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single<{ tenant_id: string }>();

  if (!profile) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=profile_missing`, req.url));
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/sage50/callback`;
    const tokens = await sage50Connector.exchangeCode(code, redirectUri);
    await saveSourceCredentials(profile.tenant_id, connectorId, tokens, user.id);
    jar.delete('oauth_state_sage50');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(new URL(`${redirectBase}?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL(`${redirectBase}?connected=sage50`, req.url));
}
