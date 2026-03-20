'use client';

import { useState } from 'react';

interface Props {
  token: string;
  compact?: boolean; // compact = icon-only button for table rows
}

export default function CopyTokenButton({ token, compact = false }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/api/v1/push/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy push URL'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontFamily: 'var(--font-dm-mono)',
          color: copied ? '#0E5C30' : 'var(--muted)',
          background: copied ? '#EDFAF3' : '#F0F4F8',
          border: `1px solid ${copied ? '#A8DFBE' : 'var(--border)'}`,
          borderRadius: 4,
          padding: '2px 7px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
          marginTop: 3,
        }}
      >
        {copied ? '✓ Copied' : '⎘ Copy URL'}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        color: copied ? '#0E5C30' : 'var(--blue)',
        background: copied ? '#EDFAF3' : '#F0F4F8',
        border: `1px solid ${copied ? '#A8DFBE' : 'var(--border)'}`,
        borderRadius: 6,
        padding: '6px 12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ Copied!' : '⎘ Copy URL'}
    </button>
  );
}
