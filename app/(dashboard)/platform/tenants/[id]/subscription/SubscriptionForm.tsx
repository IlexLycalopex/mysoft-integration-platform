'use client';

import { useActionState, useState, useMemo } from 'react';
import type { PlanRow } from '@/lib/actions/usage';
import type { SubscriptionActionState } from '@/lib/actions/subscriptions';

interface Props {
  plans: PlanRow[];
  currentPlanId: string | null;
  currentCustomPrice?: number | null;
  action: (prev: SubscriptionActionState, formData: FormData) => Promise<SubscriptionActionState>;
  heading: string;
}

// Format a local Date as YYYY-MM-DD without timezone conversion
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCommencementOptions() {
  const options: { label: string; value: string; isImmediate: boolean }[] = [];
  const today = new Date();
  const todayStr = toLocalISODate(today);

  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const value = toLocalISODate(d);  // local date, no UTC shift
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const isImmediate = value <= todayStr;
    options.push({
      value,
      label: isImmediate ? `${label} — immediate effect` : label,
      isImmediate,
    });
  }
  return options;
}

export default function SubscriptionForm({ plans, currentPlanId, currentCustomPrice, action, heading }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId ?? '');
  const [isFree, setIsFree] = useState(false);
  const [commencementDate, setCommencementDate] = useState('');

  const commencementOptions = useMemo(() => buildCommencementOptions(), []);

  // Default to 1st of next month on first render
  const defaultDate = commencementOptions[1]?.value ?? commencementOptions[0]?.value ?? '';
  const effectiveDate = commencementDate || defaultDate;
  const isImmediate = commencementOptions.find(o => o.value === effectiveDate)?.isImmediate ?? true;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const isEnterpriseSelected = selectedPlan?.price_gbp_monthly == null && selectedPlanId !== '';
  const isDowngradeFromEnterprise =
    currentPlanId != null &&
    plans.find((p) => p.id === currentPlanId)?.price_gbp_monthly == null &&
    selectedPlanId !== '' &&
    selectedPlanId !== currentPlanId;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', margin: '0 0 16px' }}>{heading}</h2>

      {state.success && (
        <div style={{ background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1A6B30', fontWeight: 500 }}>
          {isImmediate ? 'Subscription updated successfully.' : `Plan change scheduled — takes effect ${new Date(effectiveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}.`}
        </div>
      )}
      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      {/* Downgrade warning */}
      {isDowngradeFromEnterprise && (
        <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 6, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#7A5100' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ Downgrading from custom-priced plan</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            This tenant currently has a custom-priced subscription
            {currentCustomPrice != null ? ` at £${Number(currentCustomPrice).toFixed(2)}/mo` : ''}.
            Changing to <strong>{selectedPlan?.name ?? selectedPlanId}</strong> will apply the standard rate
            {selectedPlan?.price_gbp_monthly != null ? ` (£${Number(selectedPlan.price_gbp_monthly).toFixed(2)}/mo)` : ''}.
            The custom pricing will not carry forward. Previous pricing history is preserved.
          </div>
        </div>
      )}

      {/* Scheduled change info banner */}
      {!isImmediate && (
        <div style={{ background: '#EBF5FF', border: '1px solid #90C4E8', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#0057A3' }}>
          <strong>Scheduled change</strong> — the current subscription will remain active until{' '}
          <strong>{new Date(effectiveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>,
          when the new plan will automatically take effect.
        </div>
      )}

      <form action={formAction}>
        {/* Pass effective commencement date as hidden field */}
        <input type="hidden" name="commencement_date" value={effectiveDate} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
              Plan
            </label>
            <select
              name="plan_id"
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              required
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--navy)' }}
            >
              <option value="">— Select a plan —</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.price_gbp_monthly != null
                    ? ` — £${plan.price_gbp_monthly}/mo`
                    : ' — Custom pricing'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
              Commencement Date
            </label>
            <select
              value={effectiveDate}
              onChange={(e) => setCommencementDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--navy)' }}
            >
              {commencementOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
              {isImmediate ? 'Takes effect immediately upon saving.' : 'Current subscription stays active until this date.'}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
              Minimum Months
            </label>
            <input
              type="number"
              name="min_months"
              defaultValue={3}
              min={1}
              max={36}
              required
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
              Minimum commitment period before cancellation
            </p>
          </div>

          {/* Enterprise custom price */}
          {isEnterpriseSelected && !isFree && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
                Custom Contract Price (£/mo) *
              </label>
              <input
                type="number"
                name="custom_price_gbp"
                defaultValue={currentCustomPrice ?? ''}
                min={0}
                step={0.01}
                placeholder="e.g. 500.00"
                required
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #A3CFFF', borderRadius: 6, background: '#EEF7FF' }}
              />
              <p style={{ fontSize: 11, color: '#0A4F92', margin: '4px 0 0' }}>
                This custom price will be frozen on the subscription record. It will not change unless you edit this subscription.
              </p>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
              Discount %
            </label>
            <input
              type="number"
              name="discount_pct"
              defaultValue={0}
              min={0}
              max={100}
              step={0.01}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
              Leave 0 for standard pricing
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 22 }}>
            <input
              type="checkbox"
              id="is_free_of_charge"
              name="is_free_of_charge"
              value="true"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <label htmlFor="is_free_of_charge" style={{ fontSize: 13, color: 'var(--navy)', cursor: 'pointer', lineHeight: 1.4 }}>
              Free of charge (100% discount override)
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
            Notes (internal)
          </label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Optional internal notes (not shown to tenant)"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          style={{
            background: isPending ? '#8ab8d6' : '#00A3E0',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Saving…' : isImmediate ? 'Save Subscription' : 'Schedule Plan Change'}
        </button>
      </form>
    </div>
  );
}
