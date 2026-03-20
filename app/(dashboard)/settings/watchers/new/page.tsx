import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import WatcherForm from '../WatcherForm';
import type { UserRole } from '@/types/database';

interface FieldMappingRow {
  id: string;
  name: string;
}

export default async function NewWatcherPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  const allowed: UserRole[] = ['platform_super_admin', 'mysoft_support_admin', 'tenant_admin'];
  if (!profile || !allowed.includes(profile.role)) redirect('/settings/watchers');

  const { tenantId: effectiveTenantId } = await getEffectiveTenantId(profile.tenant_id);
  if (!effectiveTenantId) redirect('/settings/watchers');

  const admin = createAdminClient();
  const { data: mappingsData } = await admin
    .from('field_mappings')
    .select('id, name')
    .eq('tenant_id', effectiveTenantId)
    .order('name');

  const mappings = (mappingsData ?? []) as FieldMappingRow[];

  return <WatcherForm mappings={mappings} />;
}
