'use client';

import { useState, useId } from 'react';
import type { TransactionType, ColumnMappingEntry, MappingTransform } from '@/types/database';
import { INTACCT_FIELDS, TRANSACTION_TYPE_LABELS, TRANSFORM_LABELS } from '@/lib/intacct-fields';

interface Props {
  initialName?: string;
  initialDescription?: string;
  initialTransactionType?: TransactionType;
  initialIsDefault?: boolean;
  initialColumnMappings?: ColumnMappingEntry[];
  onSubmit: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  submitLabel: string;
  showDeleteButton?: boolean;
  onDelete?: () => void;
  /** When true, hides the "Set as default" checkbox (used for platform templates) */
  isTemplate?: boolean;
}

const TRANSACTION_TYPES: TransactionType[] = ['journal_entry', 'ar_invoice', 'ap_bill', 'expense_report', 'ar_payment', 'ap_payment', 'timesheet', 'vendor', 'customer'];

export default function MappingEditor({
  initialName = '',
  initialDescription = '',
  initialTransactionType = 'journal_entry',
  initialIsDefault = false,
  initialColumnMappings = [],
  onSubmit,
  pending,
  error,
  fieldErrors,
  submitLabel,
  showDeleteButton,
  onDelete,
  isTemplate = false,
}: Props) {
  const uid = useId();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [txType, setTxType] = useState<TransactionType>(initialTransactionType);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [rows, setRows] = useState<ColumnMappingEntry[]>(
    initialColumnMappings.length
      ? initialColumnMappings.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() }))
      : [{ id: crypto.randomUUID(), source_column: '', target_field: '', required: false, transform: 'none' }]
  );

  const fields = INTACCT_FIELDS[txType] ?? [];
  const headerFields = fields.filter((f) => f.group === 'header');
  const lineFields = fields.filter((f) => f.group === 'line');

  function addRow() {
    setRows((prev) => [...prev, { id: crypto.randomUUID(), source_column: '', target_field: '', required: false, transform: 'none' }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<ColumnMappingEntry>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('column_mappings', JSON.stringify(rows));
    fd.set('is_default', String(isDefault));
    onSubmit(fd);
  }

  const usedTargetFields = new Set(rows.map((r) => r.target_field).filter(Boolean));

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#9B2B1E', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Meta */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 16px' }}>Mapping details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label htmlFor={`${uid}-name`} style={labelStyle}>Name *</label>
            <input
              id={`${uid}-name`}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ ...inputStyle, borderColor: fieldErrors?.name ? 'var(--error)' : 'var(--border)' }}
              placeholder="e.g. Standard Journal Entry"
            />
            {fieldErrors?.name && <p style={errorStyle}>{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-type`} style={labelStyle}>Transaction type *</label>
            <select
              id={`${uid}-type`}
              name="transaction_type"
              value={txType}
              onChange={(e) => setTxType(e.target.value as TransactionType)}
              style={inputStyle}
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`${uid}-desc`} style={labelStyle}>Description</label>
            <input
              id={`${uid}-desc`}
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={inputStyle}
              placeholder="Optional — describe what this mapping is used for"
            />
          </div>
        </div>
        {!isTemplate && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ accentColor: 'var(--blue)', width: 14, height: 14 }}
            />
            <span style={{ color: 'var(--navy)', fontWeight: 500 }}>Set as default for {TRANSACTION_TYPE_LABELS[txType]}</span>
          </label>
        )}
      </div>

      {/* Column mapping table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Column mappings</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Reference: available Intacct fields */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: '#FAFCFF', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[{ label: 'Header fields', items: headerFields }, { label: 'Line fields', items: lineFields }].map(({ label, items }) => (
            <div key={label}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {items.map((f) => (
                  <span
                    key={f.key}
                    title={f.description}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-dm-mono)',
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: f.required ? '#E6F4FF' : '#F2F6FA',
                      color: f.required ? '#0A4F92' : 'var(--muted)',
                      border: `1px solid ${f.required ? '#A3CFFF' : 'var(--border)'}`,
                      cursor: 'default',
                    }}
                  >
                    {f.key}
                    {f.required && ' *'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Source column (CSV header)</th>
              <th style={thStyle}>Intacct target field</th>
              <th style={thStyle}>Transform</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Required</th>
              <th style={{ ...thStyle, width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>
                  <input
                    value={row.source_column}
                    onChange={(e) => updateRow(row.id, { source_column: e.target.value })}
                    placeholder="e.g. Date"
                    style={{ ...inputStyle, marginBottom: 0, fontSize: 12 }}
                  />
                </td>
                <td style={tdStyle}>
                  <select
                    value={row.target_field}
                    onChange={(e) => updateRow(row.id, { target_field: e.target.value })}
                    style={{ ...inputStyle, marginBottom: 0, fontSize: 12 }}
                  >
                    <option value="">— select field —</option>
                    <optgroup label="Header fields">
                      {headerFields.map((f) => (
                        <option key={f.key} value={f.key} disabled={usedTargetFields.has(f.key) && f.key !== row.target_field}>
                          {f.key} — {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Line fields">
                      {lineFields.map((f) => (
                        <option key={f.key} value={f.key} disabled={usedTargetFields.has(f.key) && f.key !== row.target_field}>
                          {f.key} — {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </td>
                <td style={tdStyle}>
                  <select
                    value={row.transform}
                    onChange={(e) => updateRow(row.id, { transform: e.target.value as MappingTransform })}
                    style={{ ...inputStyle, marginBottom: 0, fontSize: 12 }}
                  >
                    {Object.entries(TRANSFORM_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={row.required}
                    onChange={(e) => updateRow(row.id, { required: e.target.checked })}
                    style={{ accentColor: 'var(--blue)', width: 14, height: 14 }}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 16, padding: '2px 6px', borderRadius: 4 }}
                    title="Remove row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={addRow}
            style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}
          >
            + Add row
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {showDeleteButton && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              style={{ background: 'none', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 14px', fontSize: 13, color: 'var(--error)', cursor: 'pointer' }}
            >
              Delete mapping
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          style={{
            background: pending ? '#7FCBEF' : 'var(--blue)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 5 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--navy)', background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 0 };
const errorStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error)', marginTop: 3 };
const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 12px', textAlign: 'left', background: '#F7FAFC', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #EEF2F5', verticalAlign: 'middle' };
