'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export default function UserSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('q', value); else params.delete('q');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        defaultValue={searchParams.get('q') ?? ''}
        placeholder="Search users…"
        onChange={(e) => handleChange(e.target.value)}
        style={{ paddingLeft: 30, padding: '7px 10px 7px 30px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: 'var(--surface)', outline: 'none', width: 200 }}
      />
    </div>
  );
}
