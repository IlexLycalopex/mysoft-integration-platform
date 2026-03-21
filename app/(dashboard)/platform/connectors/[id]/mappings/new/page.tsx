import { redirect } from 'next/navigation';

export default async function ConnectorNewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/platform/mappings/new?connector_id=${id}`);
}
