'use client';

import { useActionState } from 'react';
import { createObjectType } from '@/lib/actions/connectors';
import type { ObjectTypeFormState } from '@/lib/actions/connectors';

interface Props {
  connectorId: string;
  connectorName: string;
}

const STARTER_SCHEMA = JSON.stringify({
  fields: [
    { key: 'FIELD_KEY', label: 'Field Label', description: 'Description of this field', required: true, group: 'header' },
    { key: 'AMOUNT', label: 'Amount', description: 'Transaction amount', required: true, group: 'line' },
  ],
}, null, 2);

export default function NewObjectTypeForm({ connectorId, connectorName }: Props) {
  const boundAction = createObjectType.bind(null, connectorId);
  const [state, action, pending] = useActionState<ObjectTypeFormState, FormData>(boundAction, {});

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <div style={{ marginBottom: 6 }}>
        <a href={`/platform/connectors/${connectorId}/object-types`} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← {connectorName} Object Types
        </a>
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 20px' }}>
        Add Object Type
      </h1>

      {state.error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#991B1B', marginBottom: 16 }}>
          {state.error}
        </div>
      )}

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
              Display Name *
            </label>
            <input
              name="display_name"
              required
              placeholder="e.g. Purchase Order"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
            />
            {state.fieldErrors?.display_name && (
              <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.display_name}</p>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
              Object Key *
            </label>
            <input
              name="object_key"
              required
              placeholder="e.g. purchase_order"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>Lowercase, underscores only.</p>
            {state.fieldErrors?.object_key && (
              <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.object_key}</p>
            )}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            API Object Name
          </label>
          <input
            name="api_object_name"
            placeholder="e.g. PURCHASEORDER (as used in the connector API)"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Description
          </label>
          <input
            name="description"
            placeholder="Brief description"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Field Schema (JSON)
          </label>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>
            Define the fields available for this object type. Each field: key, label, description, required, group.
          </p>
          <textarea
            name="field_schema"
            rows={14}
            defaultValue={STARTER_SCHEMA}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 12, fontFamily: 'monospace',
              border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical',
            }}
          />
          {state.fieldErrors?.field_schema && (
            <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.field_schema}</p>
          )}
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
            {pending ? 'Creating…' : 'Create object type'}
          </button>
          <a href={`/platform/connectors/${connectorId}/object-types`} style={{ fontSize: 13, color: 'var(--muted)', padding: '9px 0', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
