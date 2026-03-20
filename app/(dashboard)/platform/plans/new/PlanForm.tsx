'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createPlan } from '@/lib/actions/plans';
import type { PlanActionState } from '@/lib/actions/plans';
import { PLAN_FEATURES } from '@/lib/features';

const initialState: PlanActionState = {};

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

export default function PlanForm() {
  const [state, formAction, pending] = useActionState(createPlan, initialState);

  if (state.success) {
    return (
      <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 8, padding: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1A6B30', margin: '0 0 8px' }}>Plan created successfully.</p>
        <Link href="/platform/plans" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
          Back to Plans &rarr;
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>
          {state.error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Plan ID
          <input name="id" type="text" required placeholder="e.g. starter" style={inputStyle} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>Lowercase, no spaces. Used as database key.</span>
        </label>
        <label style={labelStyle}>
          Plan Name
          <input name="name" type="text" required placeholder="e.g. Starter" style={inputStyle} />
        </label>
      </div>

      <label style={{ ...labelStyle, marginBottom: 16 }}>
        Description
        <textarea name="description" rows={2} placeholder="Brief description of this plan" style={{ ...inputStyle, resize: 'vertical' }} />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Price £/mo
          <input name="price" type="number" step="0.01" min="0" placeholder="Blank = free" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Sort Order
          <input name="sort_order" type="number" defaultValue={99} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Status
          <select name="is_active" defaultValue="true" style={inputStyle}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
      </div>

      <div style={sectionHeadStyle}>Monthly Limits (blank = unlimited)</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <label style={labelStyle}>
          Max Jobs
          <input name="max_jobs" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Rows
          <input name="max_rows" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Storage (MB)
          <input name="max_storage_mb" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Watchers
          <input name="max_watchers" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max API Keys
          <input name="max_api_keys" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Max Users
          <input name="max_users" type="number" min="0" placeholder="Unlimited" style={inputStyle} />
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
              defaultChecked={false}
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
          {pending ? 'Creating…' : 'Create Plan'}
        </button>
        <Link href="/platform/plans" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>Cancel</Link>
      </div>
    </form>
  );
}
