import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSourceConnections } from '@/lib/actions/source-credentials';
import DisconnectButton from './DisconnectButton';

const CONNECTOR_OAUTH_PATH: Record<string, string> = {
  xero:              '/api/oauth/xero',
  quickbooks_online: '/api/oauth/quickbooks',
  sage50cloud:       '/api/oauth/sage50',
};

const CONNECTOR_LOGO: Record<string, string> = {
  xero:              '🔵',
  quickbooks_online: '🟢',
  sage50cloud:       '🟠',
};

const CONNECTOR_NOTE: Record<string, string> = {
  sage50cloud: 'Requires Sage 50cloud subscription (not standalone Sage 50 desktop).',
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { connected, error } = await searchParams;
  const connections = await getSourceConnections();

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: '0 0 4px' }}>
        Source Connections
      </h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }}>
        Connect your accounting system as a data source. Once connected, you can sync
        invoices, journals and contacts directly into your import pipeline.
      </p>

      {/* Toast notifications */}
      {connected && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#15803D',
        }}>
          ✓ Successfully connected {connected === 'xero' ? 'Xero' : connected === 'quickbooks' ? 'QuickBooks Online' : 'Sage 50cloud'}.
        </div>
      )}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#DC2626',
        }}>
          Connection failed: {decodeURIComponent(error)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connections.map((conn) => {
          const oauthPath = CONNECTOR_OAUTH_PATH[conn.connectorKey];
          const note = CONNECTOR_NOTE[conn.connectorKey];
          const logo = CONNECTOR_LOGO[conn.connectorKey] ?? '🔗';

          return (
            <div key={conn.connectorId} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
              {/* Logo */}
              <div style={{
                width: 40, height: 40, borderRadius: 8, fontSize: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#F7FAFC', border: '1px solid var(--border)', flexShrink: 0,
              }}>
                {logo}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>
                    {conn.connectorName}
                  </span>
                  {conn.connected ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#1A6B30',
                      background: '#E6F7ED', border: '1px solid #A3D9B1',
                      borderRadius: 4, padding: '1px 7px',
                    }}>
                      Connected
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                      background: '#F3F4F6', borderRadius: 4, padding: '1px 7px',
                    }}>
                      Not connected
                    </span>
                  )}
                </div>

                {conn.connected && conn.connectedAt && (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Connected {new Date(conn.connectedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                    {conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date() && (
                      <span style={{ color: '#D97706', marginLeft: 8 }}>· Token expired — reconnect</span>
                    )}
                  </div>
                )}

                {note && !conn.connected && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{note}</div>
                )}
              </div>

              {/* Action */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {conn.connected ? (
                  <>
                    <DisconnectButton
                      connectorId={conn.connectorId}
                      connectorName={conn.connectorName}
                    />
                    {oauthPath && (
                      <Link
                        href={`${oauthPath}?connector_id=${conn.connectorId}`}
                        style={{
                          fontSize: 12, padding: '5px 12px', borderRadius: 6,
                          border: '1px solid var(--border)', color: 'var(--muted)',
                          textDecoration: 'none', background: 'transparent',
                        }}
                      >
                        Reconnect
                      </Link>
                    )}
                  </>
                ) : oauthPath ? (
                  <Link
                    href={`${oauthPath}?connector_id=${conn.connectorId}`}
                    style={{
                      fontSize: 13, fontWeight: 500,
                      padding: '7px 16px', borderRadius: 6,
                      background: 'var(--blue)', color: '#fff',
                      textDecoration: 'none',
                    }}
                  >
                    Connect
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Coming soon</span>
                )}
              </div>
            </div>
          );
        })}

        {!connections.length && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '40px 24px', textAlign: 'center',
            fontSize: 13, color: 'var(--muted)',
          }}>
            No source connectors are available. Contact your platform administrator.
          </div>
        )}
      </div>

      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: '#F0F7FF', border: '1px solid #BFDBFE',
        borderRadius: 8, fontSize: 12, color: '#1E40AF',
      }}>
        <strong>How it works:</strong> Once connected, go to <strong>Uploads</strong> and choose
        &quot;Sync from source&quot; to fetch records directly into an import job. Your field mappings
        control how source fields map to Sage Intacct.
      </div>
    </div>
  );
}
