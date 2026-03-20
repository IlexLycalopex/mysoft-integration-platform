'use client';

import { useActionState, useState } from 'react';
import { saveCredentials, testCredentials } from '@/lib/actions/credentials';
import type { IntacctCredentials } from '@/lib/actions/credentials';

interface Props {
  existing: IntacctCredentials | null;
}

const initialState = { error: undefined as string | undefined, success: false };

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '5px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

export default function IntacctConfigForm({ existing }: Props) {
  const [state, formAction, pending] = useActionState(saveCredentials, initialState);
  const [testState, testAction, testPending] = useActionState(testCredentials, initialState);
  const [showPasswords, setShowPasswords] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Info banner */}
      <div style={{ background: '#F0F7FF', border: '1px solid #C3DCFF', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--navy)', lineHeight: 1.6 }}>
        <strong>Where to find these credentials:</strong> Your <strong>Company ID</strong> appears in the top-right corner of Intacct after login.
        API user credentials are managed under <strong>Company → Admin → Users</strong> — create a dedicated Web Services user with <em>Web Services only</em> access.
        Web Services (Sender) credentials are managed by your platform administrator.
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Save result */}
        {state.success && (
          <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
            ✓ Credentials saved successfully.
          </div>
        )}
        {state.error && (
          <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
            {state.error}
          </div>
        )}

        {/* Test result */}
        {testState.success && (
          <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
            ✓ Connected to Intacct successfully — credentials are valid.
          </div>
        )}
        {testState.error && (
          <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
            <strong>Connection test failed:</strong> {testState.error}
          </div>
        )}

        {/* Company */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>COMPANY ID <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              name="companyId"
              required
              defaultValue={existing?.companyId ?? ''}
              placeholder="e.g. MyCompany_UK"
              style={inputStyle}
              autoComplete="off"
            />
            <HelpText>Your Intacct company identifier. Visible in the top-right corner of the Intacct UI after login.</HelpText>
          </div>
          <div>
            <label style={labelStyle}>ENTITY / LOCATION ID</label>
            <input
              name="entityId"
              defaultValue={existing?.entityId ?? ''}
              placeholder="e.g. GBD (leave blank for top-level)"
              style={inputStyle}
              autoComplete="off"
            />
            <HelpText>
              <strong>Multi-entity companies only.</strong> The entity ID to post transactions to (e.g.&nbsp;<em>GBD</em>).
              Found under <em>Company → Entities</em>. Leave blank to post at the consolidated top-level company.
              Required if any GL account has a mandatory Location dimension.
            </HelpText>
          </div>
        </div>

        {/* API User */}
        <div>
          <h3 style={sectionHeadingStyle}>API User</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>API USER ID <span style={{ color: 'var(--error)' }}>*</span></label>
              <input
                name="userId"
                required
                defaultValue={existing?.userId ?? ''}
                placeholder="e.g. xmlgateway"
                style={inputStyle}
                autoComplete="off"
              />
              <HelpText>The username of a dedicated Intacct Web Services user. Create one under <em>Company → Admin → Users</em> — enable <em>Web Services only</em> access.</HelpText>
            </div>
            <div>
              <label style={labelStyle}>API USER PASSWORD <span style={{ color: 'var(--error)' }}>*</span></label>
              <input
                name="userPassword"
                required
                type={showPasswords ? 'text' : 'password'}
                defaultValue={existing?.userPassword ?? ''}
                placeholder={existing ? '••••••••' : 'Enter password'}
                style={inputStyle}
                autoComplete="new-password"
              />
              <HelpText>The password for the API user above. Use a strong, unique value — treat this like a service-account credential.</HelpText>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="show-pw"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="show-pw" style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            Show password
          </label>
        </div>

        <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Test Connection — submits same form to testAction via formAction override */}
          <button
            type="submit"
            formAction={testAction}
            disabled={testPending || pending}
            style={{
              background: testPending ? '#B0C8D8' : '#F0F7FF',
              color: testPending ? '#fff' : 'var(--blue)',
              border: '1px solid var(--blue)',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: testPending || pending ? 'not-allowed' : 'pointer',
            }}
          >
            {testPending ? 'Testing…' : '⚡ Test Connection'}
          </button>

          <button
            type="submit"
            disabled={pending || testPending}
            style={{
              background: pending ? '#7dcbee' : 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: pending || testPending ? 'not-allowed' : 'pointer',
            }}
          >
            {pending ? 'Saving…' : existing ? 'Update credentials' : 'Save credentials'}
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
const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--navy)',
  margin: '0 0 12px',
  paddingBottom: 6,
  borderBottom: '1px solid var(--border)',
};
