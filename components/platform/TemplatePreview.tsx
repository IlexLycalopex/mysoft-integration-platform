// components/platform/TemplatePreview.tsx
'use client';

import { BrandingData } from '@/lib/types/branding';

interface TemplatePreviewProps {
  branding: BrandingData;
  compact?: boolean; // compact=true: flush thumbnail for gallery cards, no own border/label
}

const DEFAULT_PRIMARY = '#003D5B';
const DEFAULT_ACCENT  = '#00A3E0';

function isValidHex(color?: string | null): boolean {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export default function TemplatePreview({ branding, compact = false }: TemplatePreviewProps) {
  const primary   = isValidHex(branding.primary_color) ? branding.primary_color! : DEFAULT_PRIMARY;
  const accent    = isValidHex(branding.accent_color)  ? branding.accent_color!  : DEFAULT_ACCENT;
  const brandName = branding.brand_name?.trim() || 'Mysoft Platform';

  const height       = compact ? 110 : 260;
  const topbarHeight = compact ? 26  : 42;
  const sidebarWidth = compact ? 26  : 44;
  const navDotW      = compact ? 10  : 14;
  const navDotH      = compact ? 4   : 6;
  const navDots      = compact ? 3   : 4;

  const mockup = (
    <div style={{ width: '100%', height, display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none' }}>
      {/* Topbar */}
      <div style={{ background: primary, height: topbarHeight, display: 'flex', alignItems: 'center', padding: compact ? '0 10px' : '0 16px', gap: 8, flexShrink: 0 }}>
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt=""
            style={{ height: compact ? 14 : 22, maxWidth: compact ? 36 : 60, objectFit: 'contain', opacity: 0.95 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: compact ? 14 : 20, height: compact ? 14 : 20, borderRadius: 3, background: 'rgba(255,255,255,0.22)' }} />
        )}
        {!compact && (
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '-0.2px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {brandName.length > 22 ? brandName.slice(0, 22) + '…' : brandName}
          </span>
        )}
        <div style={{ width: compact ? 9 : 14, height: compact ? 9 : 14, borderRadius: '50%', background: accent, marginLeft: 'auto', flexShrink: 0 }} />
      </div>

      {/* Accent strip */}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Sidebar */}
        <div style={{ width: sidebarWidth, background: primary, opacity: 0.88, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: compact ? 7 : 12, gap: compact ? 5 : 8, flexShrink: 0 }}>
          {Array.from({ length: navDots }).map((_, i) => (
            <div key={i} style={{ width: navDotW, height: navDotH, borderRadius: 2, background: i === 0 ? accent : 'rgba(255,255,255,0.28)' }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: compact ? '7px 8px' : '12px', display: 'flex', flexDirection: 'column', gap: compact ? 4 : 7, overflow: 'hidden' }}>
          <div style={{ height: compact ? 5 : 8, width: compact ? 50 : 90, background: 'var(--border)', borderRadius: 3 }} />
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: compact ? 5 : 10, display: 'flex', flexDirection: 'column', gap: compact ? 3 : 6, overflow: 'hidden' }}>
            <div style={{ height: compact ? 4 : 7, width: '80%', background: '#E8EEF2', borderRadius: 2 }} />
            <div style={{ height: compact ? 4 : 7, width: '60%', background: '#E8EEF2', borderRadius: 2 }} />
            <div style={{ height: compact ? 4 : 7, width: '72%', background: '#E8EEF2', borderRadius: 2 }} />
            {!compact && (
              <>
                <div style={{ height: 7, width: '45%', background: '#E8EEF2', borderRadius: 2 }} />
                <div style={{ marginTop: 6, height: 22, width: 68, background: accent, borderRadius: 4, opacity: 0.85 }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Colour swatches - full size only */}
      {!compact && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '7px 12px', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          {[{ c: primary, label: 'Primary' }, { c: accent, label: 'Accent' }].map(({ c, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-dm-mono, monospace)' }}>{c}</span>
            </div>
          ))}
          {branding.brand_name && (
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
              {branding.brand_name}
            </span>
          )}
        </div>
      )}
    </div>
  );

  // Compact: return flush mockup only - card provides the border
  if (compact) return mockup;

  // Full-size: add label + card border
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
        Live Preview
      </p>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {mockup}
      </div>
    </div>
  );
}
