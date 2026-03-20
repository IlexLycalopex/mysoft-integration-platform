'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label
          htmlFor="email"
          style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, letterSpacing: 0.3 }}
        >
          EMAIL ADDRESS
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            color: 'var(--text)',
            background: 'var(--surface)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, letterSpacing: 0.3 }}
        >
          PASSWORD
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            color: 'var(--text)',
            background: 'var(--surface)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            background: '#FDE8E6',
            border: '1px solid #F5C6C2',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            color: '#9B2B1E',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          background: loading ? '#7dcbee' : 'var(--blue)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          width: '100%',
          marginTop: 4,
        }}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,61,91,0.08)',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#003D5B" />
            <path d="M8 22V14l6-4 6 4v8" stroke="#00A3E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 22v-5h6v5" stroke="#00B140" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--navy)',
              letterSpacing: -0.3,
            }}
          >
            Mysoft <span style={{ color: 'var(--blue)' }}>Integrations</span>
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Sign in to your workspace
        </p>
      </div>

      <Suspense fallback={<div style={{ height: 200 }} />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
