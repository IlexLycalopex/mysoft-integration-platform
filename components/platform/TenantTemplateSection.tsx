// components/platform/TenantTemplateSection.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyTemplateToTenant, clearTenantTemplate } from '@/lib/actions/branding';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: string;
  version: number;
  thumbnail_url: string | null;
}

interface Props {
  tenantId: string;
  currentTemplate: { id: string; name: string; description: string | null; version: number; visibility: string } | null;
  currentTemplateVersion: number | null;
  allowedTemplateIds: string[] | null;
  availableTemplates: Template[];
}

export default function TenantTemplateSection({
  tenantId,
  currentTemplate,
  currentTemplateVersion,
  allowedTemplateIds,
  availableTemplates,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(currentTemplate?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const hasChanged = selectedId !== (currentTemplate?.id ?? '');
  const canApply = Boolean(selectedId) && hasChanged && !isSaving;

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

  async function handleApply() {
    if (!selectedId) return;
    setIsSaving(true);
    setStatus(null);
    const result = await applyTemplateToTenant(tenantId, selectedId);
    setIsSaving(false);
    if (result.success) {
      setStatus({ ok: true, msg: 'Template applied successfully.' });
      router.refresh();
    } else {
      setStatus({ ok: false, msg: result.error ?? 'Failed to apply template.' });
    }
  }

  async function handleRemove() {
    setIsRemoving(true);
    setStatus(null);
    const result = await clearTenantTemplate(tenantId);
    setIsRemoving(false);
    if (result.success) {
      setStatus({ ok: true, msg: 'Template removed. Tenant now uses direct branding.' });
      setSelectedId('');
      setConfirmRemove(false);
      router.refresh();
    } else {
      setStatus({ ok: false, msg: result.error ?? 'Failed to remove template.' });
    }
  }

  if (availableTemplates.length === 0) {
    return (
      <div style={{ padding: '16px 18px', background: '#F7FAFC', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
        No published templates available.{' '}
        <Link href="/platform/branding-templates/new" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
          Create and publish a template
        </Link>{' '}
        first.
      </div>
    );
  }

  return (
    <div>
      {/* Active template info banner */}
      {currentTemplate && !confirmRemove && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px', background: '#EEF6FF', border: '1px solid #A3CFFF', borderRadius: 6, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A4F92' }}>
              Active template: {currentTemplate.name}
            </div>
            <div style={{ fontSize: 12, color: '#2D6CAF', marginTop: 2 }}>
              v{currentTemplateVersion ?? currentTemplate.version}
              {currentTemplate.description ? ` — ${currentTemplate.description}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 14, padding: 0, flexShrink: 0 }}
          >
            Remove
          </button>
        </div>
      )}

      {/* Remove confirmation */}
      {confirmRemove && (
        <div style={{ padding: '14px 16px', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 8, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7A5500', margin: '0 0 6px' }}>
            Remove template from this tenant?
          </p>
          <p style={{ fontSize: 12, color: '#7A5500', margin: '0 0 14px', lineHeight: 1.5 }}>
            The tenant will fall back to direct branding fields only.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              style={{ padding: '7px 16px', background: isRemoving ? 'var(--muted)' : '#92620A', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: isRemoving ? 'not-allowed' : 'pointer' }}
            >
              {isRemoving ? 'Removing…' : 'Confirm Remove'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              style={{ padding: '7px 14px', background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Selector + apply */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{currentTemplate ? 'Switch template' : 'Assign template'}</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={inputStyle}>
            <option value="">— Select a template —</option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version}){t.category ? ` · ${t.category}` : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          style={{
            padding: '8px 18px',
            background: canApply ? 'var(--blue)' : 'var(--border)',
            color: canApply ? '#fff' : 'var(--muted)',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: canApply ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isSaving ? 'Applying…' : currentTemplate ? 'Switch' : 'Apply'}
        </button>
      </div>

      {/* Preview description of selected template */}
      {selectedId && selectedId !== currentTemplate?.id && (() => {
        const t = availableTemplates.find((t) => t.id === selectedId);
        return t?.description ? (
          <p style={hintStyle}>{t.description}</p>
        ) : null;
      })()}

      {/* Status banner */}
      {status && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: status.ok ? '#EDFAF3' : '#FDE8E6', border: `1px solid ${status.ok ? '#A8DFBE' : '#F5C6C2'}`, color: status.ok ? '#1A6B30' : '#9B2B1E' }}>
          {status.msg}
        </div>
      )}

      {/* Flexibility note */}
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10, lineHeight: 1.6 }}>
        By default the tenant is locked to the assigned template. To allow them to choose from multiple templates, configure{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 10 }}>allowed_template_ids</code> via the API.
      </div>
    </div>
  );
}
