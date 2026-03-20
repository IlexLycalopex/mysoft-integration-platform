import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { TENANT_CTX_COOKIE } from '@/lib/tenant-context';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetTenantId = searchParams.get('tenant');
  const returnTo = searchParams.get('return') ?? '/dashboard';

  // Guard against open redirect
  const safeReturn = returnTo.startsWith('/') ? returnTo : '/dashboard';

  if (!targetTenantId) {
    return NextResponse.redirect(new URL(safeReturn, req.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single<{ tenant_id: string | null }>();

  const cookieStore = await cookies();

  // Switch back to production
  if (targetTenantId === profile?.tenant_id) {
    cookieStore.delete(TENANT_CTX_COOKIE);
    return NextResponse.redirect(new URL(safeReturn, req.url));
  }

  // Validate it's a linked sandbox for this user's production tenant
  if (profile?.tenant_id) {
    const { data: sandbox } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', targetTenantId)
      .eq('sandbox_of', profile.tenant_id)
      .eq('is_sandbox', true)
      .maybeSingle();

    if (sandbox) {
      cookieStore.set(TENANT_CTX_COOKIE, targetTenantId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
    }
  }

  return NextResponse.redirect(new URL(safeReturn, req.url));
}
