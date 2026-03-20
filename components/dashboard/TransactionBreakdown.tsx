'use client';

interface Props {
  data: Array<{ type: string; count: number; label: string }>;
}

const TYPE_COLOURS: Record<string, string> = {
  journal_entry:   '#3b82f6',
  payroll_journal: '#8b5cf6',
  ar_invoice:      '#10b981',
  ap_bill:         '#f59e0b',
  expense_report:  '#ef4444',
  ar_payment:      '#06b6d4',
  ap_payment:      '#f97316',
  unknown:         '#94a3b8',
};

export default function TransactionBreakdown({ data }: Props) {
  if (!data.length) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        No transaction data in the last 30 days
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((item) => {
        const pct = ((item.count / total) * 100).toFixed(1);
        const barPct = (item.count / maxCount) * 100;
        const colour = TYPE_COLOURS[item.type] ?? '#94a3b8';
        return (
          <div key={item.type}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8, whiteSpace: 'nowrap' }}>
                {item.count.toLocaleString()} <span style={{ color: colour, fontWeight: 600 }}>{pct}%</span>
              </span>
            </div>
            <div style={{ height: 6, background: '#F0F4F8', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{ height: '100%', width: `${barPct}%`, background: colour, borderRadius: 3, transition: 'width 0.3s ease' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
