import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantBranding } from '@/lib/branding';
import BrandingForm from '@/components/platform/BrandingForm';
import TenantTabNav from '@/components/platform/TenantTabNav';
import TenantTemplateSection from '@/components/platform/TenantTemplateSection';
import type { UserRole } from '@/types/database';

export default async function TenantBrandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', id)
    .single<{ id: string; name: string }>();

  if (!tenant) notFound();

  // Fetch legacy branding (direct columns) for BrandingForm
  const branding = await getTenantBranding(id);

  // Fetch current template assignment
  const { data: templateConfig } = await (admin as any)
    .from('tenant_branding')
    .select('template_id, allowed_template_ids, template_version')
    .eq('tenant_id', id)
    .maybeSingle() as { data: { template_id: string | null; allowed_template_ids: string[] | null; template_version: number | null } | null };

  // Fetch published templates for the selector
  const { data: availableTemplates } = await (admin as any)
    .from('branding_templates')
    .select('id, name, description, category, visibility, version, thumbnail_url')
    .eq('is_archived', false)
    .eq('visibility', 'platform_published')
    .order('name') as { data: Array<{ id: string; name: string; description: string | null; category: string | null; visibility: string; version: number; thumbnail_url: string | null }> | null };

  // Fetch the currently assigned template details (if any)
  let currentTemplate: { id: string; name: string; description: string | null; version: number; visibility: string } | null = null;
  if (templateConfig?.template_id) {
    const { data: tmpl } = await (admin as any)
      .from('branding_templates')
      .select('id, name, description, version, visibility')
      .eq('id', templateConfig.template_id)
      .maybeSingle() as { data: { id: string; name: string; description: string | null; version: number; visibility: string } | null };
    currentTemplate = tmpl;
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          <Link href="/platform/tenants" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Tenants</Link>
          {' › '}
          <Link href={`/platform/tenants/${id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{tenant.name}</Link>
          {' › '}
          <span>Branding</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: '4px 0 0' }}>
          {tenant.name}
        </h1>
      </div>

      <TenantTabNav tenantId={id} active="branding" />

      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
        Customise the appearance of the platform for <strong>{tenant.name}</strong>. Changes apply to the dashboard, emails, and login page.
      </p>

      {/* ── Template Assignment ───────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>Branding Template</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              Assign a published template as the base for this tenant&apos;s branding. Direct fields below act as overrides on top.
            </p>
          </div>
          <Link
            href="/platform/branding-templates"
            style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Manage templates →
          </Link>
        </div>

        <TenantTemplateSection
          tenantId={id}
          currentTemplate={currentTemplate}
          currentTemplateVersion={templateConfig?.template_version ?? null}
          allowedTemplateIds={templateConfig?.allowed_template_ids ?? null}
          availableTemplates={availableTemplates ?? []}
        />
      </div>

      {/* ── Direct Branding / Overrides ───────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
            {templateConfig?.template_id ? 'Overrides' : 'Direct Branding'}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
            {templateConfig?.template_id
              ? 'These values override the assigned template. Leave blank to inherit from the template.'
              : 'Set branding directly. Assign a template above to use a shared starting point.'}
          </p>
        </div>
        <BrandingForm tenantId={id} initial={branding} />
      </div>
    </div>
  );
}
