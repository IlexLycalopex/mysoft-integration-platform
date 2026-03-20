import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TENANT_CTX_COOKIE } from '@/lib/tenant-context';
import type { UserRole } from '@/types/database';
import HelpCentre from '@/components/help/HelpCentre';

export default async function HelpPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const role: UserRole = profile?.role ?? 'tenant_operator';

  // Resolve effective tenant ID (same pattern as dashboard layout)
  let effectiveTenantId = profile?.tenant_id ?? null;

  if (profile?.tenant_id) {
    const cookieStore = await cookies();
    const ctxOverride = cookieStore.get(TENANT_CTX_COOKIE)?.value;

    if (ctxOverride && ctxOverride !== profile.tenant_id) {
      // Validate the override is a real sandbox for this tenant
      const { data: sandboxRow } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', ctxOverride)
        .eq('sandbox_of', profile.tenant_id)
        .eq('is_sandbox', true)
        .maybeSingle();

      if (sandboxRow) {
        effectiveTenantId = ctxOverride;
      }
    }
  }

  let hasCredentials = false;
  let hasMapping = false;
  let hasJob = false;

  if (effectiveTenantId) {
    const admin = createAdminClient();

    const [credResult, mappingResult, jobResult] = await Promise.all([
      admin
        .from('tenant_credentials')
        .select('id')
        .eq('tenant_id', effectiveTenantId)
        .limit(1)
        .maybeSingle(),
      admin
        .from('field_mappings')
        .select('id')
        .eq('tenant_id', effectiveTenantId)
        .limit(1)
        .maybeSingle(),
      admin
        .from('upload_jobs')
        .select('id')
        .eq('tenant_id', effectiveTenantId)
        .limit(1)
        .maybeSingle(),
    ]);

    hasCredentials = !!credResult.data;
    hasMapping = !!mappingResult.data;
    hasJob = !!jobResult.data;
  }

  return (
    <HelpCentre
      role={role}
      hasCredentials={hasCredentials}
      hasMapping={hasMapping}
      hasJob={hasJob}
    />
  );
}
