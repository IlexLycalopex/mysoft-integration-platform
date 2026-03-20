'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { archiveTenant } from '@/lib/actions/tenants';

export default function ArchiveTenantButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleArchive() {
    setLoading(true);
    setError(null);
    const result = await archiveTenant(tenantId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push('/platform/tenants');
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, border: '1px solid var(--error)', background: 'transparent', color: 'var(--error)', cursor: 'pointer' }}
      >
        Archive Tenant
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid #F5C6C2', borderRadius: 8, padding: 20, background: '#FDE8E6' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#9B2B1E', margin: '0 0 8px' }}>
        Archive &ldquo;{tenantName}&rdquo;?
      </p>
      <p style={{ fontSize: 12, color: '#9B2B1E', margin: '0 0 16px', lineHeight: 1.6 }}>
        This will set the tenant to <strong>Offboarded</strong> status immediately. All logins will be disabled.
        Tenant data will be automatically purged after <strong>90 days</strong>. This action cannot be undone.
        You must cancel any active subscription before archiving.
      </p>
      {error && (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#9B2B1E', margin: '0 0 12px', background: '#fff', border: '1px solid #F5C6C2', borderRadius: 4, padding: '6px 10px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleArchive}
          disabled={loading}
          style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, border: 'none', background: loading ? 'var(--muted)' : '#C0392B', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Archiving…' : 'Confirm Archive'}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null); }}
          style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
