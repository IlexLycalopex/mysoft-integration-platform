'use client';

/**
 * InlineTestPanel — per-row step-by-step trace panel.
 * Shows: input → step 1 → step 2 → ... → output
 * Runs the pipeline client-side with preview mode on.
 */

import { useState, useCallback } from 'react';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';
import type { ColumnMappingEntry } from '@/types/database';
import { applyPipeline } from '@/lib/mapping-engine/execute';
import type { StepTrace } from '@/lib/mapping-engine/types';
import { STEP_TYPE_LABELS } from '@/lib/mapping-engine/types';

interface Props {
  entry: ColumnMappingEntry | ColumnMappingEntryV2;
  availableColumns: string[];
  dateLocale?: 'uk' | 'us';
}

export default function InlineTestPanel({ entry, availableColumns, dateLocale = 'uk' }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    value?: string; skip?: boolean; error?: string; trace?: StepTrace[];
  } | null>(null);

  const primaryCol = (entry as ColumnMappingEntryV2).source_column ?? (entry as ColumnMappingEntry).source_column ?? '';

  const runTest = useCallback(() => {
    const row = { ...inputs };
    const r = applyPipeline(row, entry, { dateLocale, preview: true });
    setResult(r);
  }, [inputs, entry, dateLocale]);

  const allCols = primaryCol
    ? [primaryCol, ...availableColumns.filter(c => c !== primaryCol)]
    : availableColumns;

  return (
    <div style={{ background: '#FAFCFF', border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginTop: 6 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', margin: '0 0 10px' }}>
        Test — enter sample values
      </p>

      {/* Input fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {(allCols.length > 0 ? allCols : [primaryCol]).filter(Boolean).slice(0, 8).map(col => (
          <div key={col} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', minWidth: 120, textAlign: 'right', flexShrink: 0 }}>
              {col === primaryCol ? <strong style={{ color: 'var(--navy)' }}>{col}</strong> : col}
            </span>
            <input
              value={inputs[col] ?? ''}
              onChange={e => setInputs(prev => ({ ...prev, [col]: e.target.value }))}
              placeholder={col === primaryCol ? 'primary source' : 'optional'}
              style={{
                flex: 1, padding: '4px 7px', border: '1px solid var(--border)',
                borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
                color: 'var(--navy)', background: '#fff', outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter') runTest(); }}
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={runTest}
        style={{ padding: '5px 14px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Run
      </button>

      {/* Results */}
      {result && (
        <div style={{ marginTop: 12 }}>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>

            {/* Step trace */}
            {result.trace && result.trace.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px' }}>Step trace</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Input */}
                  <TraceRow
                    label="Input"
                    value={inputs[primaryCol] ?? ''}
                    badge="IN"
                    badgeColor="#6B8599"
                  />
                  {result.trace.map((t, i) => (
                    <TraceRow
                      key={i}
                      label={STEP_TYPE_LABELS[t.step.type] ?? t.step.type}
                      value={t.error ?? t.output}
                      badge={String(i + 1)}
                      badgeColor={t.error ? '#9B2B1E' : 'var(--blue)'}
                      isError={Boolean(t.error)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Final output */}
            <div style={{
              padding: '8px 12px', borderRadius: 5, fontSize: 13, fontWeight: 600, fontFamily: 'monospace',
              background: result.error ? '#FDE8E6' : result.skip ? '#FFF8E6' : '#EDFAF3',
              border: `1px solid ${result.error ? '#F5C6C2' : result.skip ? '#F5D98C' : '#A8DFBE'}`,
              color: result.error ? '#9B2B1E' : result.skip ? '#7A5500' : '#1A6B30',
            }}>
              {result.error
                ? `Error: ${result.error}`
                : result.skip
                  ? 'Skipped (on_empty = skip)'
                  : result.value === ''
                    ? '(empty string)'
                    : result.value}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceRow({ label, value, badge, badgeColor, isError = false }: {
  label: string; value: string; badge: string;
  badgeColor: string; isError?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{
        minWidth: 22, height: 18, borderRadius: 9, background: badgeColor, color: '#fff',
        fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {badge}
      </span>
      <span style={{ color: 'var(--muted)', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: isError ? '#9B2B1E' : 'var(--navy)', fontFamily: 'monospace',
        background: '#F2F6FA', border: '1px solid var(--border)', borderRadius: 3,
        padding: '1px 6px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isError ? value : (value === '' ? '(empty)' : value)}
      </span>
    </div>
  );
}
