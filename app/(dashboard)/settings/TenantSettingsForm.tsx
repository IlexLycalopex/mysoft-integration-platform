'use client';

import { useActionState } from 'react';
import { updateTenant } from '@/lib/actions/tenants';

const initialState = { error: undefined, success: false };

interface Props {
  tenant: { id: string; name: string; home_region: string; status: string; created_at: string; file_retention_days: number; settings: Record<string, unknown> };
  canEdit: boolean;
}

export default function TenantSettingsForm({ tenant, canEdit }: Props) {
  const boundAction = updateTenant.bind(null, tenant.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>TENANT NAME</label>
          <input
            name="name"
            defaultValue={tenant.name}
            disabled={!canEdit}
            style={{ ...inputStyle, ...(!canEdit ? disabledStyle : {}) }}
          />
        </div>
        <div>
          <label style={labelStyle}>REGION</label>
          <select
            name="home_region"
            defaultValue={tenant.home_region}
            disabled={!canEdit}
            style={{ ...inputStyle, ...(!canEdit ? disabledStyle : {}) }}
          >
            <option value="uk">United Kingdom</option>
            <option value="us">United States</option>
            <option value="eu">European Union</option>
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>STATUS</label>
        <input value={tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)} readOnly style={{ ...inputStyle, ...disabledStyle }} />
      </div>

      <div>
        <label style={labelStyle}>CREATED</label>
        <input value={new Date(tenant.created_at).toLocaleDateString('en-GB', { dateStyle: 'long' })} readOnly style={{ ...inputStyle, ...disabledStyle }} />
      </div>

      <div>
        <label style={labelStyle}>DELETE UPLOADED FILES AFTER (DAYS)</label>
        <input
          name="file_retention_days"
          type="number"
          min={30}
          max={3650}
          defaultValue={tenant.file_retention_days}
          disabled={!canEdit}
          style={{ ...inputStyle, ...(!canEdit ? disabledStyle : {}) }}
        />
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Files are automatically deleted from storage after this period. Job records and processing logs are kept indefinitely.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <input
          type="checkbox"
          id="approval_required"
          name="approval_required"
          value="true"
          defaultChecked={tenant.settings?.approval_required === 'true'}
          disabled={!canEdit}
          style={{ marginTop: 2, cursor: canEdit ? 'pointer' : 'not-allowed' }}
        />
        <div>
          <label htmlFor="approval_required" style={{ ...labelStyle, cursor: canEdit ? 'pointer' : 'default', marginBottom: 2 }}>
            REQUIRE APPROVAL FOR ALL UPLOADS
          </label>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            When enabled, newly uploaded jobs will require admin approval before they are submitted to Intacct.
          </p>
        </div>
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div style={{ background: '#E6F9EE', border: '1px solid #B8E6C8', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A7A3F' }}>
          Settings saved successfully.
        </div>
      )}

      {canEdit && (
        <div>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: pending ? '#7dcbee' : 'var(--blue)',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
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
