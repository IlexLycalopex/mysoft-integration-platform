'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updatePlan } from '@/lib/actions/plans';
import type { PlanActionState } from '@/lib/actions/plans';
import type { PlanRow } from '@/lib/actions/usage';
import { PLAN_FEATURES } from '@/lib/features';

interface Props {
  plan: PlanRow;
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--navy)',
};

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '7px 10px',
  background: '#fff',
  color: 'var(--navy)',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const sectionHeadStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
  color: 'var(--muted)',
  marginBottom: 12,
  marginTop: 24,
  borderBottom: '1px solid var(--border)',
  paddingBottom: 6,
};

const initialState: PlanActionState = {};

export default function PlanEditForm({ plan }: Props) {
  const boundUpdatePlan = updatePlan.bind(null, plan.id);
  const [state, formAction, pending] = useActionState(boundUpdatePlan, initialState);

  return (
    <form action={formAction}>
      {state.success && (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#1A6B30', fontWeight: 600, marginBottom: 16 }}>
          Plan updated successfully.
        </div>
      )}
      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>
          {state.error}
        </div>
      )}

      {/* Read-only Plan ID */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 4 }}>Plan ID</div>
        <div style={{ fontSize: 13, fontFamily: 'monospace', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--muted)' }}>
          {plan.id}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Plan Name
          <input name="name" type="text" required defaultValue={plan.name} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Price £/mo
          <input name="price" type="number" step="0.01" min="0" defaultValue={plan.price_gbp_monthly ?? ''} placeholder="Blank = free" style={inputStyle} />
        </label>
      </div>

      <label style={{ ...labelStyle, marginBottom: 16 }}>
        Description
        <textarea name="description" rows={2} defaultValue={plan.description ?? ''} placeholder="Brief description" style={{ ...inputStyle, resize: 'vertical' }} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Sort Order
          <input name="sort_order" type="number" defaultValue={plan.sort_order} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Status
          <select name="is_active" defaultValue={plan.is_active ? 'true' : 'false'} style={inputStyle}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
      </div>

      <div style={sectionHeadStyle}>Monthly Limits (blank = unlimited)</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Max Jobs
          <input name="max_jobs" type="number" min="0" defaultValue={plan.max_jobs_per_month ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Rows
          <input name="max_rows" type="number" min="0" defaultValue={plan.max_rows_per_month ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Storage (MB)
          <input name="max_storage_mb" type="number" min="0" defaultValue={plan.max_storage_mb ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Watchers
          <input name="max_watchers" type="number" min="0" defaultValue={plan.max_watchers ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max API Keys
          <input name="max_api_keys" type="number" min="0" defaultValue={plan.max_api_keys ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Users
          <input name="max_users" type="number" min="0" defaultValue={plan.max_users ?? ''} placeholder="Unlimited" style={inputStyle} />
        </label>
      </div>

      <div style={sectionHeadStyle}>Features</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
        {PLAN_FEATURES.map((f) => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}>
            <input
              type="checkbox"
              name="features"
              value={f.key}
              defaultChecked={plan.features.includes(f.key)}
              style={{ marginTop: 2, accentColor: 'var(--blue)', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{f.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{f.description}</div>
            </div>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: pending ? 'var(--muted)' : 'var(--blue)',
            color: '#fff',
            cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
        <Link href="/platform/plans" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Cancel</Link>
      </div>
    </form>
  );
}
