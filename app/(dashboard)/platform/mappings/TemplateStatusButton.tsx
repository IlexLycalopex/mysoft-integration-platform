'use client';

import { useState, useTransition } from 'react';
import { setTemplateStatus } from '@/lib/actions/mappings';

interface Props {
  templateId: string;
  currentStatus: 'draft' | 'published';
}

export default function TemplateStatusButton({ templateId, currentStatus }: Props) {
  const [status, setStatus] = useState<'draft' | 'published'>(currentStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = status === 'published' ? 'draft' : 'published';
    setError(null);
    startTransition(async () => {
      const result = await setTemplateStatus(templateId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus(next);
      }
    });
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        style={{
          background: status === 'published' ? 'transparent' : 'var(--blue)',
          color: status === 'published' ? 'var(--muted)' : '#fff',
          border: status === 'published' ? '1px solid var(--border)' : 'none',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 500,
          cursor: isPending ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? '…' : status === 'published' ? 'Unpublish' : 'Publish'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
