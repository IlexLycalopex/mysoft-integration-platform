'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Mapping { id: string; name: string; transaction_type: string }

interface Props {
  jobId: string;
  currentMappingId: string | null;
  mappings: Mapping[];
}

export default function ProcessJobButton({ jobId, currentMappingId, mappings }: Props) {
  const router = useRouter();
  const [mappingId, setMappingId] = useState(currentMappingId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleProcess() {
    if (!mappingId) { setError('Select a mapping first'); return; }
    setLoading(true);
    setError(null);

    // Assign mapping to job first
    await fetch(`/api/jobs/${jobId}/mapping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappingId }),
    });

    const res = await fetch(`/api/jobs/${jobId}/process`, { method: 'POST' });
    const data = await res.json();

    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Processing failed');
    } else {
      router.refresh();
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <select
        value={mappingId}
        onChange={(e) => setMappingId(e.target.value)}
        style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', minWidth: 200 }}
      >
        <option value="">— select mapping —</option>
        {mappings.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button
        onClick={handleProcess}
        disabled={loading || !mappingId}
        style={{
          background: loading ? '#7FCBEF' : 'var(--green)',
          color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          cursor: loading || !mappingId ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Processing…' : 'Process'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
