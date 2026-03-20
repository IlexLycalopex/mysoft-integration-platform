import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NewTenantForm from './NewTenantForm';
import type { UserRole } from '@/types/database';

export default async function NewTenantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') redirect('/platform/tenants');

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/platform/tenants" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          ← Back to tenants
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          New Tenant
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Provision a new customer tenant on the platform
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Tenant Details</span>
        </div>
        <div style={{ padding: 20 }}>
          <NewTenantForm />
        </div>
      </div>
    </div>
  );
}
