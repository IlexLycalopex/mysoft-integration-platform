'use client';

import { useMemo } from 'react';
import { diffMappings } from '@/lib/mapping-engine/diff';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';

interface Props {
  parentTemplateName: string;
  fromVersion: number | null;
  toVersion: number | null;
  tenantMappings: ColumnMappingEntryV2[];
  platformMappings: ColumnMappingEntryV2[];
  onClose: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}

const TYPE_STYLES = {
  added:     { bg: '#E6F7ED', border: '#A3D9B1', badge: '#1A6B30', label: '+ Added' },
  removed:   { bg: '#FEF2F2', border: '#FECACA', badge: '#991B1B', label: '− Removed' },
  modified:  { bg: '#FFFBEB', border: '#FCD34D', badge: '#92400E', label: '~ Modified' },
  unchanged: { bg: 'transparent', border: 'transparent', badge: 'var(--muted)', label: '· Unchanged' },
};

export default function MappingDiffModal({
  parentTemplateName,
  fromVersion,
  toVersion,
  tenantMappings,
  platformMappings,
  onClose,
  onAccept,
  accepting,
}: Props) {
  const diff = useMemo(
    () => diffMappings(tenantMappings, platformMappings),
    [tenantMappings, platformMappings],
  );

  const visibleRows = diff.rows.filter((r) => r.type !== 'unchanged');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: 640, maxWidth: '94vw', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px' }}>
            {parentTemplateName}
            {fromVersion && toVersion && <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 14 }}> — v{fromVersion} → v{toVersion}</span>}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 16 }}>
            {diff.added > 0 && <span style={{ color: '#1A6B30', fontWeight: 500 }}>+{diff.added} added</span>}
            {diff.removed > 0 && <span style={{ color: '#991B1B', fontWeight: 500 }}>−{diff.removed} removed</span>}
            {diff.modified > 0 && <span style={{ color: '#92400E', fontWeight: 500 }}>~{diff.modified} modified</span>}
            {diff.isEmpty && <span>No changes</span>}
          </div>
        </div>

        {/* Diff content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
          {visibleRows.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No changes between these versions.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleRows.map((row) => {
              const s = TYPE_STYLES[row.type];
              return (
                <div key={row.id} style={{
                  borderRadius: 6, padding: '12px 14px',
                  background: s.bg, border: `1px solid ${s.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: row.type === 'modified' ? 8 : 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: s.badge,
                      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
                    }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                      {row.displayLabel}
                    </span>
                    {row.type !== 'unchanged' && (
                      <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {row.targetField}
                      </code>
                    )}
                  </div>

                  {row.type === 'modified' && row.fieldsChanged.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Changed: {row.fieldsChanged.join(', ')}
                    </div>
                  )}

                  {row.type === 'added' && row.after && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {row.after.required ? 'Required' : 'Optional'}
                      {row.after.steps?.length > 0 && ` · ${row.after.steps.length} transform step${row.after.steps.length !== 1 ? 's' : ''}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, color: 'var(--muted)', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '8px 16px', cursor: 'pointer',
            }}
          >
            Close
          </button>
          {onAccept && (
            <button
              onClick={onAccept}
              disabled={accepting}
              style={{
                fontSize: 13, fontWeight: 500, background: accepting ? '#ccc' : 'var(--navy)',
                color: '#fff', border: 'none', borderRadius: 6,
                padding: '8px 18px', cursor: accepting ? 'not-allowed' : 'pointer',
              }}
            >
              {accepting ? 'Applying…' : 'Accept all changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
