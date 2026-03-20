'use client';

import { useActionState } from 'react';
import { createConnector } from '@/lib/actions/connectors';
import type { ConnectorFormState } from '@/lib/actions/connectors';

export default function NewConnectorPage() {
  const [state, action, pending] = useActionState<ConnectorFormState, FormData>(createConnector, {});

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 20px' }}>
        Add Connector
      </h1>

      {state.error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#991B1B', marginBottom: 16 }}>
          {state.error}
        </div>
      )}

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Connector Key *
          </label>
          <input
            name="connector_key"
            required
            placeholder="e.g. sage_x3, quickbooks"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>
            Lowercase, underscores only. Cannot be changed after creation.
          </p>
          {state.fieldErrors?.connector_key && (
            <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.connector_key}</p>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Display Name *
          </label>
          <input
            name="display_name"
            required
            placeholder="e.g. Sage X3"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
          />
          {state.fieldErrors?.display_name && (
            <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.display_name}</p>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Brief description of this connector's purpose"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: pending ? 'var(--muted)' : 'var(--navy)', color: '#fff',
              fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 6,
              border: 'none', cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            {pending ? 'Creating…' : 'Create connector'}
          </button>
          <a href="/platform/connectors" style={{ fontSize: 13, color: 'var(--muted)', padding: '9px 0', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
