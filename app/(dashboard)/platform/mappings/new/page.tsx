import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import NewTemplateForm from './NewTemplateForm';

export default async function NewTemplatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') redirect('/platform/mappings');

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/platform/mappings" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← Templates
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: '8px 0 4px' }}>
          New template
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Create a reusable mapping template — saved as draft until you publish it
        </p>
      </div>
      <NewTemplateForm />
    </div>
  );
}
