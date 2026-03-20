'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cloneMapping } from '@/lib/actions/mappings';

type InheritanceMode = 'standalone' | 'linked' | 'inherit';

const MODE_INFO: Record<InheritanceMode, { label: string; description: string }> = {
  standalone: {
    label: 'Standalone',
    description: 'Independent copy. No link to the source template — updates won\'t be tracked.',
  },
  linked: {
    label: 'Linked (recommended)',
    description: 'Notified when the platform template is updated. Accept or dismiss updates at the whole-mapping level.',
  },
  inherit: {
    label: 'Inherit',
    description: 'Row-level sync. Platform updates flow through on rows you haven\'t modified. Conflicts flagged for your review.',
  },
};

export default function CloneMappingButton({
  mappingId,
  isTemplate = false,
  label = 'Clone',
  style,
}: {
  mappingId: string;
  isTemplate?: boolean;
  label?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [mode, setMode] = useState<InheritanceMode>('linked');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setLoading(true);
    setError(null);
    // Only pass mode if source is a platform template
    const result = await cloneMapping(mappingId, isTemplate ? mode : 'standalone');
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.mappingId) {
      setShowDialog(false);
      router.push(`/mappings/${result.mappingId}`);
    }
  }

  // Non-template clones: no mode dialog needed
  if (!isTemplate) {
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

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        style={{
          background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          ...style,
        }}
      >
        {label}
      </button>

      {showDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 24, width: 440, maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>
              Clone Template
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 18px' }}>
              Choose how this copy should stay in sync with the platform template.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {(Object.entries(MODE_INFO) as [InheritanceMode, { label: string; description: string }][]).map(([value, info]) => (
                <label key={value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                  borderRadius: 7, border: `2px solid ${mode === value ? 'var(--navy)' : 'var(--border)'}`,
                  background: mode === value ? '#F0F4FF' : 'var(--surface)',
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="inheritance_mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{info.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{info.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 14 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleClone}
                disabled={loading}
                style={{
                  flex: 1, background: loading ? '#ccc' : 'var(--navy)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '9px 0', fontSize: 13, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Cloning…' : 'Clone mapping'}
              </button>
              <button
                onClick={() => setShowDialog(false)}
                disabled={loading}
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
