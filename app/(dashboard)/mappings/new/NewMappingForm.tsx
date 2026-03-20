'use client';

import { useActionState } from 'react';
import { createMapping } from '@/lib/actions/mappings';
import MappingEditor from '../MappingEditor';

export default function NewMappingForm() {
  const [state, action, pending] = useActionState(createMapping, {});

  return (
    <MappingEditor
      onSubmit={(fd) => action(fd)}
      pending={pending}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Create mapping"
    />
  );
}
