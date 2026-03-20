'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from '@/lib/actions/invites';

const initialState = { error: undefined, success: false };

export default function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const boundAction = acceptInvite.bind(null, token);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    setTimeout(() => router.push('/login?message=account_created'), 1500);
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>Account created!</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>EMAIL ADDRESS</label>
        <input value={email} readOnly style={{ ...inputStyle, background: '#F7FAFC', color: 'var(--muted)' }} />
      </div>
      <div>
        <label style={labelStyle}>PASSWORD</label>
        <input name="password" type="password" required minLength={8} placeholder="Minimum 8 characters" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>CONFIRM PASSWORD</label>
        <input name="confirmPassword" type="password" required minLength={8} placeholder="Repeat password" style={inputStyle} />
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: pending ? '#7dcbee' : 'var(--blue)',
          color: '#fff', border: 'none', borderRadius: 6,
          padding: '10px 16px', fontSize: 14, fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer', width: '100%', marginTop: 4,
        }}
      >
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text)', marginBottom: 6, letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box',
};
