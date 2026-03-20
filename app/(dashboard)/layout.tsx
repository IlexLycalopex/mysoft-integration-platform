import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import HelpDrawer from '@/components/help/HelpDrawer';
import EmulationBanner from '@/components/layout/EmulationBanner';
import { TENANT_CTX_COOKIE } from '@/lib/tenant-context';
import { getEmulationContext } from '@/lib/emulation';
import { getTenantBranding, resolveBranding, defaultBranding } from '@/lib/branding';
import type { UserRole } from '@/types/database';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  let tenantName = 'Platform Admin';
  let isSandbox = false;
  let hasSandbox = false;
  let productionTenantId: string | null = null;
  let sandboxTenantId: string | null = null;
  let effectiveTenantIdForBranding: string | null = null;
  let planName: string | null = null;

  // Check for active emulation session (platform admins only)
  const isPlatformAdminRole = ['platform_super_admin', 'mysoft_support_admin'].includes(profile?.role ?? '');
  const emulationCtx = (isPlatformAdminRole && !profile?.tenant_id)
    ? await getEmulationContext()
    : null;

  // If emulating, fetch the emulated tenant name for display / branding
  if (emulationCtx && !profile?.tenant_id) {
    effectiveTenantIdForBranding = emulationCtx.tenant_id;
    tenantName = emulationCtx.tenant_name;
  }

  if (profile?.tenant_id) {
    productionTenantId = profile.tenant_id;

    // Check if this production tenant has a linked sandbox
    const { data: sandboxRow } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('sandbox_of', profile.tenant_id)
      .eq('is_sandbox', true)
      .maybeSingle<{ id: string; name: string }>();

    if (sandboxRow) {
      hasSandbox = true;
      sandboxTenantId = sandboxRow.id;
    }

    // Determine effective tenant from cookie
    const cookieStore = await cookies();
    const ctxOverride = cookieStore.get(TENANT_CTX_COOKIE)?.value;

    let effectiveTenantId = profile.tenant_id;
    if (ctxOverride && sandboxRow && ctxOverride === sandboxRow.id) {
      effectiveTenantId = ctxOverride;
      isSandbox = true;
    }

    effectiveTenantIdForBranding = effectiveTenantId;

    // Fetch display name for the effective tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', effectiveTenantId)
      .single<{ name: string }>();
    if (tenant) tenantName = tenant.name;

    // Fetch plan name for tenant users (not platform admins)
    if (!['platform_super_admin', 'mysoft_support_admin'].includes(profile.role ?? '')) {
      const { data: tenantPlan } = await supabase
        .from('tenants')
        .select('plan_id')
        .eq('id', effectiveTenantId)
        .single<{ plan_id: string | null }>();
      if (tenantPlan?.plan_id) {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const admin = createAdminClient();
        const { data: planRow } = await admin
          .from('plans')
          .select('name')
          .eq('id', tenantPlan.plan_id)
          .single<{ name: string }>();
        planName = planRow?.name ?? null;
      }
    }
  }

  // Fetch and resolve branding for the effective tenant (handles template inheritance)
  // For platform admins, use defaults
  const brandingResult = effectiveTenantIdForBranding
    ? await resolveBranding(effectiveTenantIdForBranding)
    : null;

  const branding = brandingResult?.branding || defaultBranding;

  // Only inject the style tag if branding differs from defaults (avoids unnecessary DOM changes)
  const brandingDiffersFromDefaults =
    branding.primary_color !== defaultBranding.primary_color ||
    branding.accent_color !== defaultBranding.accent_color ||
    !!branding.custom_css;

  // Sanitise custom_css — strip <script and javascript: patterns
  const safeCustomCss = branding.custom_css
    ? branding.custom_css
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/javascript\s*:/gi, '')
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {brandingDiffersFromDefaults && (
        <style dangerouslySetInnerHTML={{ __html: `:root { --blue: ${branding.primary_color}; --accent: ${branding.accent_color}; }${safeCustomCss ? '\n' + safeCustomCss : ''}` }} />
      )}
      <Topbar
        userEmail={user.email ?? ''}
        tenantName={tenantName}
        isSandbox={isSandbox}
        hasSandbox={hasSandbox}
        productionTenantId={productionTenantId}
        sandboxTenantId={sandboxTenantId}
        planName={planName}
        branding={{
          brand_name: branding.brand_name,
          logo_url: branding.logo_url,
          favicon_url: branding.favicon_url,
          primary_color: branding.primary_color,
        }}
      />
      {emulationCtx && (
        <EmulationBanner
          userName={emulationCtx.user_name}
          tenantName={emulationCtx.tenant_name}
          tenantId={emulationCtx.tenant_id}
          startedAt={emulationCtx.started_at}
        />
      )}
      {isSandbox && (
        <div style={{
          background: '#FFF3CD',
          borderBottom: '1px solid #E8C84A',
          padding: '5px 20px',
          fontSize: 12,
          color: '#7A5500',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>SANDBOX MODE</span>
          <span style={{ opacity: 0.75 }}>—</span>
          <span>Data is isolated from production. Changes will not affect live Intacct data.</span>
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          role={emulationCtx ? (emulationCtx.user_role as UserRole) : (profile?.role ?? 'tenant_operator')}
          branding={{ brand_name: branding.brand_name, logo_url: branding.logo_url, primary_color: branding.primary_color }}
        />
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {children}
        </main>
      </div>
      <HelpDrawer />
    </div>
  );
}
