'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
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
  const [discountPct, setDiscountPct] = useState<number>(
    mode === 'edit' ? (licence?.discount_pct ?? 0) : 0
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

  // Price shown for paid types — compute effective price preview
  const showPriceField = licenceType !== 'included' && licenceType !== 'complimentary';
  const currentListPrice = mode === 'edit' ? (licence?.price_gbp_monthly ?? null) : null;

  const modal = open ? (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 10, padding: 24,
        width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        position: 'relative',
      }}>
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
              onChange={(e) => setLicenceType(e.target.value as typeof licenceType)}
              style={inputStyle}
              required
            >
              {LICENCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Price & discount — hide for included/complimentary */}
          {showPriceField && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>List Price (£/month)</label>
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
                <div>
                  <label style={labelStyle}>Discount %</label>
                  <input
                    type="number"
                    name="discount_pct"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </div>
              </div>
              {/* Effective price hint */}
              {discountPct > 0 && (
                <div style={{
                  fontSize: 12, color: '#1A6B30', background: '#E6F7ED',
                  border: '1px solid #A3D9B1', borderRadius: 5, padding: '7px 12px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {discountPct >= 100 ? (
                    <span>✓ 100% discount — connector will be <strong>free of charge</strong></span>
                  ) : (
                    <span>
                      {discountPct}% discount applied —{' '}
                      {(() => {
                        const fd = document.querySelector('form input[name="price_gbp_monthly"]') as HTMLInputElement | null;
                        const price = parseFloat(fd?.value ?? '0') || 0;
                        const eff = price * (1 - discountPct / 100);
                        return price > 0
                          ? <strong>effective price £{eff.toFixed(2)}/mo</strong>
                          : <span>enter a list price above to see effective cost</span>;
                      })()}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {/* Hidden discount_pct for non-paid types */}
          {!showPriceField && <input type="hidden" name="discount_pct" value="0" />}

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
  ) : null;

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

      {/* Modal rendered via portal to escape stacking-context clipping */}
      {typeof document !== 'undefined' && modal
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
