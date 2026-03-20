'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createWebhook, updateWebhook } from '@/lib/actions/webhooks';
import type { WebhookActionState } from '@/lib/actions/webhooks';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
}

interface Props {
  webhook?: WebhookRow;
  onCancel: () => void;
}

const ALL_EVENTS = [
  { value: 'job.completed', label: 'Job completed', colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
  { value: 'job.failed',    label: 'Job failed',    colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
];

const initialState: WebhookActionState = {};

export default function WebhookForm({ webhook, onCancel }: Props) {
  const router = useRouter();
  const isEdit = !!webhook;

  const action = isEdit
    ? updateWebhook.bind(null, webhook.id)
    : createWebhook;

  const [state, formAction, isPending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onCancel();
    }
  }, [state.success, router, onCancel]);

  return (
    <div style={{ background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 14 }}>
        {isEdit ? `Edit webhook: ${webhook.name}` : 'Add webhook'}
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      <form action={formAction}>
        {/* Name */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="wh-name">Name *</label>
          <input
            id="wh-name"
            name="name"
            type="text"
            defaultValue={webhook?.name ?? ''}
            required
            placeholder="e.g. Slack notifications"
            style={inputStyle}
          />
        </div>

        {/* URL */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="wh-url">URL *</label>
          <input
            id="wh-url"
            name="url"
            type="url"
            defaultValue={webhook?.url ?? ''}
            required
            placeholder="https://hooks.example.com/webhook"
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Must start with https://</div>
        </div>

        {/* Secret */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="wh-secret">
            Signing Secret{' '}
            {isEdit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>(leave blank to keep current)</span>}
          </label>
          <input
            id="wh-secret"
            name="secret"
            type="password"
            autoComplete="new-password"
            placeholder={isEdit ? '••••••••' : 'Leave blank to skip signature'}
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            If set, each request will include an <code>X-Mysoft-Signature</code> HMAC-SHA256 header.
          </div>
        </div>

        {/* Events */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Events *</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALL_EVENTS.map((ev) => {
              const checked = isEdit ? webhook.events.includes(ev.value) : true;
              return (
                <label key={ev.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="events"
                    value={ev.value}
                    defaultChecked={checked}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 600, color: ev.colour, background: ev.bg, border: `1px solid ${ev.border}`, borderRadius: 4, padding: '1px 7px' }}>
                    {ev.value}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--navy)' }}>{ev.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Enabled */}
        <div style={{ ...fieldGroupStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="wh-enabled"
            name="enabled"
            type="checkbox"
            defaultChecked={webhook?.enabled ?? true}
            style={{ cursor: 'pointer', width: 16, height: 16 }}
          />
          <label htmlFor="wh-enabled" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer', fontWeight: 400 }}>
            Enabled
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: isPending ? 'var(--muted)' : 'var(--blue)',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 18px', fontSize: 13, fontWeight: 500,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add webhook'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: '8px 4px' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldGroupStyle: React.CSSProperties = { marginBottom: 14 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box' };
