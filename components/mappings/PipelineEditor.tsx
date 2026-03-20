'use client';

/**
 * PipelineEditor — drag-reorderable list of transform steps for one mapping row.
 * Renders a step header + StepForm for each step, plus add/remove controls.
 */

import { useState } from 'react';
import type { TransformStep } from '@/lib/mapping-engine/types';
import { STEP_TYPE_LABELS } from '@/lib/mapping-engine/types';
import StepForm, { StepTypeSelector, blankStep } from './StepForm';

interface Props {
  steps: TransformStep[];
  onChange: (steps: TransformStep[]) => void;
  availableColumns: string[];
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  marginBottom: 6,
  background: 'var(--surface)',
  overflow: 'hidden',
};

const stepHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 10px',
  background: '#F7FAFC',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
  userSelect: 'none',
};

export default function PipelineEditor({ steps, onChange, availableColumns }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(steps.length > 0 ? 0 : null);
  const [addingType, setAddingType] = useState('');

  function updateStep(i: number, updated: TransformStep) {
    const next = [...steps];
    next[i] = updated;
    onChange(next);
  }

  function removeStep(i: number) {
    const next = steps.filter((_, j) => j !== i);
    onChange(next);
    setOpenIdx(null);
  }

  function moveStep(i: number, dir: -1 | 1) {
    const next = [...steps];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    onChange(next);
    setOpenIdx(target);
  }

  function addStep() {
    if (!addingType) return;
    const blank = blankStep(addingType);
    const next = [...steps, blank];
    onChange(next);
    setOpenIdx(next.length - 1);
    setAddingType('');
  }

  if (steps.length === 0) {
    return (
      <div>
        <div style={{ padding: '10px 12px', background: '#F7FAFC', border: '1px dashed var(--border)', borderRadius: 6, marginBottom: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          No pipeline steps. Value passes through unchanged.
        </div>
        <AddStepBar addingType={addingType} setAddingType={setAddingType} onAdd={addStep} />
      </div>
    );
  }

  return (
    <div>
      {steps.map((step, i) => {
        const isOpen = openIdx === i;
        const label = STEP_TYPE_LABELS[step.type] ?? step.type;
        const stepNum = i + 1;

        return (
          <div key={i} style={card}>
            {/* Step header */}
            <div style={stepHeader} onClick={() => setOpenIdx(isOpen ? null : i)}>
              {/* Step number badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, minWidth: 20, height: 20,
                borderRadius: 10, background: 'var(--blue)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {stepNum}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', flex: 1 }}>{label}</span>

              {/* Move up/down */}
              <button type="button" disabled={i === 0}
                onClick={e => { e.stopPropagation(); moveStep(i, -1); }}
                title="Move up"
                style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--border)' : 'var(--muted)', fontSize: 13, padding: '0 3px' }}>
                ↑
              </button>
              <button type="button" disabled={i === steps.length - 1}
                onClick={e => { e.stopPropagation(); moveStep(i, 1); }}
                title="Move down"
                style={{ background: 'none', border: 'none', cursor: i === steps.length - 1 ? 'default' : 'pointer', color: i === steps.length - 1 ? 'var(--border)' : 'var(--muted)', fontSize: 13, padding: '0 3px' }}>
                ↓
              </button>

              {/* Remove */}
              <button type="button"
                onClick={e => { e.stopPropagation(); removeStep(i); }}
                title="Remove step"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A0A0', fontSize: 16, padding: '0 3px', marginLeft: 2 }}>
                ×
              </button>

              {/* Expand toggle */}
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Step params */}
            {isOpen && (
              <div style={{ padding: '10px 12px' }}>
                <StepForm step={step} onChange={updated => updateStep(i, updated)} availableColumns={availableColumns} />
              </div>
            )}
          </div>
        );
      })}

      <AddStepBar addingType={addingType} setAddingType={setAddingType} onAdd={addStep} />
    </div>
  );
}

function AddStepBar({ addingType, setAddingType, onAdd }: {
  addingType: string;
  setAddingType: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
      <StepTypeSelector value={addingType} onChange={setAddingType} />
      <button type="button" onClick={onAdd} disabled={!addingType}
        style={{
          padding: '5px 14px',
          background: addingType ? 'var(--blue)' : 'var(--border)',
          color: addingType ? '#fff' : 'var(--muted)',
          border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600,
          cursor: addingType ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
        }}>
        + Add step
      </button>
    </div>
  );
}
