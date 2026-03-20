'use client';

import { useTransition } from 'react';
import { revokeApiKey } from '@/lib/actions/api-keys';

interface Props {
  keyId: string;
  keyName: string;
}

export default function RevokeKeyButton({ keyId, keyName }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    if (!confirm(`Revoke API key "${keyName}"? This cannot be undone — any agent using this key will stop working immediately.`)) {
      return;
    }
    startTransition(async () => {
      const result = await revokeApiKey(keyId);
      if (!result.success && result.error) {
        alert(`Failed to revoke key: ${result.error}`);
      }
    });
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isPending}
      style={{
        background: 'transparent',
        color: isPending ? 'var(--muted)' : 'var(--error)',
        border: `1px solid ${isPending ? 'var(--border)' : '#F5C6C2'}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        cursor: isPending ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isPending ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
