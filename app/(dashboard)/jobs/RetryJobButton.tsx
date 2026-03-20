'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { retryJob } from '@/lib/actions/uploads';

export default function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setLoading(true);
    setError(null);
    const result = await retryJob(jobId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleRetry}
        disabled={loading}
        style={{
          background: loading ? '#ccc' : '#F59E0B',
          color: '#fff', border: 'none', borderRadius: 6,
          padding: '7px 14px', fontSize: 13, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Retrying…' : 'Retry'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
