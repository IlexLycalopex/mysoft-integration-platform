'use client';

import { useTransition } from 'react';
import { toggleWatcher } from '@/lib/actions/watchers';

interface Props {
  watcherId: string;
  enabled: boolean;
}

export default function ToggleWatcherButton({ watcherId, enabled }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleWatcher(watcherId, !enabled);
      if (!result.success && result.error) {
        alert(`Failed to update watcher: ${result.error}`);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      style={{
        background: 'transparent',
        color: isPending ? 'var(--muted)' : enabled ? '#92620A' : 'var(--green)',
        border: `1px solid ${isPending ? 'var(--border)' : enabled ? '#F5D98C' : '#A8DFBE'}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        cursor: isPending ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isPending ? '…' : enabled ? 'Disable' : 'Enable'}
    </button>
  );
}
