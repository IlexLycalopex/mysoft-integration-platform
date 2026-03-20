import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCredentials } from '@/lib/actions/credentials';
import { readLocations } from '@/lib/intacct/client';
import { validateApiKey } from '@/lib/api-auth';
import type { UserRole } from '@/types/database';

/**
 * GET /api/intacct/locations
 * Returns valid LOCATION IDs from the tenant's Intacct company.
 * Used for diagnostics and validating dimension values before submission.
 * Accepts either:
 *   - Browser session (cookie auth)
 *   - Bearer API key (same as /api/v1/ingest)
 */
export async function GET(req: NextRequest) {
  let tenantId: string | null = null;

  // Try API key first (allows agent/curl access)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer mip_')) {
    const ctx = await validateApiKey(authHeader);
    if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    tenantId = ctx.tenantId;
  } else {
    // Fall back to browser session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single<{ role: UserRole; tenant_id: string | null }>();

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    tenantId = profile.tenant_id;
  }

  if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 });

  const creds = await getCredentials(tenantId);
  if (!creds) return NextResponse.json({ error: 'No Intacct credentials configured' }, { status: 400 });

  const result = await readLocations(creds);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Return as { id, name } objects — EntityIdSelect knows how to display these.
  // Never return raw IntacctLocation objects directly into JSX (React error #31).
  const locations = (result.locations ?? []).map((l) => ({
    id: l.LOCATIONID,
    name: l.NAME,
  }));

  return NextResponse.json({
    locations,
    rawResponseXml: result.rawResponseXml,
    rawResultData: result.rawResultData,
  });
}
