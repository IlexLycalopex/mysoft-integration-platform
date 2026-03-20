import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import NewMappingForm from './NewMappingForm';
import { getAllObjectTypes } from '@/lib/connectors/registry';

export default async function NewMappingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const canManage = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin', 'tenant_operator'];
  if (!profile || !canManage.includes(profile.role)) redirect('/mappings');

  const objectTypes = await getAllObjectTypes();

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/mappings" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Mappings
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: '8px 0 4px' }}>
          New mapping
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Define how your CSV columns map to Sage Intacct fields
        </p>
      </div>
      <NewMappingForm objectTypes={objectTypes} />
    </div>
  );
}
