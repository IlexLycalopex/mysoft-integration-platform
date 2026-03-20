'use client';

import { useActionState, useState, startTransition } from 'react';
import Link from 'next/link';
import { createSandboxTenant, detachSandboxTenant } from '@/lib/actions/tenants';
import type { TenantFormState } from '@/lib/actions/tenants';

interface SandboxInfo {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface Props {
  productionTenantId: string;
  sandbox: SandboxInfo | null;
  canEdit: boolean;
}

const initialState: TenantFormState = {};

export default function SandboxPanel({ productionTenantId, sandbox, canEdit }: Props) {
  const boundCreate = createSandboxTenant.bind(null, productionTenantId);
  const [createState, createAction, isCreating] = useActionState(boundCreate, initialState);
  const [cloneMappings, setCloneMappings] = useState(true);
  const [detachState, setDetachState] = useState<TenantFormState>({});
  const [isDetaching, setIsDetaching] = useState(false);
  const [confirmDetach, setConfirmDetach] = useState(false);

  async function handleDetach() {
    setIsDetaching(true);
    const result = await detachSandboxTenant(sandbox!.id);
    setDetachState(result);
    setIsDetaching(false);
    setConfirmDetach(false);
  }

  if (sandbox) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#E8C84A',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{sandbox.name}</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: '#7A5500', background: '#FFF3CD',
            border: '1px solid #E8C84A', borderRadius: 4,
            padding: '2px 7px',
          }}>
            SANDBOX
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, marginBottom: 16 }}>
          <div>
            <div style={{ color: 'var(--muted)', marginBottom: 2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Tenant ID</div>
            <div style={{ fontFamily: 'var(--font-dm-mono)', color: 'var(--navy)', fontSize: 11 }}>{sandbox.id}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', marginBottom: 2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Created</div>
            <div style={{ color: 'var(--navy)' }}>
              {new Date(sandbox.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href={`/platform/tenants/${sandbox.id}`}
            style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}
          >
            View sandbox tenant →
          </Link>

          {canEdit && !confirmDetach && (
            <button
              onClick={() => setConfirmDetach(true)}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            >
              Detach sandbox
            </button>
          )}
        </div>

        {confirmDetach && canEdit && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, fontSize: 13 }}>
            <p style={{ margin: '0 0 10px', color: '#7A2020', fontWeight: 500 }}>
              Detach the sandbox tenant? It will become a standalone tenant and the toggle will be removed. This does not delete any data.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDetach}
                disabled={isDetaching}
                style={{ padding: '5px 12px', background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {isDetaching ? 'Detaching…' : 'Yes, detach'}
              </button>
              <button
                onClick={() => setConfirmDetach(false)}
                style={{ padding: '5px 12px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            {detachState.error && (
              <p style={{ margin: '8px 0 0', color: 'var(--error)', fontSize: 12 }}>{detachState.error}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // No sandbox yet
  if (!canEdit) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        No sandbox configured. Contact a Platform Super Admin to set one up.
      </p>
    );
  }

  if (createState.success) {
    return (
      <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
        Sandbox tenant created. Refresh the page to see it.
      </p>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set('cloneMappings', String(cloneMappings));
        startTransition(() => createAction(fd));
      }}
    >
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
        Creates a linked sandbox tenant for safe testing. Users switch between Production and Sandbox using the context toggle in the top bar.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--navy)', marginBottom: 16, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={cloneMappings}
          onChange={(e) => setCloneMappings(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--blue)' }}
        />
        Copy field mappings from production to sandbox
      </label>

      {createState.error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, fontSize: 13, color: '#9B2B1E' }}>
          {createState.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isCreating}
        style={{
          padding: '7px 14px',
          background: isCreating ? 'var(--muted)' : 'var(--navy)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: isCreating ? 'not-allowed' : 'pointer',
        }}
      >
        {isCreating ? 'Creating…' : 'Create sandbox tenant'}
      </button>
    </form>
  );
}
