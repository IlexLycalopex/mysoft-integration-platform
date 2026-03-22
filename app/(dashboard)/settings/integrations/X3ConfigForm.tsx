'use client';

import { useActionState, useState } from 'react';
import { saveX3Credentials, testX3Credentials } from '@/lib/actions/x3-credentials';
import type { X3CredentialsSummary } from '@/lib/actions/x3-credentials';

interface Props {
  existing: X3CredentialsSummary | null;
}

const initialState = { error: undefined as string | undefined, success: false };

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '5px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

export default function X3ConfigForm({ existing }: Props) {
  const [state,     formAction,  pending]     = useActionState(saveX3Credentials, initialState);
  const [testState, testAction,  testPending] = useActionState(testX3Credentials, initialState);
  const [showPassword, setShowPassword]       = useState(false);
  const [useGraphQL,   setUseGraphQL]         = useState(existing?.useGraphQL ?? false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Info banner */}
      <div style={{ background: '#F0F7FF', border: '1px solid #C3DCFF', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--navy)', lineHeight: 1.6 }}>
        <strong>Requirements:</strong> Sage X3 v12+ with the Syracuse server REST API enabled
        (<em>Syracuse Administration → Web Services → REST</em>). Create a dedicated API user
        with the required object-level permissions. Basic authentication (username + password)
        is transmitted over HTTPS only.
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Hidden useGraphQL */}
        <input type="hidden" name="useGraphQL" value={String(useGraphQL)} />

        {/* Save feedback */}
        {state.success && (
          <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
            ✓ Sage X3 credentials saved successfully.
          </div>
        )}
        {state.error && (
          <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
            {state.error}
          </div>
        )}

        {/* Test feedback */}
        {testState.success && (
          <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1A6B30' }}>
            ✓ Connected to Sage X3 successfully — credentials are valid.
          </div>
        )}
        {testState.error && (
          <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
            <strong>Connection test failed:</strong> {testState.error}
          </div>
        )}

        {/* Server URL */}
        <div>
          <label style={labelStyle}>SERVER URL <span style={{ color: 'var(--error)' }}>*</span></label>
          <input
            name="baseUrl"
            required
            defaultValue={existing?.baseUrl ?? ''}
            placeholder="https://x3server.example.com"
            style={inputStyle}
            autoComplete="off"
          />
          <HelpText>
            The base URL of your Syracuse server — no trailing slash. Must be accessible
            from the platform (HTTPS strongly recommended).
          </HelpText>
        </div>

        {/* Solution + Folder */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>SOLUTION CODE <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              name="solution"
              required
              defaultValue={existing?.solution ?? ''}
              placeholder="e.g. SEED"
              style={inputStyle}
              autoComplete="off"
            />
            <HelpText>
              The X3 solution name used in API URLs — typically the same as the folder code
              for single-solution installations.
            </HelpText>
          </div>
          <div>
            <label style={labelStyle}>FOLDER CODE <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              name="folder"
              required
              defaultValue={existing?.folder ?? ''}
              placeholder="e.g. SEED"
              style={inputStyle}
              autoComplete="off"
            />
            <HelpText>
              The X3 folder (company) to post data into. Found under
              <em> Administration → Data → Folders</em>.
            </HelpText>
          </div>
        </div>

        {/* API User */}
        <div>
          <h3 style={sectionHeadingStyle}>API User</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>USERNAME <span style={{ color: 'var(--error)' }}>*</span></label>
              <input
                name="username"
                required
                defaultValue={existing?.username ?? ''}
                placeholder="e.g. APIUSER"
                style={inputStyle}
                autoComplete="off"
              />
              <HelpText>
                An X3 user account enabled for Web Services access. Create under
                <em> Administration → Users → User Setup</em>.
              </HelpText>
            </div>
            <div>
              <label style={labelStyle}>PASSWORD <span style={{ color: 'var(--error)' }}>*</span></label>
              <input
                name="password"
                required
                type={showPassword ? 'text' : 'password'}
                defaultValue=""
                placeholder={existing ? '••••••••  (leave blank to keep current)' : 'Enter password'}
                style={inputStyle}
                autoComplete="new-password"
              />
              <HelpText>Use a strong, unique password — treat this as a service-account credential.</HelpText>
            </div>
          </div>
        </div>

        {/* Advanced */}
        <div>
          <h3 style={sectionHeadingStyle}>Advanced</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>API VERSION</label>
              <input
                name="apiVersion"
                defaultValue={existing?.apiVersion ?? 'v1'}
                placeholder="v1"
                style={inputStyle}
                autoComplete="off"
              />
              <HelpText>REST API version segment (default: v1). Only change if instructed by Sage.</HelpText>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={useGraphQL}
                  onChange={(e) => setUseGraphQL(e.target.checked)}
                  style={{ cursor: 'pointer', width: 14, height: 14 }}
                />
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Use GraphQL API</span>
              </label>
              <HelpText>
                When enabled, record creation uses the X3 GraphQL endpoint
                (<em>/api/graphql</em>) instead of the REST endpoint. Leave off
                unless specifically required — REST is the default and most compatible.
              </HelpText>
            </div>
          </div>
        </div>

        {/* Show password toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="show-x3-pw"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="show-x3-pw" style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            Show password
          </label>
        </div>

        <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="submit"
            formAction={testAction}
            disabled={testPending || pending}
            style={{
              background: testPending ? '#B0C8D8' : '#F0F7FF',
              color:      testPending ? '#fff'    : 'var(--blue)',
              border:     '1px solid var(--blue)',
              borderRadius: 6,
              padding:    '8px 18px',
              fontSize:   13,
              fontWeight: 600,
              cursor:     testPending || pending ? 'not-allowed' : 'pointer',
            }}
          >
            {testPending ? 'Testing…' : '⚡ Test Connection'}
          </button>

          <button
            type="submit"
            disabled={pending || testPending}
            style={{
              background: pending ? '#7dcbee' : 'var(--blue)',
              color:      '#fff',
              border:     'none',
              borderRadius: 6,
              padding:    '8px 18px',
              fontSize:   13,
              fontWeight: 600,
              cursor:     pending || testPending ? 'not-allowed' : 'pointer',
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
  display:       'block',
  fontSize:      11,
  fontWeight:    600,
  color:         'var(--muted)',
  marginBottom:  6,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
  width:      '100%',
  padding:    '8px 10px',
  border:     '1px solid var(--border)',
  borderRadius: 6,
  fontSize:   13,
  color:      'var(--text)',
  background: 'var(--surface)',
  outline:    'none',
  boxSizing:  'border-box',
};
const sectionHeadingStyle: React.CSSProperties = {
  fontSize:      12,
  fontWeight:    700,
  color:         'var(--navy)',
  margin:        '0 0 12px',
  paddingBottom: 6,
  borderBottom:  '1px solid var(--border)',
};
