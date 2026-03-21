'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteWebhook, testWebhook, replayDelivery } from '@/lib/actions/webhooks';
import type { DeliveryLogRow } from '@/lib/actions/webhooks';
import { WEBHOOK_EVENT_META } from '@/lib/webhooks';
import type { ChannelType } from '@/lib/webhooks';
import WebhookForm from './WebhookForm';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  channel_type: ChannelType;
  last_triggered_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
}

interface Props {
  webhook: WebhookRow;
  deliveryLogs?: DeliveryLogRow[];
}

const CHANNEL_LABELS: Record<ChannelType, { label: string; colour: string; bg: string; border: string }> = {
  generic: { label: 'Generic HTTP', colour: '#374151', bg: '#F3F4F6', border: '#D1D5DB' },
  teams:   { label: 'Teams',        colour: '#1E3A8A', bg: '#EFF6FF', border: '#BFDBFE' },
  slack:   { label: 'Slack',        colour: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
};

export function WebhookCard({ webhook, deliveryLogs = [] }: Props) {
  const router = useRouter();
  const [editing, setEditing]         = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<{ status?: number; ok?: boolean; error?: string } | null>(null);
  const [showLogs, setShowLogs]       = useState(false);

  const channel = CHANNEL_LABELS[webhook.channel_type ?? 'generic'];
  const lastTriggeredRelative = webhook.last_triggered_at
    ? relativeTime(new Date(webhook.last_triggered_at))
    : null;
  const statusOk = webhook.last_status_code !== null && webhook.last_status_code >= 200 && webhook.last_status_code < 300;

  async function handleDelete() {
    if (!confirm(`Delete webhook "${webhook.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const result = await deleteWebhook(webhook.id);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
    } else {
      router.refresh();
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testWebhook(webhook.id);
    setTestResult(result);
    setTesting(false);
  }

  if (editing) {
    return <WebhookForm webhook={webhook} onCancel={() => setEditing(false)} />;
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + status badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{webhook.name}</span>
              {webhook.enabled ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '1px 6px' }}>Enabled</span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>Disabled</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: channel.colour, background: channel.bg, border: `1px solid ${channel.border}`, borderRadius: 4, padding: '1px 6px' }}>
                {channel.label}
              </span>
            </div>

            {/* URL */}
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
              {webhook.url}
            </div>

            {/* Event badges */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {webhook.events.map((ev) => {
                const meta = WEBHOOK_EVENT_META[ev as keyof typeof WEBHOOK_EVENT_META];
                if (!meta) return <span key={ev} style={{ fontSize: 11, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 4, padding: '1px 6px' }}>{ev}</span>;
                return (
                  <span key={ev} style={{ fontSize: 11, fontWeight: 600, color: meta.colour, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 6px' }}>
                    {ev}
                  </span>
                );
              })}
            </div>

            {/* Last triggered */}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {lastTriggeredRelative ? (
                <>
                  Last triggered: {lastTriggeredRelative}
                  {webhook.last_status_code !== null && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '1px 6px',
                      color: statusOk ? '#1A6B30' : '#9B2B1E',
                      background: statusOk ? '#E6F7ED' : '#FDE8E6',
                      border: `1px solid ${statusOk ? '#A3D9B1' : '#F5C6C2'}`,
                    }}>
                      HTTP {webhook.last_status_code}
                    </span>
                  )}
                  {webhook.last_error && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#9B2B1E' }}>{webhook.last_error}</span>
                  )}
                </>
              ) : (
                'Never triggered'
              )}
            </div>

            {/* Test result */}
            {testResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: testResult.error ? '#9B2B1E' : testResult.ok ? '#1A6B30' : '#92620A' }}>
                {testResult.error
                  ? `Test failed: ${testResult.error}`
                  : `Test sent — HTTP ${testResult.status} ${testResult.ok ? '✓' : '✕'}`}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowLogs(!showLogs)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}
            >
              Logs {deliveryLogs.length > 0 && `(${deliveryLogs.length})`}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--navy)', cursor: testing ? 'not-allowed' : 'pointer' }}
            >
              {testing ? 'Sending…' : 'Test'}
            </button>
            <button
              onClick={() => setEditing(true)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--blue)', cursor: 'pointer' }}
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: 'none', border: '1px solid #F5C6C2', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#9B2B1E', cursor: deleting ? 'not-allowed' : 'pointer' }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        {deleteError && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#9B2B1E' }}>{deleteError}</div>
        )}
      </div>

      {/* Delivery log panel */}
      {showLogs && (
        <DeliveryLogPanel logs={deliveryLogs} />
      )}
    </div>
  );
}

// ── Delivery log panel ────────────────────────────────────────────────────────

function DeliveryLogPanel({ logs }: { logs: DeliveryLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', background: '#F7FAFC', padding: '14px 16px', fontSize: 12, color: 'var(--muted)' }}>
        No deliveries logged yet.
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: '#F7FAFC', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Event', 'Status', 'Duration', 'Time', ''].map((h, i) => (
              <th key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase', padding: '7px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: '#F0F4F8' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <DeliveryLogRow key={log.id} log={log} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryLogRow({ log }: { log: DeliveryLogRow }) {
  const [replaying, setReplaying]   = useState(false);
  const [replayResult, setReplayResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const router = useRouter();

  const statusOk = log.status_code !== null && log.status_code >= 200 && log.status_code < 300;
  const meta = WEBHOOK_EVENT_META[log.event as keyof typeof WEBHOOK_EVENT_META];

  async function handleReplay() {
    setReplaying(true);
    setReplayResult(null);
    const res = await replayDelivery(log.id);
    setReplayResult(res);
    setReplaying(false);
    if (res.ok) router.refresh();
  }

  return (
    <tr>
      <td style={{ padding: '7px 16px', fontSize: 12, borderBottom: '1px solid #EEF2F5' }}>
        {meta ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: meta.colour, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 3, padding: '1px 5px' }}>
            {log.event}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono)', color: 'var(--muted)' }}>{log.event}</span>
        )}
        {log.is_replay && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--muted)' }}>replay</span>}
      </td>
      <td style={{ padding: '7px 16px', fontSize: 12, borderBottom: '1px solid #EEF2F5' }}>
        {log.status_code !== null ? (
          <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 3, padding: '1px 6px', color: statusOk ? '#1A6B30' : '#9B2B1E', background: statusOk ? '#E6F7ED' : '#FDE8E6', border: `1px solid ${statusOk ? '#A3D9B1' : '#F5C6C2'}` }}>
            {log.status_code}
          </span>
        ) : log.error ? (
          <span style={{ fontSize: 11, color: '#9B2B1E' }} title={log.error}>Error</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
        )}
      </td>
      <td style={{ padding: '7px 16px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid #EEF2F5' }}>
        {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
      </td>
      <td style={{ padding: '7px 16px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', borderBottom: '1px solid #EEF2F5' }}>
        {relativeTime(new Date(log.delivered_at))}
      </td>
      <td style={{ padding: '7px 16px', textAlign: 'right', borderBottom: '1px solid #EEF2F5' }}>
        <button
          onClick={handleReplay}
          disabled={replaying}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', fontSize: 11, color: 'var(--blue)', cursor: replaying ? 'not-allowed' : 'pointer' }}
        >
          {replaying ? '…' : 'Replay'}
        </button>
        {replayResult && (
          <span style={{ marginLeft: 6, fontSize: 11, color: replayResult.ok ? '#1A6B30' : '#9B2B1E' }}>
            {replayResult.ok ? '✓' : replayResult.error}
          </span>
        )}
      </td>
    </tr>
  );
}

export function AddWebhookButton() {
  const [open, setOpen] = useState(false);

  if (open) {
    return <WebhookForm onCancel={() => setOpen(false)} />;
  }

  return (
    <button
      onClick={() => setOpen(true)}
      style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      + Add webhook
    </button>
  );
}

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
