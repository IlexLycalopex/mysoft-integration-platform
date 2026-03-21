import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import EditObjectTypeForm from './EditObjectTypeForm';

interface PageProps {
  params: Promise<{ id: string; typeId: string }>;
}

export default async function EditObjectTypePage({ params }: PageProps) {
  const { id: connectorId, typeId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (!profile || profile.role !== 'platform_super_admin') {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const [{ data: connector }, { data: objectType }] = await Promise.all([
    (admin as any)
      .from('endpoint_connectors')
      .select('id, display_name')
      .eq('id', connectorId)
      .single(),
    (admin as any)
      .from('endpoint_object_types')
      .select('id, object_key, display_name, description, api_object_name, is_active, field_schema')
      .eq('id', typeId)
      .eq('connector_id', connectorId)
      .single(),
  ]);

  if (!connector || !objectType) notFound();
  if (objectType.is_system) redirect(`/platform/connectors/${connectorId}/object-types`);

  return (
    <EditObjectTypeForm
      connectorId={connectorId}
      connectorName={connector.display_name}
      objectType={objectType}
    />
  );
}
