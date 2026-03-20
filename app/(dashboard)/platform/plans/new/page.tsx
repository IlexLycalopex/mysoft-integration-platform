import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import PlanForm from './PlanForm';

export default async function NewPlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') redirect('/platform/plans');

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>New Plan</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Create a new subscription plan tier</p>
      </div>
      <PlanForm />
    </div>
  );
}
