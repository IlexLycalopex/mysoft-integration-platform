'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  initialSearch: string;
  initialFilter: string;
}

export default function TenantSearchFilter({ initialSearch, initialFilter }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          defaultValue={initialSearch}
          placeholder="Search tenants…"
          onChange={(e) => update('q', e.target.value)}
          style={{ paddingLeft: 30, padding: '7px 10px 7px 30px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: 'var(--surface)', outline: 'none', width: 200 }}
        />
      </div>
      <select
        defaultValue={initialFilter}
        onChange={(e) => update('filter', e.target.value)}
        style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: 'var(--surface)', outline: 'none' }}
      >
        <option value="">All</option>
        <option value="production">Production only</option>
        <option value="sandbox">Sandbox only</option>
        <option value="active">Active</option>
        <option value="trial">Trial</option>
        <option value="suspended">Suspended</option>
      </select>
    </div>
  );
}
