'use client';

import { useState } from 'react';

interface Props {
  token: string;
}

/**
 * Masks a push token in the watchers table. User must click "Reveal" to see
 * the token, and can then copy the push URL. This prevents tokens from being
 * shoulder-surfed on screen.
 */
export default function RevealTokenButton({ token }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const pushUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/push/${token}`
    : `/api/v1/push/${token}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(pushUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!revealed) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
        title="Click to reveal push URL"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontFamily: 'var(--font-dm-mono)',
          color: 'var(--muted)',
          background: '#F7FAFC',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          marginTop: 3,
        }}
      >
        🔒 ••••••••  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, opacity: 0.7 }}>reveal</span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
      <code style={{
        fontSize: 10,
        fontFamily: 'var(--font-dm-mono)',
        color: 'var(--navy)',
        background: '#F0F4F8',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '2px 6px',
        wordBreak: 'break-all',
        maxWidth: 240,
        display: 'inline-block',
      }}>
        {pushUrl}
      </code>
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy push URL'}
        style={{
          fontSize: 11,
          color: copied ? '#0E5C30' : 'var(--blue)',
          background: copied ? '#EDFAF3' : '#F0F4F8',
          border: `1px solid ${copied ? '#A8DFBE' : 'var(--border)'}`,
          borderRadius: 4,
          padding: '2px 7px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
      >
        {copied ? '✓' : '⎘'}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setRevealed(false); }}
        title="Hide"
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          flexShrink: 0,
        }}
      >
        hide
      </button>
    </div>
  );
}
