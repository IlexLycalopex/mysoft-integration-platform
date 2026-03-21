'use client';

import { useActionState } from 'react';
import { createConnector } from '@/lib/actions/connectors';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6,
  background: '#fff', color: 'var(--navy)', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4,
};

export default function NewConnectorForm() {
  const [state, action, pending] = useActionState(createConnector, {});

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#9B2B1E', marginBottom: 20 }}>
          {state.error}
        </div>
      )}
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Connector Key *</label>
          <input name="connector_key" required style={{ ...inputStyle, borderColor: state.fieldErrors?.connector_key ? '#F5C6C2' : 'var(--border)' }}
            placeholder="e.g. sage_intacct" />
          {state.fieldErrors?.connector_key && (
            <p style={{ fontSize: 11, color: '#9B2B1E', marginTop: 3 }}>{state.fieldErrors.connector_key}</p>
          )}
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Lowercase, underscores only. Immutable after creation.</p>
        </div>

        <div>
          <label style={labelStyle}>Display Name *</label>
          <input name="display_name" required style={{ ...inputStyle, borderColor: state.fieldErrors?.display_name ? '#F5C6C2' : 'var(--border)' }}
            placeholder="e.g. Sage Intacct" />
          {state.fieldErrors?.display_name && (
            <p style={{ fontSize: 11, color: '#9B2B1E', marginTop: 3 }}>{state.fieldErrors.display_name}</p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input name="description" style={inputStyle} placeholder="Short description of what this connector does" />
        </div>

        <div>
          <label style={labelStyle}>Default List Price (£/month)</label>
          <input type="number" name="default_price_gbp_monthly" min="0" step="0.01"
            placeholder="e.g. 150.00" style={inputStyle} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            Catalogue price. Pre-fills when granting a licence to a tenant (overridable per tenant).
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" disabled={pending} style={{
            background: pending ? '#8ab8d6' : 'var(--navy)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '9px 20px',
            fontSize: 13, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
          }}>
            {pending ? 'Creating…' : 'Create connector'}
          </button>
        </div>
      </form>
    </div>
  );
}
