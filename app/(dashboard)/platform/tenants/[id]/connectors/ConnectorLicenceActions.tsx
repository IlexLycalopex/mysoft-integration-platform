'use client';

import { useState, useTransition } from 'react';
import {
  createConnectorLicence,
  updateConnectorLicence,
  removeConnectorLicence,
  toggleConnectorLicence,
} from '@/lib/actions/connector-licences';
import type { ConnectorLicenceRow } from '@/lib/actions/connector-licences';

const LICENCE_TYPES = [
  { value: 'included',      label: 'Included in plan (£0)' },
  { value: 'paid_monthly',  label: 'Paid — monthly' },
  { value: 'paid_annual',   label: 'Paid — annual' },
  { value: 'trial',         label: 'Trial (time-limited)' },
  { value: 'complimentary', label: 'Complimentary (free)' },
];

interface ConnectorRow {
  id: string;
  connector_key: string;
  display_name: string;
  connector_type: string | null;
  is_active: boolean;
}

interface Props {
  mode: 'add' | 'edit';
  tenantId: string;
  licence?: ConnectorLicenceRow;
  connector?: ConnectorRow;
  allConnectors: ConnectorRow[];
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 5,
  background: 'var(--surface)', color: 'var(--navy)',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 4,
};

export default function ConnectorLicenceActions({ mode, tenantId, licence, connector, allConnectors }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [licenceType, setLicenceType] = useState<'included' | 'paid_monthly' | 'paid_annual' | 'trial' | 'complimentary'>(
    mode === 'edit' ? (licence?.licence_type ?? 'paid_monthly') : 'paid_monthly'
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = mode === 'add'
        ? await createConnectorLicence(fd)
        : await updateConnectorLicence(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  function handleToggle() {
    if (!licence) return;
    startTransition(async () => {
      const result = await toggleConnectorLicence(licence.id, tenantId, !licence.is_enabled);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove() {
    if (!licence || !confirm(`Remove ${licence.display_name ?? 'this connector'} licence? Access will be revoked immediately.`)) return;
    startTransition(async () => {
      const result = await removeConnectorLicence(licence.id, tenantId);
      if (result?.error) setError(result.error);
    });
  }

  const btnBase: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, padding: '5px 10px',
    borderRadius: 5, border: '1px solid var(--border)',
    cursor: 'pointer', whiteSpace: 'nowrap', background: 'var(--surface)',
    color: 'var(--muted)',
  };

  return (
    <>
      {/* Trigger buttons */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {mode === 'edit' && (
          <>
            <button
              onClick={handleToggle}
              disabled={isPending}
              style={{ ...btnBase, color: licence?.is_enabled ? '#DC2626' : '#1A6B30' }}
            >
              {licence?.is_enabled ? 'Suspend' : 'Reinstate'}
            </button>
            <button onClick={() => setOpen(true)} style={btnBase}>Edit</button>
            <button
              onClick={handleRemove}
              disabled={isPending}
              style={{ ...btnBase, color: '#DC2626' }}
            >
              Remove
            </button>
          </>
        )}
        {mode === 'add' && (
          <button
            onClick={() => setOpen(true)}
            style={{ ...btnBase, background: 'var(--navy)', color: '#fff', border: 'none' }}
          >
            + Licence
          </button>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 24, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)', margin: '0 0 18px' }}>
              {mode === 'add' ? `Licence ${connector?.display_name}` : `Edit ${licence?.display_name} Licence`}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Hidden fields */}
              <input type="hidden" name="tenant_id" value={tenantId} />
              {mode === 'add' && <input type="hidden" name="connector_id" value={connector?.id} />}
              {mode === 'edit' && (
                <>
                  <input type="hidden" name="licence_id" value={licence?.id} />
                  <input type="hidden" name="is_enabled" value={licence?.is_enabled ? 'true' : 'false'} />
                </>
              )}

              {/* Licence type */}
              <div>
                <label style={labelStyle}>Licence Type</label>
                <select
                  name="licence_type"
                  value={licenceType}
                  onChange={(e) => setLicenceType(e.target.value as 'included' | 'paid_monthly' | 'paid_annual' | 'trial' | 'complimentary')}
                  style={inputStyle}
                  required
                >
                  {LICENCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Price — hide for included/complimentary */}
              {licenceType !== 'included' && licenceType !== 'complimentary' && (
                <div>
                  <label style={labelStyle}>Price (£/month)</label>
                  <input
                    type="number"
                    name="price_gbp_monthly"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 150.00"
                    defaultValue={mode === 'edit' ? (licence?.price_gbp_monthly ?? '') : ''}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Trial end date — only for trial */}
              {licenceType === 'trial' && (
                <div>
                  <label style={labelStyle}>Trial Ends</label>
                  <input
                    type="date"
                    name="trial_ends_at"
                    required
                    defaultValue={mode === 'edit' && licence?.trial_ends_at
                      ? licence.trial_ends_at.slice(0, 10)
                      : ''}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes (internal)</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="e.g. agreed as part of enterprise deal, review at contract renewal"
                  defaultValue={mode === 'edit' ? (licence?.notes ?? '') : ''}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {error && (
                <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 5, padding: '8px 12px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setOpen(false)} style={btnBase}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{ ...btnBase, background: 'var(--navy)', color: '#fff', border: 'none', opacity: isPending ? 0.6 : 1 }}
                >
                  {isPending ? 'Saving…' : mode === 'add' ? 'Grant Licence' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
