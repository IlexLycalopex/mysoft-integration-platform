'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface Props {
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZES = [10, 25, 50];

export default function Pagination({ total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function buildUrl(newPage: number, newSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    params.set('pageSize', String(newSize));
    return `${pathname}?${params.toString()}`;
  }

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl(1, Number(e.target.value)));
  }

  if (total === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderTop: '1px solid var(--border)',
      background: '#F7FAFC', flexWrap: 'wrap', gap: 8,
    }}>
      {/* Left: count + page size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Showing <strong style={{ color: 'var(--navy)' }}>{from}–{to}</strong> of <strong style={{ color: 'var(--navy)' }}>{total}</strong>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Per page</label>
          <select
            value={pageSize}
            onChange={handleSizeChange}
            style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, padding: '3px 6px', background: '#fff', color: 'var(--navy)', cursor: 'pointer' }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: page navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <a
          href={page > 1 ? buildUrl(page - 1, pageSize) : undefined}
          aria-disabled={page <= 1}
          style={{
            fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 5,
            border: '1px solid var(--border)', background: page <= 1 ? '#F7FAFC' : '#fff',
            color: page <= 1 ? 'var(--muted)' : 'var(--navy)',
            textDecoration: 'none',
            pointerEvents: page <= 1 ? 'none' : 'auto',
            opacity: page <= 1 ? 0.5 : 1,
          }}
        >
          ← Prev
        </a>
        <span style={{ fontSize: 12, color: 'var(--muted)', padding: '0 8px', whiteSpace: 'nowrap' }}>
          Page {page} of {totalPages}
        </span>
        <a
          href={page < totalPages ? buildUrl(page + 1, pageSize) : undefined}
          aria-disabled={page >= totalPages}
          style={{
            fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 5,
            border: '1px solid var(--border)', background: page >= totalPages ? '#F7FAFC' : '#fff',
            color: page >= totalPages ? 'var(--muted)' : 'var(--navy)',
            textDecoration: 'none',
            pointerEvents: page >= totalPages ? 'none' : 'auto',
            opacity: page >= totalPages ? 0.5 : 1,
          }}
        >
          Next →
        </a>
      </div>
    </div>
  );
}
