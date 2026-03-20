import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import WatcherForm from '../../WatcherForm';
import type { UserRole } from '@/types/database';
import type { WatcherConfig } from '@/lib/actions/watchers';

interface FieldMappingRow {
  id: string;
  name: string;
}

export default async function EditWatcherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
  const [watcherResult, mappingsResult] = await Promise.all([
    admin
      .from('watcher_configs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', effectiveTenantId)
      .single<WatcherConfig>(),
    admin
      .from('field_mappings')
      .select('id, name')
      .eq('tenant_id', effectiveTenantId)
      .order('name'),
  ]);

  if (!watcherResult.data) notFound();

  const mappings = (mappingsResult.data ?? []) as FieldMappingRow[];

  return <WatcherForm watcher={watcherResult.data} mappings={mappings} />;
}
