'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cloneMapping } from '@/lib/actions/mappings';

export default function CloneMappingButton({
  mappingId,
  label = 'Clone',
  style,
}: {
  mappingId: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setLoading(true);
    setError(null);
    const result = await cloneMapping(mappingId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.mappingId) {
      router.push(`/mappings/${result.mappingId}`);
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleClone}
        disabled={loading}
        style={{
          background: loading ? '#ccc' : 'var(--navy)',
          color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 14px', fontSize: 13, fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          ...style,
        }}
      >
        {loading ? 'Cloning…' : label}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
