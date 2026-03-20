'use client';

import { useTransition } from 'react';
import { forceKillJob } from '@/lib/actions/uploads';

export default function KillJobButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleKill() {
    if (!confirm(
      'Force-cancel this job?\n\n' +
      'This marks the job as Failed immediately. If processing is still running in the background it may complete anyway, but the status will be overridden here.\n\n' +
      'Use Re-process afterwards to create a fresh attempt once the underlying issue is resolved.'
    )) return;

    startTransition(async () => {
      const result = await forceKillJob(jobId);
      if (result.error) alert(`Failed: ${result.error}`);
    });
  }

  return (
    <button
      onClick={handleKill}
      disabled={isPending}
      title="Force-cancel stuck job"
      style={{
        background: 'transparent',
        color: isPending ? 'var(--muted)' : '#9B2B1E',
        border: `1px solid ${isPending ? 'var(--border)' : '#F5C6C2'}`,
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        cursor: isPending ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isPending ? '…' : '⏹ Force cancel'}
    </button>
  );
}
