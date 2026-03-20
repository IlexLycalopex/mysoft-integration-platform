import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantBranding } from '@/lib/branding';
import BrandingForm from '@/components/platform/BrandingForm';
import TenantTabNav from '@/components/platform/TenantTabNav';
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

  const branding = await getTenantBranding(id);

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

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
        <BrandingForm tenantId={id} initial={branding} />
      </div>
    </div>
  );
}
