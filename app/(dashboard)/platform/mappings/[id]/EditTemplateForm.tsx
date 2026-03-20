'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTemplate, deleteTemplate } from '@/lib/actions/mappings';
import MappingEditor from '@/app/(dashboard)/mappings/MappingEditor';
import type { ColumnMappingEntry } from '@/types/database';
import type { ObjectTypeOption } from '@/lib/connectors/registry';

interface Props {
  templateId: string;
  initialName: string;
  initialDescription: string | null;
  initialTransactionType: string | null;
  initialColumnMappings: ColumnMappingEntry[];
  objectTypes: ObjectTypeOption[];
}

export default function EditTemplateForm({
  templateId,
  initialName,
  initialDescription,
  initialTransactionType,
  initialColumnMappings,
  objectTypes,
}: Props) {
  const router = useRouter();
  const boundAction = updateTemplate.bind(null, templateId);
  const [state, action, pending] = useActionState(boundAction, {});
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (!confirm('Delete this template? Tenants who have cloned it will keep their copies. This cannot be undone.')) return;
    startDelete(async () => {
      await deleteTemplate(templateId);
      router.push('/platform/mappings');
    });
  }

  return (
    <MappingEditor
      initialName={initialName}
      initialDescription={initialDescription ?? ''}
      initialTransactionType={initialTransactionType}
      initialIsDefault={false}
      initialColumnMappings={initialColumnMappings}
      onSubmit={(fd) => action(fd)}
      pending={pending || deleting}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Save template"
      showDeleteButton
      onDelete={handleDelete}
      isTemplate
      objectTypes={objectTypes}
    />
  );
}
