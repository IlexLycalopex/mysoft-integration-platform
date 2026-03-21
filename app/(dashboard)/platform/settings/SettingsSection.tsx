'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updatePlatformSettings } from '@/lib/actions/platform-settings';

export interface SettingField {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'email';
  initialValue: string;
  placeholder?: string;
  suffix?: string; // e.g. "ms", "days", "%"
}

interface Props {
  title: string;
  description?: string;
  badge?: string; // e.g. "Configured"
  fields: SettingField[];
}

export default function SettingsSection({ title, description, badge, fields }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, f.initialValue]))
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  function handleChange(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }));
    setStatus('idle');
  }

  function handleSave() {
    startTransition(async () => {
      // Coerce numbers
      const updates: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = values[f.key] ?? '';
        updates[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      const err = await updatePlatformSettings(updates);
      if (err) {
        setStatus('error');
        setErrorMsg(err);
      } else {
        setStatus('ok');
        router.refresh();
      }
    });
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: '#F7FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{title}</span>
          {description && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{description}</p>
          )}
        </div>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--green)',
            background: '#E6F7ED', border: '1px solid #A3D9B1',
            borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap',
          }}>{badge}</span>
        )}
      </div>

      {/* Fields */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
              {f.label}
            </label>
            {f.description && (
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 6px' }}>{f.description}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type={f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text'}
                value={values[f.key] ?? ''}
                onChange={e => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder ?? ''}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  fontSize: 13,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: '#fff',
                  color: 'var(--navy)',
                  outline: 'none',
                  maxWidth: f.type === 'number' ? 120 : undefined,
                }}
              />
              {f.suffix && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.suffix}</span>
              )}
            </div>
          </div>
        ))}

        {/* Save row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <button
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: '7px 20px',
              fontSize: 13,
              fontWeight: 600,
              background: isPending ? 'var(--muted)' : 'var(--navy)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {status === 'ok' && (
            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ Saved</span>
          )}
          {status === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--red)' }}>Error: {errorMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
