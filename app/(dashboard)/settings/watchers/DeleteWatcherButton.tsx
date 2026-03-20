'use client';

import { useTransition } from 'react';
import { deleteWatcher } from '@/lib/actions/watchers';

interface Props {
  watcherId: string;
  watcherName: string;
}

export default function DeleteWatcherButton({ watcherId, watcherName }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    if (!confirm(
      `Archive watcher "${watcherName}"?\n\n` +
      `The watcher will be disabled and hidden from this list. ` +
      `Jobs that were created by this watcher will be unaffected and remain in Job History.`
    )) return;

    startTransition(async () => {
      const result = await deleteWatcher(watcherId);
      if (!result.success && result.error) {
        alert(`Failed to archive watcher: ${result.error}`);
      }
    });
  }

  return (
    <button
      onClick={handleArchive}
      disabled={isPending}
      title="Archive watcher"
      style={{
        background: 'transparent',
        color: isPending ? 'var(--muted)' : '#6b7280',
        border: `1px solid ${isPending ? 'var(--border)' : '#d1d5db'}`,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 12,
        fontWeight: 500,
        cursor: isPending ? 'default' : 'pointer',
        lineHeight: 1,
      }}
    >
      {isPending ? '…' : '📦'}
    </button>
  );
}
