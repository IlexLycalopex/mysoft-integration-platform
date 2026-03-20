'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteJob } from '@/lib/actions/uploads';

export default function DeleteJobButton({ jobId, filename }: { jobId: string; filename: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Permanently delete "${filename}"? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    const result = await deleteJob(jobId);
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
        onClick={handleDelete}
        disabled={loading}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: 12, color: 'var(--error)', cursor: loading ? 'not-allowed' : 'pointer',
          textDecoration: 'underline', textDecorationStyle: 'dotted',
        }}
      >
        {loading ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
