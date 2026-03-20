'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  jobId: string;
  currentStatus: string;
  size?: 'sm' | 'md';
}

export default function ReprocessButton({ jobId, currentStatus, size = 'md' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProcessing = currentStatus === 'processing';
  const padding = size === 'sm' ? '5px 10px' : '7px 14px';
  const fontSize = size === 'sm' ? 12 : 13;

  async function handleReprocess() {
    if (isProcessing) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/reprocess`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Reprocess failed');
        setLoading(false);
      } else {
        router.push(`/jobs/${data.jobId}`);
      }
    } catch {
      setError('Request failed');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={handleReprocess}
        disabled={loading || isProcessing}
        title={isProcessing ? 'Job is currently processing' : 'Re-process this job with the same file and mapping'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: loading || isProcessing ? '#B0C8D8' : 'var(--blue)',
          color: '#fff', border: 'none', borderRadius: 6,
          padding, fontSize, fontWeight: 600,
          cursor: loading || isProcessing ? 'not-allowed' : 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 .49-3.36"/>
        </svg>
        {loading ? 'Starting…' : 'Re-process'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}

export function ReprocessDryRunButton({ jobId, currentStatus, size = 'md' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProcessing = currentStatus === 'processing';
  const padding = size === 'sm' ? '5px 10px' : '7px 14px';
  const fontSize = size === 'sm' ? 12 : 13;

  async function handleDryRun() {
    if (isProcessing) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/reprocess?dryRun=true`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Dry run failed');
        setLoading(false);
      } else {
        router.push(`/jobs/${data.jobId}`);
      }
    } catch {
      setError('Request failed');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={handleDryRun}
        disabled={loading || isProcessing}
        title={isProcessing ? 'Job is currently processing' : 'Validates the full pipeline without posting to Intacct'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: loading || isProcessing ? '#D4B060' : '#D97706',
          color: '#fff', border: 'none', borderRadius: 6,
          padding, fontSize, fontWeight: 600,
          cursor: loading || isProcessing ? 'not-allowed' : 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {loading ? 'Starting…' : 'Test (dry run)'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
