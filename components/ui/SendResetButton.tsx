'use client';

import { useTransition, useState } from 'react';
import { sendPasswordReset } from '@/lib/actions/users';

export default function SendResetButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  function handleClick() {
    startTransition(async () => {
      const result = await sendPasswordReset(userId);
      if (result.error) {
        setErrMsg(result.error);
        setStatus('error');
      } else {
        setStatus('sent');
        setTimeout(() => setStatus('idle'), 4000);
      }
    });
  }

  if (status === 'sent') {
    return <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Reset sent ✓</span>;
  }
  if (status === 'error') {
    return <span style={{ fontSize: 11, color: 'var(--error)' }} title={errMsg}>Failed</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        fontSize: 12,
        color: isPending ? 'var(--muted)' : 'var(--blue)',
        cursor: isPending ? 'not-allowed' : 'pointer',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
      }}
    >
      {isPending ? 'Sending…' : 'Send reset'}
    </button>
  );
}
