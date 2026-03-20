'use client';

import { useActionState } from 'react';
import type { PlanRow, UsageActionState } from '@/lib/actions/usage';

interface ChangePlanFormProps {
  tenantId: string;
  currentPlanId: string;
  plans: PlanRow[];
  action: (_prev: UsageActionState, formData: FormData) => Promise<UsageActionState>;
}

const initialState: UsageActionState = {};

export default function ChangePlanForm({ currentPlanId, plans, action }: ChangePlanFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', flexShrink: 0 }}>
          Change Plan:
        </label>
        <select
          name="plan_id"
          defaultValue={currentPlanId}
          style={{
            fontSize: 13,
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#fff',
            color: 'var(--navy)',
            minWidth: 180,
          }}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.price_gbp_monthly != null ? ` — £${Number(p.price_gbp_monthly).toFixed(2)}/mo` : ''}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: pending ? 'var(--muted)' : 'var(--blue)',
            color: '#fff',
            cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : 'Save Plan'}
        </button>
        {state.error && (
          <span style={{ fontSize: 12, color: 'var(--error)' }}>{state.error}</span>
        )}
        {state.success && (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Plan updated.</span>
        )}
      </div>
    </form>
  );
}
