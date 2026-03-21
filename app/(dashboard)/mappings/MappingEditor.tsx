'use client';

import { useState, useId } from 'react';
import type { TransactionType, ColumnMappingEntry, MappingTransform } from '@/types/database';
import type { ColumnMappingEntryV2 } from '@/lib/mapping-engine/types';
import { INTACCT_FIELDS, TRANSACTION_TYPE_LABELS, TRANSFORM_LABELS } from '@/lib/intacct-fields';
import type { ObjectTypeOption, LicencedConnectorOption } from '@/lib/connectors/registry';
import { normaliseEntry, blankV2Entry } from '@/lib/mapping-engine/compat';
import PipelineEditor from '@/components/mappings/PipelineEditor';
import InlineTestPanel from '@/components/mappings/InlineTestPanel';
import BulkPreviewModal from '@/components/mappings/BulkPreviewModal';

interface Props {
  initialName?: string;
  initialDescription?: string;
  initialTransactionType?: string | null;
  initialIsDefault?: boolean;
  initialColumnMappings?: (ColumnMappingEntry | ColumnMappingEntryV2)[];
  onSubmit: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
  submitLabel: string;
  showDeleteButton?: boolean;
  onDelete?: () => void;
  isTemplate?: boolean;
  objectTypes?: ObjectTypeOption[];
  connectors?: LicencedConnectorOption[];
  defaultConnectorId?: string | null;
  initialConnectorId?: string | null;
}

const FALLBACK_TYPES: ObjectTypeOption[] = Object.entries(TRANSACTION_TYPE_LABELS).map(([key, displayName], i) => ({
  key,
  displayName,
  fields: INTACCT_FIELDS[key] ?? [],
  sortOrder: i * 10,
}));

export default function MappingEditor({
  initialName = '',
  initialDescription = '',
  initialTransactionType,
  initialIsDefault = false,
  initialColumnMappings = [],
  onSubmit,
  pending,
  error,
  success,
  fieldErrors,
  submitLabel,
  showDeleteButton,
  onDelete,
  isTemplate = false,
  objectTypes,
  connectors,
  defaultConnectorId,
  initialConnectorId,
}: Props) {
  const uid = useId();

  const resolvedTypes = objectTypes?.length ? objectTypes : FALLBACK_TYPES;
  const defaultType = resolvedTypes[0]?.key ?? 'journal_entry';

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [txType, setTxType] = useState<string>(initialTransactionType ?? defaultType);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [connectorId, setConnectorId] = useState<string>(initialConnectorId ?? defaultConnectorId ?? '');

  // Normalise all entries to v2 on mount
  const [rows, setRows] = useState<ColumnMappingEntryV2[]>(() =>
    initialColumnMappings.length
      ? initialColumnMappings.map(normaliseEntry)
      : [blankV2Entry()]
  );

  // Per-row UI state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [testOpenRow, setTestOpenRow] = useState<string | null>(null);
  const [showBulkPreview, setShowBulkPreview] = useState(false);

  const activeType = resolvedTypes.find(t => t.key === txType);
  const fields = activeType?.fields ?? INTACCT_FIELDS[txType] ?? [];
  const headerFields = fields.filter(f => f.group === 'header');
  const lineFields   = fields.filter(f => f.group === 'line');

  // All source column names currently defined (for autocomplete in pipeline steps)
  const knownColumns = rows.map(r => r.source_column ?? '').filter(Boolean);

  function addRow() {
    const blank = blankV2Entry();
    setRows(prev => [...prev, blank]);
    setExpandedRow(blank.id);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
    if (expandedRow === id) setExpandedRow(null);
    if (testOpenRow === id) setTestOpenRow(null);
  }

  function updateRow(id: string, patch: Partial<ColumnMappingEntryV2>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('column_mappings', JSON.stringify(rows));
    fd.set('is_default', String(isDefault));
    fd.set('mapping_version', '2');
    if (connectorId) {
      fd.set('connector_id', connectorId);
    }
    onSubmit(fd);
  }

  const usedTargetFields = new Set(rows.map(r => r.target_field).filter(Boolean));

  // Step summary text for collapsed rows
  function stepSummary(row: ColumnMappingEntryV2): string {
    if (!row.steps.length) {
      return row.transform && row.transform !== 'none'
        ? TRANSFORM_LABELS[row.transform] ?? row.transform
        : 'No transforms';
    }
    return row.steps.length === 1
      ? row.steps[0].type
      : `${row.steps.length} steps`;
  }

  return (
    <form onSubmit={handleSubmit}>
      {success && (
        <div style={{ background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#1A6B30', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Saved.</span> Mapping updated successfully.
        </div>
      )}
      {error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#9B2B1E', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── Mapping details ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 16px' }}>Mapping details</h3>
        {connectors && connectors.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor={`${uid}-connector`} style={labelStyle}>Connector</label>
            <select
              id={`${uid}-connector`}
              value={connectorId}
              onChange={e => setConnectorId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— None / all connectors —</option>
              {connectors.map(c => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>
              Associate this mapping with a specific connector (optional).
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label htmlFor={`${uid}-name`} style={labelStyle}>Name *</label>
            <input id={`${uid}-name`} name="name" value={name} onChange={e => setName(e.target.value)} required
              style={{ ...inputStyle, borderColor: fieldErrors?.name ? 'var(--error)' : 'var(--border)' }}
              placeholder="e.g. Standard Journal Entry" />
            {fieldErrors?.name && <p style={errorStyle}>{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-type`} style={labelStyle}>Transaction type *</label>
            <select id={`${uid}-type`} name="transaction_type" value={txType}
              onChange={e => setTxType(e.target.value)} style={inputStyle}>
              {resolvedTypes.map(t => <option key={t.key} value={t.key}>{t.displayName}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${uid}-desc`} style={labelStyle}>Description</label>
            <input id={`${uid}-desc`} name="description" value={description}
              onChange={e => setDescription(e.target.value)} style={inputStyle}
              placeholder="Optional — describe what this mapping is used for" />
          </div>
        </div>
        {!isTemplate && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
              style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
            <span style={{ color: 'var(--navy)', fontWeight: 500 }}>Set as default for {activeType?.displayName ?? TRANSACTION_TYPE_LABELS[txType as TransactionType] ?? txType}</span>
          </label>
        )}
      </div>

      {/* ── Field reference ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', background: '#FAFCFF', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[{ label: 'Header fields', items: headerFields }, { label: 'Line fields', items: lineFields }].map(({ label, items }) => (
            <div key={label}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {items.map(f => (
                  <span key={f.key} title={f.description} style={{
                    fontSize: 10, fontFamily: 'var(--font-dm-mono)', padding: '1px 6px', borderRadius: 3,
                    background: f.required ? '#E6F4FF' : '#F2F6FA',
                    color: f.required ? '#0A4F92' : 'var(--muted)',
                    border: `1px solid ${f.required ? '#A3CFFF' : 'var(--border)'}`,
                    cursor: 'default',
                  }}>
                    {f.key}{f.required ? ' *' : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            Field mappings
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
              {rows.length} row{rows.length !== 1 ? 's' : ''}
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowBulkPreview(true)}
              style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: '1px solid var(--blue)', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontWeight: 500 }}>
              Test with sample data
            </button>
          </div>
        </div>

        {/* ── Mapping rows ──────────────────────────────────────────────────── */}
        <div style={{ padding: '8px 12px' }}>
          {rows.map((row, idx) => {
            const isExpanded = expandedRow === row.id;
            const isTestOpen = testOpenRow === row.id;
            const targetInfo = fields.find(f => f.key === row.target_field);

            return (
              <div key={row.id} style={{
                border: '1px solid var(--border)', borderRadius: 7, marginBottom: 8,
                background: isExpanded ? '#FAFCFF' : 'var(--surface)',
                overflow: 'hidden',
              }}>
                {/* ── Row header ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}
                  onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                  {/* Index */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, minWidth: 22, height: 22, borderRadius: 11,
                    background: row.target_field ? '#0069B4' : 'var(--border)',
                    color: row.target_field ? '#fff' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>

                  {/* Source → target summary */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ fontFamily: 'monospace', color: row.source_column ? 'var(--navy)' : 'var(--muted)', fontWeight: 500 }}>
                        {row.source_column || 'source column'}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>→</span>
                      <span style={{ fontFamily: 'monospace', color: row.target_field ? '#0069B4' : 'var(--muted)', fontWeight: 600 }}>
                        {row.target_field || 'target field'}
                      </span>
                      {targetInfo?.required && (
                        <span style={{ fontSize: 10, color: '#0A4F92', background: '#E6F4FF', border: '1px solid #A3CFFF', borderRadius: 3, padding: '0 4px' }}>required</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                      {stepSummary(row)}
                      {row.on_empty !== 'error' && row.on_empty !== 'null' && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: '#7A5500', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 3, padding: '0 4px' }}>
                          {row.on_empty === 'default' ? `default: "${row.default_value ?? ''}"` : row.on_empty}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Required badge */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                    onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={row.required}
                      onChange={e => updateRow(row.id, { required: e.target.checked })}
                      style={{ accentColor: 'var(--blue)', width: 13, height: 13 }} />
                    <span style={{ color: 'var(--muted)' }}>req</span>
                  </label>

                  {/* Remove */}
                  <button type="button" onClick={e => { e.stopPropagation(); removeRow(row.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 18, padding: '0 2px', flexShrink: 0 }}>
                    ×
                  </button>

                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* ── Row detail ─────────────────────────────────────────── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 12px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      {/* Source column */}
                      <div>
                        <label style={labelStyle}>Source column (CSV header)</label>
                        <input value={row.source_column ?? ''} onChange={e => updateRow(row.id, { source_column: e.target.value })}
                          placeholder="e.g. posting_date" style={{ ...inputStyle, fontSize: 12 }} />
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          Exact header name from your CSV file.
                        </p>
                      </div>

                      {/* Target field */}
                      <div>
                        <label style={labelStyle}>Intacct target field</label>
                        <select value={row.target_field} onChange={e => updateRow(row.id, { target_field: e.target.value })}
                          style={{ ...inputStyle, fontSize: 12 }}>
                          <option value="">— select field —</option>
                          <optgroup label="Header fields">
                            {headerFields.map(f => (
                              <option key={f.key} value={f.key} disabled={usedTargetFields.has(f.key) && f.key !== row.target_field}>
                                {f.key} — {f.label}{f.required ? ' *' : ''}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Line fields">
                            {lineFields.map(f => (
                              <option key={f.key} value={f.key} disabled={usedTargetFields.has(f.key) && f.key !== row.target_field}>
                                {f.key} — {f.label}{f.required ? ' *' : ''}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {targetInfo && (
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{targetInfo.description}</p>
                        )}
                      </div>
                    </div>

                    {/* On empty */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={labelStyle}>If empty after pipeline</label>
                        <select value={row.on_empty} onChange={e => updateRow(row.id, { on_empty: e.target.value as ColumnMappingEntryV2['on_empty'] })}
                          style={{ ...inputStyle, fontSize: 12 }}>
                          <option value="null">Allow empty (pass null to Intacct)</option>
                          <option value="error">Fail the row (error)</option>
                          <option value="skip">Skip this field only</option>
                          <option value="default">Use default value</option>
                        </select>
                      </div>
                      {row.on_empty === 'default' && (
                        <div>
                          <label style={labelStyle}>Default value</label>
                          <input value={row.default_value ?? ''} onChange={e => updateRow(row.id, { default_value: e.target.value })}
                            style={{ ...inputStyle, fontSize: 12 }} placeholder="Value to use when empty" />
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Notes (internal)</label>
                      <input value={row.notes ?? ''} onChange={e => updateRow(row.id, { notes: e.target.value })}
                        style={{ ...inputStyle, fontSize: 12 }} placeholder="Optional documentation for this row" />
                    </div>

                    {/* Pipeline steps */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>Transform pipeline</label>
                        <button type="button"
                          onClick={() => setTestOpenRow(isTestOpen ? null : row.id)}
                          style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: '1px solid var(--blue)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                          {isTestOpen ? 'Hide test' : 'Test this row'}
                        </button>
                      </div>

                      <PipelineEditor
                        steps={row.steps}
                        onChange={steps => updateRow(row.id, { steps })}
                        availableColumns={knownColumns}
                      />

                      {isTestOpen && (
                        <InlineTestPanel
                          entry={row}
                          availableColumns={knownColumns}
                          dateLocale="uk"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add row */}
          <button type="button" onClick={addRow}
            style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '7px 14px', fontSize: 12, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500, width: '100%', marginTop: 2 }}>
            + Add field mapping
          </button>
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {showDeleteButton && onDelete && (
            <button type="button" onClick={onDelete}
              style={{ background: 'none', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 14px', fontSize: 13, color: 'var(--error)', cursor: 'pointer' }}>
              Delete mapping
            </button>
          )}
        </div>
        <button type="submit" disabled={pending}
          style={{
            background: pending ? '#7FCBEF' : 'var(--blue)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '9px 20px',
            fontSize: 13, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
          }}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>

      {/* Bulk preview modal */}
      {showBulkPreview && (
        <BulkPreviewModal
          entries={rows}
          dateLocale="uk"
          onClose={() => setShowBulkPreview(false)}
        />
      )}
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 0 };
const errorStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error)', marginTop: 3 };
