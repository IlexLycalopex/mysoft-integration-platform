'use client';

import { useActionState, useState, useEffect } from 'react';
import { platformInviteUser } from '@/lib/actions/invites';

interface Props {
  tenantId: string;
}

const initialState = { error: undefined, success: false };

function InviteFormInner({ tenantId, onSuccess }: { tenantId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const boundAction = platformInviteUser.bind(null, tenantId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  if (state.success) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Invite user
      </button>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <input
        name="email"
        type="email"
        required
        placeholder="user@company.com"
        style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', outline: 'none', width: 220 }}
      />
      <select
        name="role"
        defaultValue="tenant_admin"
        style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', outline: 'none' }}
      >
        <option value="tenant_admin">Tenant Admin</option>
        <option value="tenant_operator">Tenant Operator</option>
        <option value="tenant_auditor">Tenant Auditor</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        style={{ background: pending ? '#7dcbee' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
      >
        {pending ? 'Sending…' : 'Send invite'}
      </button>
      <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
        Cancel
      </button>
      {state.error && (
        <div style={{ width: '100%', fontSize: 12, color: 'var(--error)', marginTop: 2 }}>{state.error}</div>
      )}
    </form>
  );
}

export default function InviteTenantUserForm({ tenantId }: Props) {
  const [formKey, setFormKey] = useState(0);
  const [showFlash, setShowFlash] = useState(false);

  function handleSuccess() {
    setShowFlash(true);
    setFormKey((k) => k + 1);
    setTimeout(() => setShowFlash(false), 3000);
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {showFlash && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, fontSize: 12, color: '#1A6B3C' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Invite sent
        </div>
      )}
      <InviteFormInner key={formKey} tenantId={tenantId} onSuccess={handleSuccess} />
    </div>
  );
}
