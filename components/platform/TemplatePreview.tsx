// components/platform/TemplatePreview.tsx
'use client';

import { BrandingData } from '@/lib/types/branding';

interface TemplatePreviewProps {
  branding: BrandingData;
  compact?: boolean;
}

const DEFAULT_PRIMARY = '#0069B4';
const DEFAULT_ACCENT = '#00A3E0';

function isValidHex(color?: string | null): boolean {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export default function TemplatePreview({ branding, compact = false }: TemplatePreviewProps) {
  const primary = isValidHex(branding.primary_color) ? branding.primary_color! : DEFAULT_PRIMARY;
  const accent = isValidHex(branding.accent_color) ? branding.accent_color! : DEFAULT_ACCENT;
  const brandName = branding.brand_name?.trim() || 'Mysoft Platform';

  const outerSize = compact
    ? { width: '100%', height: 140 }
    : { width: '100%', height: 260 };

  const topbarHeight = compact ? 28 : 42;
  const accentStripHeight = 3;
  const sidebarWidth = compact ? 28 : 44;
  const navDotSize = compact ? 6 : 10;
  const navDots = compact ? 3 : 4;

  return (
    <div style={{ ...outerSize, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      {/* Topbar */}
      <div style={{ background: primary, height: topbarHeight, display: 'flex', alignItems: 'center', padding: compact ? '0 8px' : '0 14px', gap: 8, flexShrink: 0 }}>
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt=""
            style={{ height: compact ? 16 : 24, maxWidth: compact ? 40 : 64, objectFit: 'contain', opacity: 0.95 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: compact ? 16 : 24, height: compact ? 16 : 24, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }} />
        )}
        {!compact && (
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '-0.2px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {brandName.length > 24 ? brandName.slice(0, 24) + '…' : brandName}
          </span>
        )}
        {/* Accent avatar dot */}
        <div style={{ width: compact ? 10 : 16, height: compact ? 10 : 16, borderRadius: '50%', background: accent, marginLeft: 'auto', flexShrink: 0 }} />
      </div>

      {/* Accent strip */}
      <div style={{ height: accentStripHeight, background: accent, flexShrink: 0 }} />

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar strip */}
        <div style={{ width: sidebarWidth, background: primary, opacity: 0.9, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: compact ? 6 : 10, gap: compact ? 5 : 8, flexShrink: 0 }}>
          {Array.from({ length: navDots }).map((_, i) => (
            <div
              key={i}
              style={{
                width: navDotSize,
                height: navDotSize,
                borderRadius: 2,
                background: i === 0 ? accent : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, background: 'var(--bg)', padding: compact ? 6 : 12, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 7, overflow: 'hidden' }}>
          {/* Title placeholder */}
          <div style={{ height: compact ? 6 : 9, width: compact ? 60 : 100, background: 'var(--border)', borderRadius: 3 }} />
          {/* Content blocks */}
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: compact ? 4 : 8, display: 'flex', flexDirection: 'column', gap: compact ? 3 : 5 }}>
            <div style={{ height: compact ? 5 : 8, width: '80%', background: '#E8EEF2', borderRadius: 2 }} />
            <div style={{ height: compact ? 5 : 8, width: '60%', background: '#E8EEF2', borderRadius: 2 }} />
            <div style={{ height: compact ? 5 : 8, width: '70%', background: '#E8EEF2', borderRadius: 2 }} />
            {!compact && (
              <>
                <div style={{ height: 8, width: '50%', background: '#E8EEF2', borderRadius: 2 }} />
                <div style={{ marginTop: 4, height: 20, width: 64, background: accent, borderRadius: 3, opacity: 0.85 }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Colour swatches strip (only when not compact) */}
      {!compact && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '6px 10px', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: primary, border: '1px solid rgba(0,0,0,0.1)' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{primary}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: accent, border: '1px solid rgba(0,0,0,0.1)' }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{accent}</span>
          </div>
          {branding.brand_name && (
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
              {branding.brand_name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
