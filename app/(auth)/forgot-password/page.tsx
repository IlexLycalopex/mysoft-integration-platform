'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const baseUrl = window.location.origin;
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${baseUrl}/api/auth/callback?next=/reset-password`,
    });

    // Always show success — don't reveal whether the email exists
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <div style={cardStyle}>
      <Logo />

      {submitted ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 8px' }}>Check your email</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
            If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
          </p>
          <Link href="/login" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>Forgot your password?</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Enter your email address and we&apos;ll send you a link to reset it.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>EMAIL ADDRESS</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>

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
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <Link href="/login" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </div>
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
