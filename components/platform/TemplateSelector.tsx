// components/platform/TemplateSelector.tsx
'use client';

interface TemplateSelectorProps {
  templates: Array<{ id: string; name: string; version: number; description?: string | null; visibility: string }>;
  selectedId?: string;
  onChange: (id: string) => void;
  locked?: boolean;
}

export default function TemplateSelector({ templates, selectedId, onChange, locked = false }: TemplateSelectorProps) {
  const selected = templates.find((t) => t.id === selectedId);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--navy)',
    background: '#fff',
    boxSizing: 'border-box' as const,
    outline: 'none',
    fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginTop: 4 };

  if (locked) {
    return (
      <div>
        <label style={labelStyle}>Active Template</label>
        <div style={{ padding: '10px 12px', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          {selected ? (
            <div>
              <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{selected.name}</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>v{selected.version}</span>
              {selected.description && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{selected.description}</p>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--muted)' }}>No template assigned</span>
          )}
        </div>
        <p style={hintStyle}>This tenant is locked to a single template. Contact a platform admin to change it.</p>
      </div>
    );
  }

  return (
    <div>
      <label style={labelStyle}>Select Template</label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        <option value="">— No template —</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} (v{t.version})
            {t.visibility === 'platform_published' ? ' · Published' : t.visibility === 'shared_with_tenants' ? ' · Shared' : ' · Private'}
          </option>
        ))}
      </select>
      <p style={hintStyle}>
        {templates.length === 0
          ? 'No templates available. Create and publish a template first.'
          : 'Choose a branding template to apply to this tenant.'}
      </p>
    </div>
  );
}
