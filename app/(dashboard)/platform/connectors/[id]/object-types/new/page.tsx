import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import NewObjectTypeForm from './NewObjectTypeForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewObjectTypePage({ params }: PageProps) {
  const { id: connectorId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') redirect('/dashboard');

  const admin = createAdminClient();
  const { data: connector } = await (admin as any)
    .from('endpoint_connectors')
    .select('id, display_name')
    .eq('id', connectorId)
    .single();

  if (!connector) notFound();

  return <NewObjectTypeForm connectorId={connectorId} connectorName={connector.display_name} />;
}
