'use client';

import { useActionState } from 'react';
import { createTemplate } from '@/lib/actions/mappings';
import MappingEditor from '@/app/(dashboard)/mappings/MappingEditor';
import type { ObjectTypeOption } from '@/lib/connectors/registry';

export default function NewTemplateForm({
  objectTypes,
  connectorId,
}: {
  objectTypes: ObjectTypeOption[];
  connectorId?: string | null;
}) {
  const [state, action, pending] = useActionState(createTemplate, {});

  return (
    <MappingEditor
      onSubmit={(fd) => {
        if (connectorId) {
          fd.set('connector_id', connectorId);
        }
        action(fd);
      }}
      pending={pending}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Create template"
      isTemplate
      objectTypes={objectTypes}
    />
  );
}
