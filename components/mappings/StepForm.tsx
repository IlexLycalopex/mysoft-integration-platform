'use client';

/**
 * StepForm — renders the appropriate parameter fields for each TransformStep type.
 * Used inside PipelineEditor to edit a single step.
 */

import type { TransformStep, IfCondition, IfOperator } from '@/lib/mapping-engine/types';
import { STEP_TYPE_LABELS, STEP_TYPE_GROUPS } from '@/lib/mapping-engine/types';

interface Props {
  step: TransformStep;
  onChange: (updated: TransformStep) => void;
  availableColumns: string[];   // source CSV column names for autocomplete
  isNested?: boolean;           // true when rendered inside an if branch
}

const inp: React.CSSProperties = {
  width: '100%', padding: '5px 8px', border: '1px solid var(--border)',
  borderRadius: 5, fontSize: 12, color: 'var(--navy)', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--navy)', marginBottom: 3, display: 'block',
};
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-end' };
const half: React.CSSProperties = { flex: 1 };

const IF_OPERATORS: { value: IfOperator; label: string }[] = [
  { value: 'eq',           label: 'equals' },
  { value: 'neq',          label: 'does not equal' },
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with',  label: 'starts with' },
  { value: 'ends_with',    label: 'ends with' },
  { value: 'empty',        label: 'is empty' },
  { value: 'not_empty',    label: 'is not empty' },
  { value: 'gt',           label: '> (greater than)' },
  { value: 'lt',           label: '< (less than)' },
  { value: 'gte',          label: '>= (greater than or equal)' },
  { value: 'lte',          label: '<= (less than or equal)' },
  { value: 'matches_regex', label: 'matches regex' },
];

const NO_RHS_OPS: IfOperator[] = ['empty', 'not_empty'];

function ColSelect({ value, onChange, columns, placeholder }: {
  value: string; onChange: (v: string) => void;
  columns: string[]; placeholder?: string;
}) {
  return (
    <input
      list="col-list"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? 'column name'}
      style={inp}
    />
  );
}

export default function StepForm({ step, onChange, availableColumns, isNested }: Props) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch } as TransformStep);

  const colOptions = availableColumns.map(c => <option key={c} value={c} />);

  switch (step.type) {
    // ── No-param steps ──────────────────────────────────────────────────────
    case 'trim':
    case 'uppercase':
    case 'lowercase':
    case 'strip_currency':
    case 'number_abs':
    case 'number_negate':
    case 'boolean_to_int':
    case 'tr_type':
      return (
        <div style={{ padding: '4px 0', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
          No parameters needed.
        </div>
      );

    // ── Decimal ─────────────────────────────────────────────────────────────
    case 'decimal':
      return (
        <div>
          <label style={lbl}>Decimal places</label>
          <input type="number" min={0} max={10} value={step.precision ?? 2}
            onChange={e => set({ precision: parseInt(e.target.value, 10) || 2 })}
            style={{ ...inp, width: 80 }} />
        </div>
      );

    // ── Date format ──────────────────────────────────────────────────────────
    case 'date_format':
      return (
        <div>
          <label style={lbl}>Input date locale</label>
          <select value={step.locale ?? 'auto'} onChange={e => set({ locale: e.target.value as 'uk' | 'us' | 'iso' | 'auto' })} style={inp}>
            <option value="auto">Auto-detect (recommended)</option>
            <option value="uk">UK / EU — DD/MM/YYYY</option>
            <option value="us">US — MM/DD/YYYY</option>
            <option value="iso">ISO — YYYY-MM-DD (no change)</option>
          </select>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Output is always YYYY-MM-DD (Intacct standard).
          </p>
        </div>
      );

    // ── Multiply ─────────────────────────────────────────────────────────────
    case 'multiply':
      return (
        <div>
          <label style={lbl}>Factor</label>
          <input type="number" step="any" value={step.factor}
            onChange={e => set({ factor: parseFloat(e.target.value) || 1 })}
            style={{ ...inp, width: 120 }} />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            e.g. 0.01 to convert pence → pounds, -1 to negate
          </p>
        </div>
      );

    // ── Replace ──────────────────────────────────────────────────────────────
    case 'replace':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={row}>
            <div style={half}>
              <label style={lbl}>Find</label>
              <input value={step.find} onChange={e => set({ find: e.target.value })} style={inp} placeholder="text to find" />
            </div>
            <div style={half}>
              <label style={lbl}>Replace with</label>
              <input value={step.replacement} onChange={e => set({ replacement: e.target.value })} style={inp} placeholder="replacement text" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={step.all ?? false} onChange={e => set({ all: e.target.checked })}
              style={{ accentColor: 'var(--blue)' }} />
            Replace all occurrences
          </label>
        </div>
      );

    // ── Regex extract / replace ───────────────────────────────────────────────
    case 'regex_extract':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={lbl}>Regex pattern</label>
            <input value={step.pattern} onChange={e => set({ pattern: e.target.value })} style={inp} placeholder="e.g. (\d{4}-\d{2}-\d{2})" />
          </div>
          <div>
            <label style={lbl}>Capture group (default 1)</label>
            <input type="number" min={0} value={step.group ?? 1}
              onChange={e => set({ group: parseInt(e.target.value, 10) })} style={{ ...inp, width: 80 }} />
          </div>
        </div>
      );

    case 'regex_replace':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={lbl}>Regex pattern</label>
            <input value={step.pattern} onChange={e => set({ pattern: e.target.value })} style={inp} placeholder="e.g. [^0-9]" />
          </div>
          <div>
            <label style={lbl}>Replace with</label>
            <input value={step.replacement} onChange={e => set({ replacement: e.target.value })} style={inp} placeholder="replacement (use $1 for groups)" />
          </div>
        </div>
      );

    // ── Pad ──────────────────────────────────────────────────────────────────
    case 'pad_left':
    case 'pad_right': {
      const dir = step.type === 'pad_left' ? 'left' : 'right';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={row}>
            <div>
              <label style={lbl}>Target length</label>
              <input type="number" min={1} value={step.length}
                onChange={e => set({ length: parseInt(e.target.value, 10) || 1 })} style={{ ...inp, width: 80 }} />
            </div>
            <div style={half}>
              <label style={lbl}>Pad character</label>
              <input value={step.char ?? (dir === 'left' ? '0' : ' ')}
                onChange={e => set({ char: e.target.value.slice(0, 1) || '0' })}
                style={{ ...inp, width: 60 }} maxLength={1} />
            </div>
          </div>
        </div>
      );
    }

    // ── Substring ────────────────────────────────────────────────────────────
    case 'substring':
      return (
        <div style={row}>
          <div>
            <label style={lbl}>Start index</label>
            <input type="number" min={0} value={step.start}
              onChange={e => set({ start: parseInt(e.target.value, 10) || 0 })} style={{ ...inp, width: 80 }} />
          </div>
          <div>
            <label style={lbl}>End index (optional)</label>
            <input type="number" min={0} value={step.end ?? ''}
              onChange={e => set({ end: e.target.value ? parseInt(e.target.value, 10) : undefined })} style={{ ...inp, width: 80 }}
              placeholder="omit = end" />
          </div>
        </div>
      );

    // ── Split take ────────────────────────────────────────────────────────────
    case 'split_take':
      return (
        <div style={row}>
          <div style={half}>
            <label style={lbl}>Delimiter</label>
            <input value={step.delimiter} onChange={e => set({ delimiter: e.target.value })} style={inp} placeholder='e.g. , or " "' />
          </div>
          <div>
            <label style={lbl}>Index (0-based)</label>
            <input type="number" min={0} value={step.index}
              onChange={e => set({ index: parseInt(e.target.value, 10) || 0 })} style={{ ...inp, width: 80 }} />
          </div>
        </div>
      );

    // ── Concat ────────────────────────────────────────────────────────────────
    case 'concat': {
      const cols = step.columns ?? [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={lbl}>Additional columns to append</label>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              The primary source column is always first. Add extra columns to concatenate.
            </p>
            {cols.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                <datalist id="col-list">{colOptions}</datalist>
                <ColSelect value={c} columns={availableColumns}
                  onChange={v => { const next = [...cols]; next[i] = v; set({ columns: next }); }} />
                <button type="button" onClick={() => set({ columns: cols.filter((_, j) => j !== i) })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 16, padding: '0 4px' }}>×</button>
              </div>
            ))}
            <button type="button"
              onClick={() => set({ columns: [...cols, ''] })}
              style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
              + Add column
            </button>
          </div>
          <div>
            <label style={lbl}>Separator (optional)</label>
            <input value={step.separator ?? ''} onChange={e => set({ separator: e.target.value })} style={{ ...inp, width: 120 }} placeholder="e.g. space or comma" />
          </div>
        </div>
      );
    }

    // ── Coalesce ──────────────────────────────────────────────────────────────
    case 'coalesce': {
      const cols = step.columns ?? [];
      return (
        <div>
          <label style={lbl}>Fallback columns (in priority order)</label>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
            Returns the first non-empty value from the primary source column, then these fallbacks.
          </p>
          {cols.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
              <datalist id="col-list">{colOptions}</datalist>
              <ColSelect value={c} columns={availableColumns}
                onChange={v => { const next = [...cols]; next[i] = v; set({ columns: next }); }} />
              <button type="button" onClick={() => set({ columns: cols.filter((_, j) => j !== i) })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 16, padding: '0 4px' }}>×</button>
            </div>
          ))}
          <button type="button"
            onClick={() => set({ columns: [...cols, ''] })}
            style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
            + Add fallback column
          </button>
        </div>
      );
    }

    // ── Lookup ────────────────────────────────────────────────────────────────
    case 'lookup': {
      const table = step.table ?? {};
      const entries = Object.entries(table);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Value map</label>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Source → Target</span>
            </div>
            {entries.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                <input value={k} onChange={e => {
                  const next = { ...table };
                  delete next[k];
                  next[e.target.value] = v;
                  set({ table: next });
                }} style={{ ...inp, flex: 1 }} placeholder="from" />
                <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>→</span>
                <input value={v} onChange={e => set({ table: { ...table, [k]: e.target.value } })} style={{ ...inp, flex: 1 }} placeholder="to" />
                <button type="button" onClick={() => { const next = { ...table }; delete next[k]; set({ table: next }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 16, padding: '0 4px' }}>×</button>
              </div>
            ))}
            <button type="button"
              onClick={() => set({ table: { ...table, '': '' } })}
              style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
              + Add mapping
            </button>
          </div>
          <div>
            <label style={lbl}>If no match found</label>
            <select value={step.fallback ?? 'passthrough'}
              onChange={e => set({ fallback: e.target.value as 'passthrough' | 'error' | 'empty' })} style={inp}>
              <option value="passthrough">Pass through original value</option>
              <option value="empty">Return empty string</option>
              <option value="error">Fail the row (error)</option>
            </select>
          </div>
        </div>
      );
    }

    // ── Static ────────────────────────────────────────────────────────────────
    case 'static':
      return (
        <div>
          <label style={lbl}>Static value</label>
          <input value={step.value} onChange={e => set({ value: e.target.value })} style={inp}
            placeholder="This value will always be used, ignoring the source column" />
        </div>
      );

    // ── Formula ───────────────────────────────────────────────────────────────
    case 'formula':
      return (
        <div>
          <label style={lbl}>Formula expression</label>
          <textarea
            value={step.expression}
            onChange={e => set({ expression: e.target.value })}
            rows={2}
            style={{ ...inp, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, resize: 'vertical' }}
            placeholder='e.g. ROUND({Gross} - {Tax}, 2) or IF({Amount} > 0, {Amount}, ABS({Amount}))'
          />
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            Use <code style={{ fontFamily: 'monospace' }}>{'{COLUMN_NAME}'}</code> to reference source columns.
            {' '}Functions: CONCAT, COALESCE, IF, ABS, ROUND, FLOOR, CEIL, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER
          </p>
        </div>
      );

    // ── If / conditional ──────────────────────────────────────────────────────
    case 'if': {
      const cond = step.condition ?? { operator: 'eq' as IfOperator, value: '' };
      const needsRhs = !NO_RHS_OPS.includes(cond.operator);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Condition */}
          <div>
            <label style={lbl}>Condition — if current value…</label>
            <div style={row}>
              <div style={{ flex: 2 }}>
                <select value={cond.operator}
                  onChange={e => set({ condition: { ...cond, operator: e.target.value as IfOperator } })} style={inp}>
                  {IF_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {needsRhs && (
                <div style={{ flex: 2 }}>
                  <input value={cond.value ?? ''}
                    onChange={e => set({ condition: { ...cond, value: e.target.value } })}
                    style={inp} placeholder="comparison value" />
                </div>
              )}
            </div>
          </div>

          {/* Then branch - just show a note; branch editing is in PipelineEditor */}
          <div style={{ padding: '8px 10px', background: '#EEF6FF', borderRadius: 6, border: '1px solid #A3CFFF', fontSize: 12, color: '#0A4F92' }}>
            Then/Else branches are edited in the step list below this step.
            <br />
            <span style={{ fontWeight: 600 }}>Then:</span> {step.then_steps?.length ?? 0} step(s) &nbsp;|&nbsp;
            <span style={{ fontWeight: 600 }}>Else:</span> {step.else_steps?.length ?? 0} step(s)
          </div>
        </div>
      );
    }

    default:
      return <div style={{ fontSize: 12, color: 'var(--muted)' }}>No parameters for this step type.</div>;
  }
}

export function StepTypeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, color: 'var(--navy)', background: '#fff', outline: 'none' }}>
      <option value="">— select step type —</option>
      {STEP_TYPE_GROUPS.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.types.map(t => (
            <option key={t} value={t}>{STEP_TYPE_LABELS[t] ?? t}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Create a blank step with sensible defaults for its type */
export function blankStep(type: string): TransformStep {
  switch (type) {
    case 'replace':       return { type: 'replace',      find: '', replacement: '', all: false };
    case 'regex_extract': return { type: 'regex_extract', pattern: '', group: 1 };
    case 'regex_replace': return { type: 'regex_replace', pattern: '', replacement: '' };
    case 'pad_left':      return { type: 'pad_left',      length: 6, char: '0' };
    case 'pad_right':     return { type: 'pad_right',     length: 10, char: ' ' };
    case 'substring':     return { type: 'substring',     start: 0 };
    case 'split_take':    return { type: 'split_take',    delimiter: ',', index: 0 };
    case 'decimal':       return { type: 'decimal',       precision: 2 };
    case 'multiply':      return { type: 'multiply',      factor: 1 };
    case 'date_format':   return { type: 'date_format',   locale: 'auto' };
    case 'concat':        return { type: 'concat',        columns: [], separator: '' };
    case 'coalesce':      return { type: 'coalesce',      columns: [] };
    case 'lookup':        return { type: 'lookup',        table: {}, fallback: 'passthrough' };
    case 'static':        return { type: 'static',        value: '' };
    case 'formula':       return { type: 'formula',       expression: '' };
    case 'if':            return { type: 'if',            condition: { operator: 'eq', value: '' }, then_steps: [], else_steps: [] };
    default:              return { type: type as TransformStep['type'] } as TransformStep;
  }
}
