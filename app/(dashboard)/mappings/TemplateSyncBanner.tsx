'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptTemplateUpdate, breakTemplateLink } from '@/lib/actions/mappings';
import MappingDiffModal from './MappingDiffModal';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';

interface Props {
  mappingId: string;
  inheritanceMode: 'linked' | 'inherit';
  syncStatus: 'up_to_date' | 'update_available' | 'conflict' | 'diverged' | null;
  parentTemplateName: string;
  parentTemplateVersion: number | null;
  currentTemplateVersion: number | null;
  /** Current tenant column_mappings — for diff display */
  tenantMappings?: ColumnMappingEntryV2[];
  /** Platform template column_mappings — for diff display */
  platformMappings?: ColumnMappingEntryV2[];
}

export default function TemplateSyncBanner({
  mappingId,
  inheritanceMode,
  syncStatus,
  parentTemplateName,
  parentTemplateVersion,
  currentTemplateVersion,
  tenantMappings,
  platformMappings,
}: Props) {
  const router = useRouter();
  const [showDiff, setShowDiff] = useState(false);
  const [accepting, startAccept] = useTransition();
  const [breaking, startBreak] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Nothing to show if standalone or up to date
  if (!syncStatus || syncStatus === 'up_to_date') return null;

  function handleAccept() {
    setError(null);
    startAccept(async () => {
      const result = await acceptTemplateUpdate(mappingId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleBreakLink() {
    if (!confirm('Break the link to the platform template? This mapping will become fully independent and won\'t receive future update notifications.')) return;
    startBreak(async () => {
      const result = await breakTemplateLink(mappingId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const isConflict = syncStatus === 'conflict';
  const pending = accepting || breaking;

  return (
    <>
      <div style={{
        borderRadius: 8, padding: '14px 18px', marginBottom: 20,
        background: isConflict ? '#FEF3C7' : '#EFF6FF',
        border: `1px solid ${isConflict ? '#FCD34D' : '#BFDBFE'}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isConflict ? '#92400E' : '#1E40AF', marginBottom: 2 }}>
            {isConflict
              ? '⚠ Conflict — resolution required'
              : '⚡ Platform template updated'}
          </div>
          <div style={{ fontSize: 12, color: isConflict ? '#78350F' : '#1E3A5F' }}>
            {isConflict
              ? `"${parentTemplateName}" has conflicts that need your review before they can be applied.`
              : <>
                  Linked to <strong>{parentTemplateName}</strong>
                  {parentTemplateVersion && currentTemplateVersion && (
                    <> · v{currentTemplateVersion} → v{parentTemplateVersion}</>
                  )}
                </>
            }
            {' · Mode: '}
            <span style={{ fontWeight: 500 }}>{inheritanceMode === 'inherit' ? 'Inherit (row-level)' : 'Linked'}</span>
          </div>
          {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {platformMappings && tenantMappings && (
            <button
              onClick={() => setShowDiff(true)}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 5,
                border: `1px solid ${isConflict ? '#FCD34D' : '#BFDBFE'}`,
                background: 'transparent', cursor: 'pointer',
                color: isConflict ? '#92400E' : '#1E40AF',
              }}
            >
              View changes
            </button>
          )}
          {!isConflict && (
            <button
              onClick={handleAccept}
              disabled={pending}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 5,
                border: 'none', background: '#1E40AF', color: '#fff',
                cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
              }}
            >
              {accepting ? 'Applying…' : 'Accept update'}
            </button>
          )}
          <button
            onClick={handleBreakLink}
            disabled={pending}
            style={{
              fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none',
              padding: '6px 4px', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.5 : 1,
            }}
          >
            Break link
          </button>
        </div>
      </div>

      {showDiff && tenantMappings && platformMappings && (
        <MappingDiffModal
          parentTemplateName={parentTemplateName}
          fromVersion={currentTemplateVersion}
          toVersion={parentTemplateVersion}
          tenantMappings={tenantMappings}
          platformMappings={platformMappings}
          onClose={() => setShowDiff(false)}
          onAccept={!isConflict ? handleAccept : undefined}
          accepting={accepting}
        />
      )}
    </>
  );
}
