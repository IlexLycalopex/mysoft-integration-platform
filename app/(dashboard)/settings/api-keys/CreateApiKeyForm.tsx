'use client';

import { useState, useActionState } from 'react';
import Modal from '@/components/ui/Modal';
import { createApiKey } from '@/lib/actions/api-keys';
import type { ApiKeyFormState } from '@/lib/actions/api-keys';

const initialState: ApiKeyFormState = { success: false };

export default function CreateApiKeyForm() {
  const [open, setOpen] = useState(false);
  // key counter lets us reset the form state after creating a second key
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(createApiKey, initialState);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (state.rawKey) {
      void navigator.clipboard.writeText(state.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCreateAnother() {
    setFormKey((k) => k + 1);
    setCopied(false);
  }

  function handleClose() {
    setOpen(false);
    setFormKey((k) => k + 1);
    setCopied(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--blue)', color: '#fff', border: 'none',
          borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New API Key
      </button>

      {open && (
        <Modal title="Create API Key" onClose={handleClose}>
          {state.success && state.rawKey ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: 8 }}>
                  Key created successfully
                </div>
                <div style={{
                  fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: 'var(--navy)',
                  background: '#fff', border: '1px solid #A8DFBE', borderRadius: 6,
                  padding: '10px 12px', wordBreak: 'break-all', marginBottom: 8,
                }}>
                  {state.rawKey}
                </div>
                <button
                  onClick={handleCopy}
                  style={{
                    background: copied ? '#2EAD6A' : 'var(--green)', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy key'}
                </button>
              </div>
              <div style={{ background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#92620A' }}>
                <strong>Save this key now.</strong> It will not be shown again. If you lose it, you will need to create a new key.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={handleCreateAnother} style={ghostBtnStyle}>
                  Create another
                </button>
                <button type="button" onClick={handleClose} style={primaryBtnStyle}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form key={formKey} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>KEY NAME</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Windows Agent – Production Server"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>EXPIRES (OPTIONAL)</label>
                <input
                  name="expires_at"
                  type="date"
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Leave blank for a key that never expires.
                </div>
              </div>

              {state.error && (
                <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
                  {state.error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={handleClose} style={ghostBtnStyle}>Cancel</button>
                <button type="submit" disabled={pending} style={{ ...primaryBtnStyle, ...(pending ? { background: '#7dcbee' } : {}) }}>
                  {pending ? 'Creating…' : 'Create key'}
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
