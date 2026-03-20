import Link from 'next/link';

export interface ApiKeyStatus {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
}

interface Props {
  apiKeys: ApiKeyStatus[];
  nowMs: number;
}

function getStatus(lastUsedAt: string | null, nowMs: number): 'online' | 'idle' | 'offline' {
  if (!lastUsedAt) return 'offline';
  const diffMs = nowMs - new Date(lastUsedAt).getTime();
  if (diffMs < 5 * 60 * 1000) return 'online';
  if (diffMs <= 35 * 60 * 1000) return 'idle';
  return 'offline';
}

function relativeTime(lastUsedAt: string | null, nowMs: number): string {
  if (!lastUsedAt) return 'Never';
  const diffMs = nowMs - new Date(lastUsedAt).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DOT_STYLES = {
  online: {
    background: '#22c55e',
    boxShadow: '0 0 0 3px #bbf7d0',
    animation: 'mip-pulse 2s infinite',
  },
  idle: {
    background: '#f59e0b',
    boxShadow: 'none',
    animation: 'none',
  },
  offline: {
    background: '#9ca3af',
    boxShadow: 'none',
    animation: 'none',
  },
};

export default function AgentStatusPanel({ apiKeys, nowMs }: Props) {
  if (!apiKeys.length) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>No agents configured</p>
        <Link href="/settings/api-keys" style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
          Settings → API Keys →
        </Link>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes mip-pulse {
          0%, 100% { box-shadow: 0 0 0 0 #22c55e55; }
          50% { box-shadow: 0 0 0 5px #22c55e00; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {apiKeys.map((key) => {
          const status = getStatus(key.lastUsedAt, nowMs);
          const dotStyle = DOT_STYLES[status];
          const lastSeen = relativeTime(key.lastUsedAt, nowMs);
          return (
            <div
              key={key.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F7FAFC', borderRadius: 6, border: '1px solid #E8EAED' }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: dotStyle.background,
                  boxShadow: dotStyle.boxShadow,
                  animation: dotStyle.animation,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {key.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  <code style={{ fontFamily: 'var(--font-dm-mono)', background: '#E8EAED', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>
                    {key.keyPrefix}…
                  </code>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                {lastSeen}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
