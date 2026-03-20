'use client';

import { useActionState, useState } from 'react';
import { saveBranding, resetBranding } from '@/lib/actions/branding';
import type { TenantBranding } from '@/lib/branding';

const DEFAULT_PRIMARY = '#0069B4';
const DEFAULT_ACCENT  = '#00A3E0';

interface BrandingFormProps {
  tenantId: string;
  initial: TenantBranding;
}

type ActionState = { success: boolean; error?: string } | null;

// ── Contrast ratio helpers (client-side for live feedback) ───────────────────

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b].reduce((acc, v, i) => {
    const c = v / 255;
    const lin = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return acc + lin * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1), l2 = relativeLuminance(hex2);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export default function BrandingForm({ tenantId, initial }: BrandingFormProps) {
  const [brandName, setBrandName] = useState(initial.brand_name ?? '');
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? '');
  const [faviconUrl, setFaviconUrl] = useState(initial.favicon_url ?? '');
  const [primaryColor, setPrimaryColor] = useState(initial.primary_color);
  const [accentColor, setAccentColor] = useState(initial.accent_color);
  const [supportEmail, setSupportEmail] = useState(initial.support_email ?? '');
  const [supportUrl, setSupportUrl] = useState(initial.support_url ?? '');
  const [customCss, setCustomCss] = useState(initial.custom_css ?? '');
  const [customDomain, setCustomDomain] = useState(initial.custom_domain ?? '');

  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; error?: string } | null>(null);

  async function handleReset() {
    setResetPending(true);
    setResetResult(null);
    const result = await resetBranding(tenantId);
    setResetPending(false);
    setResetConfirming(false);
    setResetResult(result);
    if (result.success) {
      setBrandName('');
      setLogoUrl('');
      setFaviconUrl('');
      setPrimaryColor(DEFAULT_PRIMARY);
      setAccentColor(DEFAULT_ACCENT);
      setSupportEmail('');
      setSupportUrl('');
      setCustomCss('');
      setCustomDomain('');
      setLogoPreviewError(false);
    }
  }

  const isValidHttpsUrl = (url: string): boolean => {
    try { const p = new URL(url); return p.protocol === 'https:'; } catch { return false; }
  };

  const isValidHex = (color: string) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);

  // Live contrast ratio for primary colour against white
  const primaryContrast = isValidHex(primaryColor) ? contrastRatio(primaryColor, '#FFFFFF') : null;
  const contrastOk = primaryContrast !== null && primaryContrast >= 3.0;
  const contrastWarn = primaryContrast !== null && primaryContrast >= 3.0 && primaryContrast < 4.5;

  async function formAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
    return await saveBranding(tenantId, {
      brand_name: brandName.trim() || null,
      logo_url: logoUrl.trim() || null,
      favicon_url: faviconUrl.trim() || null,
      primary_color: primaryColor,
      accent_color: accentColor,
      support_email: supportEmail.trim() || null,
      support_url: supportUrl.trim() || null,
      custom_css: customCss.trim() || null,
      custom_domain: customDomain.trim() || null,
    });
  }

  const [state, dispatch, isPending] = useActionState<ActionState, FormData>(formAction, null);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--navy)',
    background: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' };
  const fieldStyle: React.CSSProperties = { marginBottom: 18 };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginTop: 4 };

  const effectiveBrandName = brandName.trim() || 'Mysoft Integration Platform';

  return (
    <div>
      {/* Live preview at top */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 10px' }}>
          Live Preview
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Mock header */}
          <div style={{ background: isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoUrl && isValidHttpsUrl(logoUrl) && !logoPreviewError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" style={{ maxHeight: 32, objectFit: 'contain' }} onError={() => setLogoPreviewError(true)} />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            )}
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{effectiveBrandName}</span>
          </div>
          {/* Mock accent strip */}
          <div style={{ height: 3, background: isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT }} />
          {/* Mock content area */}
          <div style={{ padding: '14px 18px', background: 'var(--surface)' }}>
            <div style={{ height: 10, width: 120, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 8, width: 200, background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 8, width: 160, background: 'var(--border)', borderRadius: 4 }} />
          </div>
        </div>
      </div>

      <form action={dispatch}>
        {/* Brand Name */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Brand Name</label>
          <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Mysoft Integration Platform" style={inputStyle} />
          <p style={hintStyle}>Replaces &quot;Mysoft Integration Platform&quot; throughout the UI and in the topbar</p>
        </div>

        {/* Logo URL */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Logo URL</label>
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => { setLogoUrl(e.target.value); setLogoPreviewError(false); }}
            placeholder="https://example.com/logo.png"
            style={inputStyle}
          />
          {logoUrl && isValidHttpsUrl(logoUrl) && !logoPreviewError && (
            <div style={{ marginTop: 8, padding: 8, background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 6, display: 'inline-block' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo preview" style={{ maxHeight: 48, objectFit: 'contain', display: 'block' }} onError={() => setLogoPreviewError(true)} />
            </div>
          )}
          {logoUrl && logoPreviewError && (
            <p style={{ ...hintStyle, color: 'var(--error)' }}>Could not load image from this URL</p>
          )}
          <p style={hintStyle}>Must be an https:// URL. Shown in the topbar and sidebar when set.</p>
        </div>

        {/* Favicon URL */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Favicon URL</label>
          <input type="text" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://example.com/favicon.ico" style={inputStyle} />
          <p style={hintStyle}>Must be an https:// URL. Injected as the browser tab icon for this tenant.</p>
        </div>

        {/* Primary Colour */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Primary Colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff' }}
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#0069B4"
              style={{ ...inputStyle, width: 120 }}
              maxLength={7}
            />
            {/* Live contrast badge */}
            {primaryContrast !== null && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 4,
                background: !contrastOk ? '#FDE8E6' : contrastWarn ? '#FFF8E6' : '#E6F7ED',
                color: !contrastOk ? '#9B2B1E' : contrastWarn ? '#92620A' : '#1A6B30',
                border: `1px solid ${!contrastOk ? '#F5C6C2' : contrastWarn ? '#F5D98C' : '#A3D9B1'}`,
                whiteSpace: 'nowrap',
              }}>
                {primaryContrast.toFixed(1)}:1 {!contrastOk ? '✕ Fail' : contrastWarn ? '⚠ AA bold only' : '✓ Pass'}
              </span>
            )}
          </div>
          {primaryColor && !isValidHex(primaryColor) && (
            <p style={{ ...hintStyle, color: 'var(--error)' }}>Must be a valid hex colour (e.g. #0069B4)</p>
          )}
          {primaryContrast !== null && !contrastOk && (
            <p style={{ ...hintStyle, color: 'var(--error)' }}>
              Contrast {primaryContrast.toFixed(1)}:1 against white is too low. Navigation labels will be hard to read — minimum 3:1 required.
            </p>
          )}
          <p style={hintStyle}>Used as the sidebar and topbar background colour.</p>
        </div>

        {/* Accent Colour */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Accent Colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff' }}
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="#00A3E0"
              style={{ ...inputStyle, width: 120 }}
              maxLength={7}
            />
          </div>
          {accentColor && !isValidHex(accentColor) && (
            <p style={{ ...hintStyle, color: 'var(--error)' }}>Must be a valid hex colour (e.g. #00A3E0)</p>
          )}
          <p style={hintStyle}>Used for active nav highlights, links, and buttons.</p>
        </div>

        {/* Support Email */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Support Email</label>
          <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@yourcompany.com" style={inputStyle} />
        </div>

        {/* Support URL */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Support URL</label>
          <input type="url" value={supportUrl} onChange={(e) => setSupportUrl(e.target.value)} placeholder="https://support.yourcompany.com" style={inputStyle} />
        </div>

        {/* Custom Domain */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Custom Domain</label>
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="integrations.yourcompany.com"
            style={inputStyle}
          />
          <div style={{ marginTop: 8, background: '#F0F7FF', border: '1px solid #A3CFFF', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#0A4F92', lineHeight: 1.6 }}>
            <strong>Setup instructions:</strong> Create a CNAME DNS record pointing{' '}
            <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{customDomain || 'integrations.yourcompany.com'}</code>{' '}
            to your platform URL, then contact Mysoft support to complete domain verification and SSL provisioning.
          </div>
        </div>

        {/* Custom CSS */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Custom CSS</label>
          <textarea
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            rows={10}
            placeholder="/* advanced: injected into every page */"
            style={{ ...inputStyle, fontFamily: 'var(--font-dm-mono, monospace)', resize: 'vertical', lineHeight: 1.6 }}
          />
          <p style={hintStyle}>Advanced: injected into a &lt;style&gt; tag on every page for this tenant. Use with caution.</p>
        </div>

        {/* Sidebar preview */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 10px' }}>
            Sidebar Preview
          </p>
          <div style={{ width: 200, background: isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY, borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
              {effectiveBrandName.length > 20 ? effectiveBrandName.slice(0, 20) + '…' : effectiveBrandName}
            </div>
            {['Dashboard', 'Uploads', 'Job History'].map((item, i) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, color: i === 0 ? (isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT) : 'rgba(255,255,255,0.9)', fontWeight: i === 0 ? 600 : 400, fontSize: 13, marginBottom: 2, background: i === 0 ? 'rgba(255,255,255,0.12)' : 'transparent' }}>
                <div style={{ width: 14, height: 14, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status banner */}
        {state && (
          <div style={{ padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, fontWeight: 500, background: state.success ? '#EDFAF3' : '#FDE8E6', border: `1px solid ${state.success ? '#A8DFBE' : '#F5C6C2'}`, color: state.success ? '#1A6B30' : '#9B2B1E' }}>
            {state.success ? 'Branding saved successfully.' : (state.error ?? 'An error occurred.')}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{ padding: '9px 20px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Saving…' : 'Save Branding'}
          </button>
          {!resetConfirming && (
            <button
              type="button"
              onClick={() => setResetConfirming(true)}
              style={{ padding: '9px 16px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              Reset to defaults
            </button>
          )}
        </div>
      </form>

      {/* Reset confirmation */}
      {resetConfirming && (
        <div style={{ marginTop: 16, padding: '14px 16px', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7A5500', margin: '0 0 10px' }}>
            Remove all branding customisation for this tenant?
          </p>
          <p style={{ fontSize: 12, color: '#7A5500', margin: '0 0 14px' }}>
            All custom colours, logos, and CSS will be deleted. The tenant will revert to Mysoft default branding immediately.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleReset} disabled={resetPending} style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 6, border: 'none', background: resetPending ? 'var(--muted)' : '#92620A', color: '#fff', cursor: resetPending ? 'not-allowed' : 'pointer' }}>
              {resetPending ? 'Resetting…' : 'Confirm Reset'}
            </button>
            <button type="button" onClick={() => setResetConfirming(false)} style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {resetResult && !resetConfirming && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: resetResult.success ? '#E6F7ED' : '#FDE8E6', border: `1px solid ${resetResult.success ? '#A3D9B1' : '#F5C6C2'}`, color: resetResult.success ? '#1A6B30' : '#9B2B1E' }}>
          {resetResult.success ? 'Branding reset to defaults.' : (resetResult.error ?? 'Reset failed.')}
        </div>
      )}
    </div>
  );
}
