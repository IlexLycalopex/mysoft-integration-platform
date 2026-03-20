'use client';

interface ColumnMapping {
  source_column: string;
  [key: string]: unknown;
}

interface Props {
  mappingName: string;
  columnMappings: ColumnMapping[];
}

export default function DownloadTemplateButton({ mappingName, columnMappings }: Props) {
  function handleDownload() {
    const headers = columnMappings
      .filter((m) => m.source_column)
      .map((m) => m.source_column);

    if (!headers.length) return;

    // Header row + one blank example row to show structure
    const csv = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = mappingName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    a.href = url;
    a.download = `template_${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      title="Download CSV template for this mapping"
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 5,
        padding: '5px 10px',
        fontSize: 12,
        color: 'var(--muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {/* Download icon */}
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1v9m0 0L5 7m3 3 3-3M2 12v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      CSV template
    </button>
  );
}
