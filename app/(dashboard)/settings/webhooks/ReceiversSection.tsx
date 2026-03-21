'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createReceiver, deleteReceiver, toggleReceiver } from '@/lib/actions/webhooks';
import type { ReceiverRow, ReceiverActionState } from '@/lib/actions/webhooks';

interface Props {
  receivers: ReceiverRow[];
  appUrl: string;
  canManage: boolean;
}

const initialState: ReceiverActionState = {};

export default function ReceiversSection({ receivers, appUrl, canManage }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Inbound Receivers</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
            Unique URLs for receiving webhooks from external systems (e.g. Xero, Shopify).
          </p>
        </div>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Add receiver
          </button>
        )}
      </div>

      {showForm && canManage && (
        <ReceiverForm onCancel={() => setShowForm(false)} />
      )}

      {receivers.length === 0 && !showForm ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No inbound receivers yet. Add one to get a unique URL for receiving webhooks from external systems.
        </div>
      ) : (
        receivers.map((r) => (
          <ReceiverCard key={r.id} receiver={r} appUrl={appUrl} canManage={canManage} />
        ))
      )}
    </div>
  );
}

function ReceiverForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createReceiver, initialState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onCancel();
    }
  }, [state.success, router, onCancel]);

  return (
    <div style={{ background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 14 }}>New inbound receiver</div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="rec-name">Name *</label>
          <input id="rec-name" name="name" type="text" required placeholder="e.g. Xero payments" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="rec-desc">Description</label>
          <input id="rec-desc" name="description" type="text" placeholder="Optional description" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="rec-secret">Validation Secret <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
          <input id="rec-secret" name="secret" type="password" autoComplete="new-password" placeholder="Leave blank to skip signature validation" style={inputStyle} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            If set, incoming requests must include an HMAC-SHA256 signature in <code>X-Hub-Signature-256</code> or <code>X-Mysoft-Signature</code>.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{ background: isPending ? 'var(--muted)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: isPending ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? 'Creating…' : 'Create receiver'}
          </button>
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ReceiverCard({ receiver, appUrl, canManage }: { receiver: ReceiverRow; appUrl: string; canManage: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting]     = useState(false);
  const [toggling, setToggling]     = useState(false);
  const [copied, setCopied]         = useState(false);

  const url = `${appUrl}/api/inbound/${receiver.receiver_key}`;

  async function handleDelete() {
    if (!confirm(`Delete receiver "${receiver.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteReceiver(receiver.id);
    router.refresh();
  }

  async function handleToggle() {
    setToggling(true);
    await toggleReceiver(receiver.id, !receiver.enabled);
    setToggling(false);
    router.refresh();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{receiver.name}</span>
            {receiver.enabled ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '1px 6px' }}>Enabled</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>Disabled</span>
            )}
          </div>

          {receiver.description && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{receiver.description}</div>
          )}

          {/* URL with copy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ fontSize: 12, color: 'var(--navy)', background: '#F0F4F8', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 440 }}>
              {url}
            </code>
            <button
              onClick={handleCopy}
              style={{ fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: copied ? '#1A6B30' : 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleToggle}
              disabled={toggling}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--navy)', cursor: toggling ? 'not-allowed' : 'pointer' }}
            >
              {receiver.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: 'none', border: '1px solid #F5C6C2', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#9B2B1E', cursor: deleting ? 'not-allowed' : 'pointer' }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box' };
