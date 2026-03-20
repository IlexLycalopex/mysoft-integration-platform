import Link from 'next/link';

interface Props {
  tenantId: string;
  active: 'details' | 'usage' | 'subscription' | 'branding';
}

const TABS = [
  { key: 'details',      label: 'Details',      path: '' },
  { key: 'usage',        label: 'Usage',        path: '/usage' },
  { key: 'subscription', label: 'Subscription', path: '/subscription' },
  { key: 'branding',     label: 'Branding',     path: '/branding' },
] as const;

export default function TenantTabNav({ tenantId, active }: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: 0,
      marginBottom: 24,
      borderBottom: '1px solid var(--border)',
    }}>
      {TABS.map(({ key, label, path }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={`/platform/tenants/${tenantId}${path}`}
            style={{
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--blue)' : 'var(--muted)',
              textDecoration: 'none',
              padding: '8px 16px',
              borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
