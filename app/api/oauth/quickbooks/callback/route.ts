import { NextRequest, NextResponse } from 'next/server';
import { cookies }   from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { quickBooksConnector } from '@/lib/connectors/quickbooks/index';
import { saveSourceCredentials } from '@/lib/actions/source-credentials';

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const storedState = jar.get('oauth_state_qbo')?.value;
  const code    = req.nextUrl.searchParams.get('code');
  const state   = req.nextUrl.searchParams.get('state');
  const realmId = req.nextUrl.searchParams.get('realmId') ?? '';
  const error   = req.nextUrl.searchParams.get('error');

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
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/quickbooks/callback`;
    // Pass realmId so it's embedded in extraData
    const tokens = await (quickBooksConnector as any).exchangeCode(code, redirectUri, realmId);
    await saveSourceCredentials(profile.tenant_id, connectorId, tokens, user.id);
    jar.delete('oauth_state_qbo');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(new URL(`${redirectBase}?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL(`${redirectBase}?connected=quickbooks`, req.url));
}
