import Link from 'next/link';

interface Props {
  connectorId: string;
  active: 'details' | 'object-types' | 'mappings';
}

const TABS = [
  { key: 'details',       label: 'Details',       path: '' },
  { key: 'object-types',  label: 'Object Types',  path: '/object-types' },
  { key: 'mappings',      label: 'Mappings',      path: '/mappings' },
] as const;

export default function ConnectorTabNav({ connectorId, active }: Props) {
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
            href={`/platform/connectors/${connectorId}${path}`}
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
