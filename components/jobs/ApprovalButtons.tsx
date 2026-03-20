'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ApproveButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Approval failed');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleApprove}
        disabled={loading}
        style={{
          background: loading ? '#7FCBEF' : '#00A3E0',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '7px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? 'Approving…' : 'Approve & Process'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#9B2B1E' }}>{error}</span>}
    </div>
  );
}

export function RejectButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReject() {
    if (!note.trim()) {
      setError('A rejection note is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Rejection failed');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={{
          background: 'transparent',
          color: '#9B2B1E',
          border: '1px solid #F5C6C2',
          borderRadius: 6,
          padding: '7px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Reject
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for rejection (required)"
        rows={2}
        style={{
          padding: '6px 8px',
          border: '1px solid #F5C6C2',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--navy)',
          background: '#fff',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleReject}
          disabled={loading || !note.trim()}
          style={{
            background: loading ? '#f5a0a0' : '#9B2B1E',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !note.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Rejecting…' : 'Confirm Reject'}
        </button>
        <button
          onClick={() => { setShowForm(false); setNote(''); setError(null); }}
          disabled={loading}
          style={{
            background: 'transparent',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
      {error && <span style={{ fontSize: 11, color: '#9B2B1E' }}>{error}</span>}
    </div>
  );
}
