'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/dashboard'), 1500);
  }

  return (
    <div style={cardStyle}>
      <Logo />

      {success ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>Password updated!</p>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Redirecting to your dashboard…</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>Set a new password</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Choose a strong password for your account.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>NEW PASSWORD</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>CONFIRM PASSWORD</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#7dcbee' : 'var(--blue)',
                color: '#fff', border: 'none', borderRadius: 6,
                padding: '10px 16px', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', width: '100%', marginTop: 4,
              }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '40px 36px', width: '100%', maxWidth: 400,
  boxShadow: '0 4px 24px rgba(0,61,91,0.08)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, letterSpacing: 0.3,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: 14, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box',
};

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#003D5B" />
          <path d="M8 22V14l6-4 6 4v8" stroke="#00A3E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 22v-5h6v5" stroke="#00B140" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3 }}>
          Mysoft <span style={{ color: 'var(--blue)' }}>Integrations</span>
        </span>
      </div>
    </div>
  );
}
