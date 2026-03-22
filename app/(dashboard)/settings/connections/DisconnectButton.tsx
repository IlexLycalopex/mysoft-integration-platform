'use client';

import { useState } from 'react';
import { disconnectSourceConnector } from '@/lib/actions/source-credentials';

export default function DisconnectButton({
  connectorId,
  connectorName,
}: {
  connectorId: string;
  connectorName: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    if (!confirm(`Disconnect ${connectorName}? Active syncs will stop working.`)) return;
    setLoading(true);
    await disconnectSourceConnector(connectorId);
    setLoading(false);
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      style={{
        fontSize: 12,
        padding: '5px 12px',
        borderRadius: 6,
        border: '1px solid #FCA5A5',
        background: 'transparent',
        color: '#DC2626',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
