'use client';

import { useActionState } from 'react';
import { platformUpdateTenant } from '@/lib/actions/tenants';
import type { TenantStatus, TenantRegion } from '@/types/database';

interface Props {
  tenant: { id: string; name: string; slug: string; home_region: TenantRegion; status: TenantStatus; created_at: string };
  canEdit: boolean;
}

const STATUS_OPTIONS: { value: TenantStatus; label: string; colour: string }[] = [
  { value: 'active',      label: 'Active',      colour: '#1A6B30' },
  { value: 'trial',       label: 'Trial',       colour: '#92620A' },
  { value: 'suspended',   label: 'Suspended',   colour: '#9B2B1E' },
  { value: 'offboarded',  label: 'Offboarded',  colour: 'var(--muted)' },
];

const initialState = { error: undefined, success: false };

export default function TenantDetailForm({ tenant, canEdit }: Props) {
  const boundAction = platformUpdateTenant.bind(null, tenant.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>TENANT NAME <span style={{ color: 'var(--error)' }}>*</span></label>
          <input name="name" defaultValue={tenant.name} disabled={!canEdit} required style={{ ...inputStyle, ...(!canEdit ? disabledStyle : {}) }} />
        </div>
        <div>
          <label style={labelStyle}>SLUG</label>
          <input value={tenant.slug} readOnly style={{ ...inputStyle, ...disabledStyle }} />
          <p style={helpStyle}>Auto-generated. Contact support to change.</p>
        </div>
        <div>
          <label style={labelStyle}>REGION</label>
          <select name="home_region" defaultValue={tenant.home_region} disabled={!canEdit} style={{ ...inputStyle, ...(!canEdit ? disabledStyle : {}) }}>
            <option value="uk">United Kingdom</option>
            <option value="us">United States</option>
            <option value="eu">European Union</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>STATUS</label>
          {canEdit ? (
            <select name="status" defaultValue={tenant.status} style={inputStyle}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <>
              <input name="status" type="hidden" value={tenant.status} />
              <input
                value={STATUS_OPTIONS.find((s) => s.value === tenant.status)?.label ?? tenant.status}
                readOnly
                style={{ ...inputStyle, ...disabledStyle }}
              />
            </>
          )}
        </div>
        <div>
          <label style={labelStyle}>CREATED</label>
          <input value={new Date(tenant.created_at).toLocaleDateString('en-GB', { dateStyle: 'long' })} readOnly style={{ ...inputStyle, ...disabledStyle }} />
        </div>
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
          Tenant updated successfully.
        </div>
      )}

      {canEdit && (
        <div>
          <button type="submit" disabled={pending} style={{
            background: pending ? '#7dcbee' : 'var(--blue)', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
          }}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' };
const disabledStyle: React.CSSProperties = { background: '#F7FAFC', color: 'var(--muted)' };
const helpStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' };
