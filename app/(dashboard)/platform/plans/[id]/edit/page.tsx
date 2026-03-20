import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listAllPlans } from '@/lib/actions/plans';
import type { UserRole } from '@/types/database';
import PlanEditForm from './PlanEditForm';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') redirect('/platform/plans');

  const plans = await listAllPlans();
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Edit Plan
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Editing: <strong>{plan.name}</strong> ({plan.id})
        </p>
      </div>
      <PlanEditForm plan={plan} />
    </div>
  );
}
