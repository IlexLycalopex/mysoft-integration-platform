'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DlqRetryButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const router = useRouter();

  function handleRetry() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ immediate: false }),
        });
        if (res.ok) {
          setResult('ok');
          router.refresh();
        } else {
          setResult('error');
        }
      } catch {
        setResult('error');
      }
    });
  }

  if (result === 'ok') {
    return (
      <span style={{ fontSize: 11, color: '#1A6B30', fontWeight: 600 }}>Re-queued</span>
    );
  }

  if (result === 'error') {
    return (
      <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>Failed</span>
    );
  }

  return (
    <button
      onClick={handleRetry}
      disabled={isPending}
      style={{
        fontSize: 11, fontWeight: 600,
        color: isPending ? 'var(--muted)' : '#7F1D1D',
        background: isPending ? '#F1F5F9' : '#FEF2F2',
        border: '1px solid #FCA5A5',
        borderRadius: 4, padding: '3px 8px',
        cursor: isPending ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {isPending ? 'Retrying…' : 'Retry'}
    </button>
  );
}
