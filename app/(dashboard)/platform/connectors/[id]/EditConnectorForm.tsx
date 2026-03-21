'use client';

import { useActionState } from 'react';
import { updateConnector } from '@/lib/actions/connectors';

interface ConnectorDetail {
  id: string;
  connector_key: string;
  display_name: string;
  description: string | null;
  default_price_gbp_monthly: number | null;
  is_active: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6,
  background: '#fff', color: 'var(--navy)', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4,
};

export default function EditConnectorForm({ connector }: { connector: ConnectorDetail }) {
  const boundUpdate = updateConnector.bind(null, connector.id);
  const [state, action, pending] = useActionState(boundUpdate, {});

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#9B2B1E', marginBottom: 20 }}>
          {state.error}
        </div>
      )}
      {Object.keys(state).length > 0 && !state.error && !state.fieldErrors && (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#1A6B30', marginBottom: 20 }}>
          Connector updated.
        </div>
      )}
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Connector Key</label>
          <div style={{ padding: '8px 10px', fontSize: 13, background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontFamily: 'monospace' }}>
            {connector.connector_key}
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Immutable after creation.</p>
        </div>

        <div>
          <label style={labelStyle}>Display Name *</label>
          <input name="display_name" required defaultValue={connector.display_name}
            style={{ ...inputStyle, borderColor: state.fieldErrors?.display_name ? '#F5C6C2' : 'var(--border)' }} />
          {state.fieldErrors?.display_name && (
            <p style={{ fontSize: 11, color: '#9B2B1E', marginTop: 3 }}>{state.fieldErrors.display_name}</p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input name="description" defaultValue={connector.description ?? ''} style={inputStyle}
            placeholder="Short description of what this connector does" />
        </div>

        <div>
          <label style={labelStyle}>Default List Price (£/month)</label>
          <input type="number" name="default_price_gbp_monthly" min="0" step="0.01"
            defaultValue={connector.default_price_gbp_monthly ?? ''}
            placeholder="e.g. 150.00" style={inputStyle} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            Catalogue price. Pre-fills when granting a licence to a tenant.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="hidden" name="is_active" value={connector.is_active ? 'true' : 'false'} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" defaultChecked={connector.is_active}
              onChange={(e) => {
                const hidden = e.currentTarget.closest('form')?.querySelector('input[name="is_active"]') as HTMLInputElement;
                if (hidden) hidden.value = e.target.checked ? 'true' : 'false';
              }}
              style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
            <span style={{ color: 'var(--navy)', fontWeight: 500 }}>Active (visible in catalogue)</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" disabled={pending} style={{
            background: pending ? '#8ab8d6' : 'var(--navy)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '9px 20px',
            fontSize: 13, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
          }}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
