'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createWebhook, updateWebhook } from '@/lib/actions/webhooks';
import type { WebhookActionState } from '@/lib/actions/webhooks';
import { WEBHOOK_EVENT_META } from '@/lib/webhooks';
import type { ChannelType, WebhookEvent } from '@/lib/webhooks';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  channel_type: ChannelType;
}

interface Props {
  webhook?: WebhookRow;
  onCancel: () => void;
}

const CHANNEL_TYPES: { value: ChannelType; label: string; hint: string }[] = [
  { value: 'generic', label: 'Generic HTTP', hint: 'Sends signed JSON payload. Use for custom integrations, n8n, Zapier, etc.' },
  { value: 'teams',   label: 'Microsoft Teams', hint: 'Sends an Adaptive Card to a Teams incoming webhook (Workflows connector).' },
  { value: 'slack',   label: 'Slack', hint: 'Sends a Block Kit message to a Slack incoming webhook URL.' },
];

// Group events for display
const EVENT_GROUPS = [
  {
    group: 'Jobs',
    events: ['job.submitted', 'job.processing', 'job.completed', 'job.partially_completed', 'job.failed', 'job.approved', 'job.rejected'] as WebhookEvent[],
  },
  {
    group: 'Mappings',
    events: ['mapping.template_updated', 'mapping.conflict'] as WebhookEvent[],
  },
  {
    group: 'Quota',
    events: ['quota.warning', 'quota.exceeded'] as WebhookEvent[],
  },
];

// Default events for new webhooks
const DEFAULT_EVENTS: WebhookEvent[] = ['job.completed', 'job.failed'];

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
        {/* Channel type */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Channel type *</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHANNEL_TYPES.map((ct) => (
              <label key={ct.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="channel_type"
                  value={ct.value}
                  defaultChecked={(webhook?.channel_type ?? 'generic') === ct.value}
                  style={{ marginTop: 2, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{ct.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{ct.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="wh-name">Name *</label>
          <input
            id="wh-name"
            name="name"
            type="text"
            defaultValue={webhook?.name ?? ''}
            required
            placeholder="e.g. Teams job alerts"
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
            placeholder="https://..."
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Must start with https://</div>
        </div>

        {/* Secret (generic only hint) */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="wh-secret">
            Signing Secret{' '}
            {isEdit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>(leave blank to keep current)</span>}
            {!isEdit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>}
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
            Generic: adds <code>X-Mysoft-Signature</code> HMAC-SHA256 header. For inbound receivers: validates incoming signature.
          </div>
        </div>

        {/* Events */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Events *</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {EVENT_GROUPS.map((group) => (
              <div key={group.group}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                  {group.group}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.events.map((ev) => {
                    const meta = WEBHOOK_EVENT_META[ev];
                    const checked = isEdit ? webhook.events.includes(ev) : DEFAULT_EVENTS.includes(ev);
                    return (
                      <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          name="events"
                          value={ev}
                          defaultChecked={checked}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: meta.colour, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 7px' }}>
                          {ev}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--navy)' }}>{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
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
