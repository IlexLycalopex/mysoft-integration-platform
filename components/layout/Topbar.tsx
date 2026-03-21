'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TopbarBranding {
  brand_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
}

interface TopbarProps {
  userEmail: string;
  tenantName: string;
  isSandbox: boolean;
  hasSandbox: boolean;
  productionTenantId: string | null;
  sandboxTenantId: string | null;
  planName?: string | null;
  branding?: TopbarBranding;
}

export default function Topbar({
  userEmail,
  tenantName,
  isSandbox,
  hasSandbox,
  productionTenantId,
  sandboxTenantId,
  planName,
  branding,
}: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Inject favicon dynamically if branding provides one
  useEffect(() => {
    if (!branding?.favicon_url) return;
    const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (existing) {
      existing.href = branding.favicon_url;
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = branding.favicon_url;
      document.head.appendChild(link);
    }
  }, [branding?.favicon_url]);

  // Close env dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function handleSwitch(targetId: string) {
    setDropdownOpen(false);
    window.location.href = `/api/set-context?tenant=${targetId}&return=${encodeURIComponent(pathname)}`;
  }

  const initials = userEmail.slice(0, 2).toUpperCase();

  const envBadge = isSandbox
    ? { label: 'SANDBOX', bg: 'rgba(230,180,0,0.18)', color: '#F5D010', border: 'rgba(230,180,0,0.35)' }
    : { label: 'PRODUCTION', bg: 'rgba(0,177,64,0.2)', color: '#6effa0', border: 'rgba(0,177,64,0.3)' };

  // Use white-label branding if provided, otherwise Mysoft defaults
  const isWhiteLabelled = !!(branding?.brand_name || branding?.logo_url);
  const bgColor = branding?.primary_color ?? 'var(--navy)';

  return (
    <header
      style={{
        height: 56,
        background: bgColor,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        flexShrink: 0,
        borderBottom: isSandbox ? '2px solid #E8C84A' : '2px solid var(--blue)',
      }}
    >
      {/* Logo / brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isWhiteLabelled ? (
          <>
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo_url}
                alt={branding.brand_name ?? 'Logo'}
                style={{ maxHeight: 32, maxWidth: 140, objectFit: 'contain' }}
              />
            ) : (
              /* Branded wordmark without logo image */
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: -0.3 }}>
                {branding.brand_name}
              </span>
            )}
            {/* Show brand name alongside logo if both exist */}
            {branding.logo_url && branding.brand_name && (
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: -0.3 }}>
                {branding.brand_name}
              </span>
            )}
          </>
        ) : (
          /* Default Mysoft branding */
          <>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#004d73" />
              <path d="M8 22V14l6-4 6 4v8" stroke="#00A3E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 22v-5h6v5" stroke="#00B140" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: -0.3 }}>
              Mysoft <span style={{ color: 'var(--blue)' }}>Integrations</span>
            </span>
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

      {/* Tenant name */}
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{tenantName}</span>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Plan badge — tenant users only */}
        {planName && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            padding: '3px 8px',
            borderRadius: 4,
            background: 'rgba(0,163,224,0.2)',
            color: '#7DD3FC',
            border: '1px solid rgba(0,163,224,0.3)',
            textTransform: 'uppercase',
          }}>
            {planName}
          </span>
        )}

        {/* Environment badge */}
        {hasSandbox ? (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                padding: '3px 8px',
                borderRadius: 4,
                background: envBadge.bg,
                color: envBadge.color,
                border: `1px solid ${envBadge.border}`,
                cursor: 'pointer',
              }}
            >
              {envBadge.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 1 }}>
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 180,
                zIndex: 100,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: 'var(--muted)', textTransform: 'uppercase', borderBottom: '1px solid #EEF2F5' }}>
                  Switch context
                </div>
                <EnvOption
                  label="Production"
                  description="Live data · affects Intacct"
                  active={!isSandbox}
                  dotColor="#00B140"
                  onClick={() => productionTenantId && handleSwitch(productionTenantId)}
                />
                <EnvOption
                  label="Sandbox"
                  description="Test data · safe to experiment"
                  active={isSandbox}
                  dotColor="#E8C84A"
                  onClick={() => sandboxTenantId && handleSwitch(sandboxTenantId)}
                />
              </div>
            )}
          </div>
        ) : (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            padding: '3px 8px',
            borderRadius: 4,
            background: 'rgba(0,177,64,0.2)',
            color: '#6effa0',
            border: '1px solid rgba(0,177,64,0.3)',
          }}>
            PRODUCTION
          </span>
        )}

        {/* Bell */}
        <div style={{ position: 'relative', cursor: 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>

        {/* Avatar / user menu */}
        <div ref={userMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            title={userEmail}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--blue)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 200,
              zIndex: 100,
              overflow: 'hidden',
            }}>
              {/* User identity */}
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid #EEF2F5',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>
                  Signed in as
                </div>
                <div style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 500, wordBreak: 'break-all' }}>
                  {userEmail}
                </div>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#DC2626',
                  fontWeight: 500,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function EnvOption({
  label,
  description,
  active,
  dotColor,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  dotColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        background: active ? '#F0F7FF' : 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? dotColor : '#CBD5E0', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{description}</div>
      </div>
      {active && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7L5.5 10L11.5 4" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
