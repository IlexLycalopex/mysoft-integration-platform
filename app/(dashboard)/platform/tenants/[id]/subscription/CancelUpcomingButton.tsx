'use client';

import { useActionState } from 'react';
import type { SubscriptionActionState } from '@/lib/actions/subscriptions';

interface Props {
  action: (prev: SubscriptionActionState, formData: FormData) => Promise<SubscriptionActionState>;
}

export default function CancelUpcomingButton({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction}>
      {state.error && (
        <p style={{ fontSize: 12, color: '#9B2B1E', margin: '0 0 8px' }}>{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        style={{
          fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
          border: '1px solid #0057A3', background: 'transparent', color: '#0057A3',
          cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Cancelling…' : 'Cancel Pending Change'}
      </button>
    </form>
  );
}
