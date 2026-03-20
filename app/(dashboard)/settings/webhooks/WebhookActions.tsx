'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteWebhook, testWebhook } from '@/lib/actions/webhooks';
import WebhookForm from './WebhookForm';

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
}

interface Props {
  webhook: WebhookRow;
}

export function WebhookCard({ webhook }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status?: number; ok?: boolean; error?: string } | null>(null);

  const ALL_EVENTS = [
    { value: 'job.completed', colour: '#1A6B30', bg: '#E6F7ED', border: '#A3D9B1' },
    { value: 'job.failed',    colour: '#9B2B1E', bg: '#FDE8E6', border: '#F5C6C2' },
  ];

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

  const lastTriggeredRelative = webhook.last_triggered_at
    ? relativeTime(new Date(webhook.last_triggered_at))
    : null;

  const statusOk = webhook.last_status_code !== null && webhook.last_status_code >= 200 && webhook.last_status_code < 300;

  if (editing) {
    return <WebhookForm webhook={webhook} onCancel={() => setEditing(false)} />;
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + enabled badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{webhook.name}</span>
            {webhook.enabled ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '1px 6px' }}>Enabled</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>Disabled</span>
            )}
          </div>

          {/* URL */}
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
            {webhook.url}
          </div>

          {/* Events */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {ALL_EVENTS.filter((e) => webhook.events.includes(e.value)).map((ev) => (
              <span key={ev.value} style={{ fontSize: 11, fontWeight: 600, color: ev.colour, background: ev.bg, border: `1px solid ${ev.border}`, borderRadius: 4, padding: '1px 6px' }}>
                {ev.value}
              </span>
            ))}
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
