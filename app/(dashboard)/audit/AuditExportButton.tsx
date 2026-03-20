'use client';

interface AuditRow {
  id: string;
  operation: string;
  resource_type: string | null;
  resource_id: string | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  tenant_id: string | null;
}

interface Props {
  rows: AuditRow[];
  userMap: Record<string, string>;
  tenantMap: Record<string, string>;
  opLabels: Record<string, string>;
}

export default function AuditExportButton({ rows, userMap, tenantMap, opLabels }: Props) {
  function handleExport() {
    const headers = ['Timestamp', 'User', 'Tenant', 'Action', 'Resource Type', 'Resource ID', 'Details'];
    const csvRows = rows.map((row) => {
      const detail = row.new_values
        ? Object.entries(row.new_values)
            .filter(([k]) => !k.toLowerCase().includes('password'))
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')
        : '';
      return [
        new Date(row.created_at).toISOString(),
        row.user_id ? (userMap[row.user_id] ?? row.user_id) : '',
        row.tenant_id ? (tenantMap[row.tenant_id] ?? row.tenant_id) : 'Platform',
        opLabels[row.operation] ?? row.operation,
        row.resource_type ?? '',
        row.resource_id ?? '',
        detail,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!rows.length) return null;

  return (
    <button
      onClick={handleExport}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        padding: '7px 12px', fontSize: 13, color: 'var(--navy)', cursor: 'pointer', fontWeight: 500,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export CSV
    </button>
  );
}
