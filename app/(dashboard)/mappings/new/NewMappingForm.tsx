'use client';

import { useActionState } from 'react';
import { createMapping } from '@/lib/actions/mappings';
import MappingEditor from '../MappingEditor';
import type { ObjectTypeOption, LicencedConnectorOption } from '@/lib/connectors/registry';

export default function NewMappingForm({
  objectTypes,
  connectors,
  defaultConnectorId,
}: {
  objectTypes: ObjectTypeOption[];
  connectors: LicencedConnectorOption[];
  defaultConnectorId?: string | null;
}) {
  const [state, action, pending] = useActionState(createMapping, {});

  return (
    <MappingEditor
      onSubmit={(fd) => action(fd)}
      pending={pending}
      error={state.error}
      fieldErrors={state.fieldErrors}
      submitLabel="Create mapping"
      objectTypes={objectTypes}
      connectors={connectors}
      defaultConnectorId={defaultConnectorId}
    />
  );
}
