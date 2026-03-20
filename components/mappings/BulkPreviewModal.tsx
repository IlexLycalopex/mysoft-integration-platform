'use client';

/**
 * BulkPreviewModal — paste 1–10 CSV rows and see before/after transformation.
 * Runs entirely client-side via the preview engine — no server round-trip.
 */

import { useState, useCallback } from 'react';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';
import type { ColumnMappingEntry } from '@/types/database';
import { runPreview, parsePastedCsv } from '@/lib/mapping-engine/preview';
import { normaliseEntry } from '@/lib/mapping-engine/compat';
import type { PreviewRow } from '@/lib/mapping-engine/types';

interface Props {
  entries: (ColumnMappingEntry | ColumnMappingEntryV2)[];
  dateLocale?: 'uk' | 'us';
  onClose: () => void;
}

const SAMPLE_CSV = `posting_date,journal_symbol,gl_account,amount,debit_credit,description
15/01/2025,GJ,1000,1500.00,Debit,Sales revenue Q1
15/01/2025,GJ,2000,1500.00,Credit,Sales revenue Q1`;

export default function BulkPreviewModal({ entries, dateLocale = 'uk', onClose }: Props) {
  const [csvText, setCsvText] = useState('');
  const [results, setResults] = useState<PreviewRow[] | null>(null);
  const [parseError, setParseError] = useState('');
  const [activeTrace, setActiveTrace] = useState<{ field: string; rowNum: number } | null>(null);

  const runBulkPreview = useCallback(() => {
    setParseError('');
    if (!csvText.trim()) { setParseError('Paste CSV data first.'); return; }
    const { headers, rows } = parsePastedCsv(csvText);
    if (headers.length === 0 || rows.length === 0) {
      setParseError('Could not parse CSV. Ensure first row is a header row.');
      return;
    }
    const preview = runPreview(rows, entries, { dateLocale });
    setResults(preview);
  }, [csvText, entries, dateLocale]);

  const v2Entries = entries.map(normaliseEntry);
  const targetFields = v2Entries.map(e => e.target_field).filter(Boolean);
  const hasResults = results && results.length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: 0,
        width: '100%', maxWidth: 1000, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Bulk Preview</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>
              Paste CSV data to see how this mapping will transform each row.
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', padding: '0 4px' }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

          {/* Input area */}
          {!hasResults && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'block', marginBottom: 6 }}>
                Paste CSV data (include header row, max 20 rows)
              </label>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={SAMPLE_CSV}
                rows={8}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-dm-mono, monospace)',
                  color: 'var(--navy)', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {parseError && (
                <p style={{ fontSize: 12, color: '#9B2B1E', marginTop: 4 }}>{parseError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={runBulkPreview}
                  style={{ padding: '7px 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Run Preview
                </button>
                <button type="button" onClick={() => setCsvText(SAMPLE_CSV)}
                  style={{ padding: '7px 14px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                  Load example
                </button>
              </div>
            </div>
          )}

          {/* Results table */}
          {hasResults && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
                  {results.length} row{results.length !== 1 ? 's' : ''} previewed
                </p>
                <button type="button" onClick={() => { setResults(null); setCsvText(''); }}
                  style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Edit input
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Row</th>
                      {targetFields.map(f => (
                        <th key={f} style={thStyle}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.rowNum}>
                        <td style={{ ...tdStyle, color: 'var(--muted)', fontWeight: 600 }}>{row.rowNum}</td>
                        {targetFields.map(field => {
                          const cell = row.results[field];
                          const isTrace = activeTrace?.field === field && activeTrace?.rowNum === row.rowNum;
                          if (!cell) {
                            return <td key={field} style={{ ...tdStyle, color: 'var(--muted)', fontStyle: 'italic' }}>—</td>;
                          }
                          return (
                            <td key={field} style={{ ...tdStyle, maxWidth: 160 }}>
                              <div
                                onClick={() => setActiveTrace(isTrace ? null : { field, rowNum: row.rowNum })}
                                style={{
                                  cursor: 'pointer',
                                  padding: '2px 6px', borderRadius: 4,
                                  background: cell.error ? '#FDE8E6' : cell.skip ? '#FFF8E6' : '#EDFAF3',
                                  border: `1px solid ${cell.error ? '#F5C6C2' : cell.skip ? '#F5D98C' : '#A8DFBE'}`,
                                  color: cell.error ? '#9B2B1E' : cell.skip ? '#7A5500' : '#1A6B30',
                                  fontFamily: 'monospace', fontSize: 11,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  outline: isTrace ? '2px solid var(--blue)' : 'none',
                                }}
                                title={cell.error ?? (cell.skip ? 'skipped' : cell.value)}
                              >
                                {cell.error ? `⚠ ${cell.error}` : cell.skip ? '(skipped)' : (cell.value || '(empty)')}
                              </div>

                              {/* Inline trace */}
                              {isTrace && cell.trace && cell.trace.length > 0 && (
                                <div style={{ marginTop: 6, padding: 8, background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4 }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 5px' }}>
                                    Step trace
                                  </p>
                                  {cell.trace.map((t, i) => (
                                    <div key={i} style={{ fontSize: 10, display: 'flex', gap: 4, marginBottom: 2, alignItems: 'flex-start' }}>
                                      <span style={{
                                        background: t.error ? '#9B2B1E' : 'var(--blue)', color: '#fff',
                                        borderRadius: 8, padding: '0 4px', fontWeight: 700, flexShrink: 0,
                                      }}>
                                        {i + 1}
                                      </span>
                                      <span style={{ color: 'var(--muted)', minWidth: 80, flexShrink: 0 }}>
                                        {t.step.type}
                                      </span>
                                      <span style={{ fontFamily: 'monospace', color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.error ? `⚠ ${t.error}` : `"${t.input}" → "${t.output}"`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 2, marginRight: 4 }} />OK</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 2, marginRight: 4 }} />Error</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 2, marginRight: 4 }} />Skipped</span>
                <span style={{ marginLeft: 'auto' }}>Click any cell to see step trace</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '7px 18px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: 'var(--muted)',
  textTransform: 'uppercase', padding: '7px 10px',
  background: '#F7FAFC', borderBottom: '1px solid var(--border)', textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid #EEF2F5', verticalAlign: 'top',
};
