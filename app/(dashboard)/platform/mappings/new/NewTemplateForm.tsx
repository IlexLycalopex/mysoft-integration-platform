'use client';

import { useActionState } from 'react';
import { createTemplate } from '@/lib/actions/mappings';
import MappingEditor from '@/app/(dashboard)/mappings/MappingEditor';

export default function NewTemplateForm() {
  const [state, action, pending] = useActionState(createTemplate, {});

  return (
    <MappingEditor
      onSubmit={(fd) => action(fd)}
      pending={pending}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Create template"
      isTemplate
    />
  );
}
