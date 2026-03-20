'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface Props {
  tenants: { id: string; name: string }[];
}

export default function AuditTenantFilter({ tenants }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('tenant') ?? '';

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const url = val ? `/audit?tenant=${encodeURIComponent(val)}` : '/audit';
    router.push(url);
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      style={{
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontSize: 13,
        color: 'var(--text)',
        background: 'var(--surface)',
        outline: 'none',
        cursor: 'pointer',
        minWidth: 180,
      }}
    >
      <option value="">All tenants</option>
      <option value="__platform__">Platform events</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
