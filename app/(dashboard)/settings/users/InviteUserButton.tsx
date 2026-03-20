'use client';

import { useState, useActionState } from 'react';
import Modal from '@/components/ui/Modal';
import { createInvite } from '@/lib/actions/invites';

const ROLES = [
  { value: 'tenant_admin',    label: 'Admin — full tenant management' },
  { value: 'tenant_operator', label: 'Operator — uploads and job monitoring' },
  { value: 'tenant_auditor',  label: 'Auditor — read-only access' },
];

const initialState = { error: undefined, success: false };

export default function InviteUserButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createInvite, initialState);

  if (state.success && open) {
    setTimeout(() => { setOpen(false); }, 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--blue)', color: '#fff', border: 'none',
          borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Invite user
      </button>

      {open && (
        <Modal title="Invite team member" onClose={() => setOpen(false)}>
          {state.success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>Invitation sent!</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>The user will receive an email with a link to set their password.</p>
            </div>
          ) : (
            <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <input name="email" type="email" required placeholder="colleague@company.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ROLE</label>
                <select name="role" required defaultValue="tenant_operator" style={inputStyle}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {state.error && (
                <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
                  {state.error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setOpen(false)} style={ghostBtnStyle}>Cancel</button>
                <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, ...(pending ? { background: '#7dcbee' } : {}) }}>
                  {pending ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' };
const ghostBtnStyle: React.CSSProperties = { background: 'transparent', color: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const primaryBtnStyle: React.CSSProperties = { background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
