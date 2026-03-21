'use client';

import { useActionState } from 'react';
import { updateObjectType } from '@/lib/actions/connectors';
import type { ObjectTypeFormState } from '@/lib/actions/connectors';

interface ObjectTypeRow {
  id: string;
  object_key: string;
  display_name: string;
  description: string | null;
  api_object_name: string | null;
  is_active: boolean;
  field_schema: unknown;
}

interface Props {
  connectorId: string;
  connectorName: string;
  objectType: ObjectTypeRow;
}

export default function EditObjectTypeForm({ connectorId, connectorName, objectType }: Props) {
  const boundAction = updateObjectType.bind(null, objectType.id, connectorId);
  const [state, action, pending] = useActionState<ObjectTypeFormState, FormData>(boundAction, {});

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <div style={{ marginBottom: 6 }}>
        <a href={`/platform/connectors/${connectorId}/object-types`} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          ← {connectorName} Object Types
        </a>
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 20px' }}>
        Edit Object Type
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
              defaultValue={objectType.display_name}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
            />
            {state.fieldErrors?.display_name && (
              <p style={{ fontSize: 12, color: '#DC2626', margin: '3px 0 0' }}>{state.fieldErrors.display_name}</p>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
              Object Key
            </label>
            <input
              value={objectType.object_key}
              readOnly
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box', background: '#F7FAFC', color: 'var(--muted)', cursor: 'not-allowed' }}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>Cannot be changed after creation.</p>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            API Object Name
          </label>
          <input
            name="api_object_name"
            defaultValue={objectType.api_object_name ?? ''}
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
            defaultValue={objectType.description ?? ''}
            placeholder="Brief description"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>
            Status
          </label>
          <select
            name="is_active"
            defaultValue={objectType.is_active ? 'true' : 'false'}
            style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
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
            defaultValue={JSON.stringify(objectType.field_schema, null, 2)}
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
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <a href={`/platform/connectors/${connectorId}/object-types`} style={{ fontSize: 13, color: 'var(--muted)', padding: '9px 0', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
