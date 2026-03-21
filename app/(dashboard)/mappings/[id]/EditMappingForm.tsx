'use client';

import { useActionState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateMapping, deleteMapping } from '@/lib/actions/mappings';
import MappingEditor from '../MappingEditor';
import type { ColumnMappingEntry } from '@/types/database';
import type { ObjectTypeOption, LicencedConnectorOption } from '@/lib/connectors/registry';

interface Props {
  mappingId: string;
  initialName: string;
  initialDescription: string | null;
  initialTransactionType: string | null;
  initialIsDefault: boolean;
  initialColumnMappings: ColumnMappingEntry[];
  objectTypes: ObjectTypeOption[];
  connectors?: LicencedConnectorOption[];
  initialConnectorId?: string | null;
}

export default function EditMappingForm({
  mappingId,
  initialName,
  initialDescription,
  initialTransactionType,
  initialIsDefault,
  initialColumnMappings,
  objectTypes,
  connectors,
  initialConnectorId,
}: Props) {
  const router = useRouter();
  const boundAction = updateMapping.bind(null, mappingId);
  const [state, action, pending] = useActionState(boundAction, {});
  const [deleting, startDelete] = useTransition();

  // After a successful save, refresh server component data so the page
  // reflects what was just persisted.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  function handleDelete() {
    if (!confirm('Delete this mapping? This cannot be undone.')) return;
    startDelete(async () => {
      await deleteMapping(mappingId);
      router.push('/mappings');
    });
  }

  return (
    <MappingEditor
      initialName={initialName}
      initialDescription={initialDescription ?? ''}
      initialTransactionType={initialTransactionType}
      initialIsDefault={initialIsDefault}
      initialColumnMappings={initialColumnMappings}
      onSubmit={(fd) => action(fd)}
      pending={pending || deleting}
      error={state.error}
      success={state.success}
      fieldErrors={state.fieldErrors}
      submitLabel="Save changes"
      showDeleteButton
      onDelete={handleDelete}
      objectTypes={objectTypes}
      connectors={connectors}
      initialConnectorId={initialConnectorId}
    />
  );
}
