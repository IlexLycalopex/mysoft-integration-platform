'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelJob } from '@/lib/actions/uploads';

export default function CancelJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (!confirm('Cancel this job? The file will remain in history.')) return;
    setLoading(true);
    await cancelJob(jobId);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      style={{
        background: 'none', border: 'none', padding: 0,
        fontSize: 12, color: 'var(--muted)', cursor: loading ? 'not-allowed' : 'pointer',
        textDecoration: 'underline', textDecorationStyle: 'dotted',
      }}
    >
      {loading ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
