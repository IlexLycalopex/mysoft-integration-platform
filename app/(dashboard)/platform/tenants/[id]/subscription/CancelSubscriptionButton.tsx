'use client';

import { useActionState, useState } from 'react';
import type { SubscriptionActionState } from '@/lib/actions/subscriptions';

interface Props {
  subscriptionId: string;
  tenantId: string;
  inMinimumPeriod: boolean;
  periodEnd: string;
  action: (prev: SubscriptionActionState, formData: FormData) => Promise<SubscriptionActionState>;
}

export default function CancelSubscriptionButton({
  inMinimumPeriod,
  periodEnd,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, {});

  const periodEndDisplay = new Date(periodEnd).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: 'transparent',
            color: '#9B2B1E',
            border: '1px solid #F5C6C2',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel subscription
        </button>
      )}

      {open && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 8, padding: 20, marginTop: 8 }}>
          <p style={{ fontSize: 13, color: '#9B2B1E', margin: '0 0 12px', fontWeight: 500 }}>
            This will cancel the subscription at the end of the current period. The tenant will retain access until then.
          </p>
          <p style={{ fontSize: 12, color: '#6B8599', margin: '0 0 12px' }}>
            Last active date: <strong style={{ color: '#1A2B38' }}>{periodEndDisplay}</strong>
          </p>

          {inMinimumPeriod && (
            <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: '#92620A', margin: 0, fontWeight: 600 }}>
                Warning: This tenant is still within their minimum commitment period.
              </p>
            </div>
          )}

          {state.error && (
            <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#9B2B1E' }}>
              {state.error}
            </div>
          )}

          <form action={formAction}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
                Cancellation notes
              </label>
              <textarea
                name="notes"
                rows={2}
                defaultValue="Cancelled by platform admin"
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  background: isPending ? '#c9777770' : '#9B2B1E',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Keep Active
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
