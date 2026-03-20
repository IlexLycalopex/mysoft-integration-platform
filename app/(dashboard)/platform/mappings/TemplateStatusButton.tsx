'use client';

import { useState, useTransition } from 'react';
import { setTemplateStatus } from '@/lib/actions/mappings';

interface Props {
  templateId: string;
  currentStatus: 'draft' | 'published';
  templateVersion?: number;
}

export default function TemplateStatusButton({ templateId, currentStatus, templateVersion }: Props) {
  const [status, setStatus] = useState<'draft' | 'published'>(currentStatus);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (status === 'published') {
      // Unpublish: no dialog needed
      doTransition('draft', undefined);
    } else {
      setShowPublishDialog(true);
    }
  }

  function doTransition(next: 'draft' | 'published', summary: string | undefined) {
    setError(null);
    startTransition(async () => {
      const result = await setTemplateStatus(templateId, next, summary);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus(next);
        setShowPublishDialog(false);
        setChangeSummary('');
      }
    });
  }

  return (
    <>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          style={{
            background: status === 'published' ? 'transparent' : 'var(--blue)',
            color: status === 'published' ? 'var(--muted)' : '#fff',
            border: status === 'published' ? '1px solid var(--border)' : 'none',
            borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500,
            cursor: isPending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '…' : status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
      </div>

      {showPublishDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 24, width: 420, maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>
              Publish Template
              {templateVersion && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}> — v{templateVersion + 1}</span>}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              Publishing will notify all linked tenant mappings that an update is available.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
                What changed? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
              </label>
              <textarea
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                rows={3}
                placeholder="e.g. Added CURRENCY field, fixed AMOUNT validation rule"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6,
                  boxSizing: 'border-box', resize: 'vertical',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>
                Shown to tenants in the update notification and diff view.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => doTransition('published', changeSummary.trim() || undefined)}
                disabled={isPending}
                style={{
                  flex: 1, background: isPending ? '#ccc' : 'var(--blue)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '9px 0', fontSize: 13, fontWeight: 500,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Publishing…' : 'Publish'}
              </button>
              <button
                onClick={() => setShowPublishDialog(false)}
                disabled={isPending}
                style={{
                  background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '9px 16px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
