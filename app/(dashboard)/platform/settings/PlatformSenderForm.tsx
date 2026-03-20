'use client';

import { useActionState, useState } from 'react';
import { savePlatformSenderCredentials } from '@/lib/actions/platform-credentials';
import type { SenderCredentials } from '@/lib/actions/platform-credentials';

const initialState = { error: undefined, success: false };

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '5px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

export default function PlatformSenderForm({ existing }: { existing: SenderCredentials | null }) {
  const [state, formAction, pending] = useActionState(savePlatformSenderCredentials, initialState);
  const [showPasswords, setShowPasswords] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#F0F7FF', border: '1px solid #C3DCFF', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--navy)', lineHeight: 1.6 }}>
        <strong>What are these?</strong> The Web Services Sender credentials identify <em>Mysoft Integrations</em> as an authorised developer to Sage Intacct.
        They are shared across all tenants. Obtain them by registering a Web Services sender subscription in Intacct under <strong>Company → Admin → Subscriptions → Web Services</strong>.
        These are separate from each tenant&apos;s Company and API User credentials.
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {state.success && (
          <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
            Sender credentials saved successfully.
          </div>
        )}
        {state.error && (
          <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
            {state.error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>SENDER ID <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              name="senderId"
              required
              defaultValue={existing?.senderId ?? ''}
              placeholder="Developer sender ID"
              style={inputStyle}
              autoComplete="off"
            />
            <HelpText>The Sender ID issued to Mysoft by Sage. Found under <em>Company → Admin → Subscriptions → Web Services → Sender ID</em>.</HelpText>
          </div>
          <div>
            <label style={labelStyle}>SENDER PASSWORD <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              name="senderPassword"
              required
              type={showPasswords ? 'text' : 'password'}
              defaultValue={existing?.senderPassword ?? ''}
              placeholder={existing ? '••••••••' : 'Enter password'}
              style={inputStyle}
              autoComplete="new-password"
            />
            <HelpText>The password for the Sender ID above. Set when the Web Services subscription was registered.</HelpText>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="show-sender-pw"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="show-sender-pw" style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            Show password
          </label>
        </div>

        <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: pending ? '#7dcbee' : 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
            }}
          >
            {pending ? 'Saving…' : existing ? 'Update sender credentials' : 'Save sender credentials'}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted)',
  marginBottom: 6,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--surface)',
  outline: 'none',
  boxSizing: 'border-box',
};
