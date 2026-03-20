'use client';

import { useTransition } from 'react';
import { deleteObjectType } from '@/lib/actions/connectors';

interface Props {
  objectTypeId: string;
  connectorId: string;
  displayName: string;
}

export default function DeleteObjectTypeButton({ objectTypeId, connectorId, displayName }: Props) {
  const [pending, start] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete object type "${displayName}"? This cannot be undone.`)) return;
    start(async () => { await deleteObjectType(objectTypeId, connectorId); });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      style={{
        fontSize: 12, color: '#DC2626', background: 'none', border: 'none',
        padding: 0, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
