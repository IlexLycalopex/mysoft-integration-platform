'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTenant } from '@/lib/actions/tenants';

export default function DeleteTenantButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const nameMatches = typedName === tenantName;

  async function handleDelete() {
    if (!nameMatches) return;
    setLoading(true);
    setError(null);
    const result = await deleteTenant(tenantId, typedName);
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
        style={{
          fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6,
          border: '1px solid #7B0F0F', background: 'transparent', color: '#7B0F0F', cursor: 'pointer',
        }}
      >
        Delete Tenant
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid #9B2B1E', borderRadius: 8, padding: 20, background: '#FDE8E6', marginTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#7B0F0F', margin: '0 0 6px' }}>
        Permanently delete &ldquo;{tenantName}&rdquo;?
      </p>
      <p style={{ fontSize: 12, color: '#9B2B1E', margin: '0 0 14px', lineHeight: 1.6 }}>
        This will <strong>immediately and permanently delete</strong> this tenant and all associated data —
        users, jobs, mappings, watchers, API keys, and subscription history.
        <strong> This cannot be undone.</strong>
        {' '}You must cancel any active subscription before deleting.
      </p>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#7B0F0F', margin: '0 0 8px' }}>
        Type <span style={{ fontFamily: 'monospace', background: '#fff', padding: '1px 5px', borderRadius: 3, border: '1px solid #F5C6C2' }}>{tenantName}</span> to confirm:
      </p>
      <input
        type="text"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder={tenantName}
        autoFocus
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          border: `1px solid ${typedName.length > 0 ? (nameMatches ? '#A8DFBE' : '#F5C6C2') : '#F5C6C2'}`,
          borderRadius: 6,
          marginBottom: 12,
          background: '#fff',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {error && (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7B0F0F', margin: '0 0 12px', background: '#fff', border: '1px solid #F5C6C2', borderRadius: 4, padding: '6px 10px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleDelete}
          disabled={!nameMatches || loading}
          style={{
            fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, border: 'none',
            background: nameMatches && !loading ? '#7B0F0F' : '#C0A0A0',
            color: '#fff',
            cursor: nameMatches && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Deleting…' : 'Permanently Delete'}
        </button>
        <button
          onClick={() => { setConfirming(false); setTypedName(''); setError(null); }}
          style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
