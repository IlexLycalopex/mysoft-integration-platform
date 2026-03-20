'use client';

interface SubRow {
  tenantName: string;
  planName: string;
  planId: string;
  effectivePrice: number | null;
  planPrice: number | null;
  discountPct: number;
  isFreeOfCharge: boolean;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
}

interface Props {
  rows: SubRow[];
  month: string;
}

export default function BillingExportButton({ rows, month }: Props) {
  const handleExport = () => {
    const headers = ['Tenant', 'Plan', 'List Price (£/mo)', 'Discount %', 'Effective Price (£/mo)', 'Free of Charge', 'Period Start', 'Period End', 'Notes'];
    const csvRows = rows.map((r) => [
      r.tenantName,
      r.planName,
      r.planPrice != null ? r.planPrice.toFixed(2) : '',
      r.discountPct > 0 ? r.discountPct.toFixed(2) : '',
      r.isFreeOfCharge ? '0.00' : (r.effectivePrice != null ? r.effectivePrice.toFixed(2) : ''),
      r.isFreeOfCharge ? 'Yes' : 'No',
      r.periodStart,
      r.periodEnd,
      r.notes ?? '',
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mip-billing-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--blue)',
        background: '#F0F4F8',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 14px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      ↓ Export CSV
    </button>
  );
}
