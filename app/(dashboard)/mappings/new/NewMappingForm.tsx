'use client';

import { useActionState } from 'react';
import { createMapping } from '@/lib/actions/mappings';
import MappingEditor from '../MappingEditor';
import type { ObjectTypeOption } from '@/lib/connectors/registry';

export default function NewMappingForm({ objectTypes }: { objectTypes: ObjectTypeOption[] }) {
  const [state, action, pending] = useActionState(createMapping, {});

  return (
    <MappingEditor
      onSubmit={(fd) => action(fd)}
      pending={pending}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Create mapping"
      objectTypes={objectTypes}
    />
  );
}
