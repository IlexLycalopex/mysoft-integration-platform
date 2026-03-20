'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '7px 16px',
        borderRadius: 6,
        border: '1px solid #1A6B30',
        background: '#E6F7ED',
        color: '#1A6B30',
        cursor: 'pointer',
      }}
    >
      Print / Save PDF
    </button>
  );
}
