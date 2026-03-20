'use client';

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
  const noneOption = '-- none --';

  async function handleApply() {
    if (!selectedId || selectedId === noneOption) return;
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

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' };
  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--navy)',
    background: '#fff',
    boxSizing: 'border-box',
  };

  if (availableTemplates.length === 0) {
    return (
      <div style={{ padding: '14px 16px', background: '#F7FAFC', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--muted)' }}>
        No published templates available.{' '}
        <a href="/platform/branding-templates/new" style={{ color: 'var(--blue)' }}>Create and publish a template</a> first.
      </div>
    );
  }

  return (
    <div>
      {/* Current template status */}
      {currentTemplate && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px', background: '#EEF6FF', border: '1px solid #A3CFFF', borderRadius: 6, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A4F92' }}>
              ✓ Active template: {currentTemplate.name}
            </div>
            <div style={{ fontSize: 12, color: '#2D6CAF', marginTop: 2 }}>
              v{currentTemplateVersion ?? currentTemplate.version}
              {currentTemplate.description && ` — ${currentTemplate.description}`}
            </div>
          </div>
          {!confirmRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 12 }}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {/* Remove confirmation */}
      {confirmRemove && (
        <div style={{ padding: '12px 14px', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 6, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7A5500', margin: '0 0 8px' }}>
            Remove template from this tenant?
          </p>
          <p style={{ fontSize: 12, color: '#7A5500', margin: '0 0 12px' }}>
            The tenant will fall back to direct branding fields only.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleRemove} disabled={isRemoving}
              style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#92620A', color: '#fff', cursor: isRemoving ? 'not-allowed' : 'pointer' }}>
              {isRemoving ? 'Removing…' : 'Confirm Remove'}
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)}
              style={{ fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template selector */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{currentTemplate ? 'Switch template' : 'Assign template'}</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
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
          disabled={!selectedId || !hasChanged || isSaving}
          style={{
            padding: '8px 18px',
            background: (!selectedId || !hasChanged) ? 'var(--border)' : 'var(--blue)',
            color: (!selectedId || !hasChanged) ? 'var(--muted)' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: (!selectedId || !hasChanged || isSaving) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isSaving ? 'Applying…' : currentTemplate ? 'Switch' : 'Apply'}
        </button>
      </div>

      {/* Selected template description */}
      {selectedId && selectedId !== currentTemplate?.id && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          {availableTemplates.find(t => t.id === selectedId)?.description ?? ''}
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: status.ok ? '#E6F7ED' : '#FDE8E6', border: `1px solid ${status.ok ? '#A3D9B1' : '#F5C6C2'}`, color: status.ok ? '#1A6B30' : '#9B2B1E' }}>
          {status.msg}
        </div>
      )}

      {/* Flexibility note */}
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        By default the tenant is locked to the assigned template. To allow them to choose from multiple templates, use{' '}
        <code style={{ fontFamily: 'monospace', fontSize: 10 }}>setTenantAllowedTemplates()</code> via the API or extend this page.
      </div>
    </div>
  );
}
