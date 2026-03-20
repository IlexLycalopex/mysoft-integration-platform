'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/types/database';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
  exact?: boolean;
}

const S = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const I = { width: 16, height: 16 };

// ── Platform nav groups ──────────────────────────────────────────────────────

const platformGroups: NavItem[][] = [
  [
    {
      href: '/platform',
      label: 'Dashboard',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      exact: true,
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    },
    {
      href: '/platform/billing',
      label: 'Reports',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
  ],
  [
    {
      href: '/platform/tenants',
      label: 'Tenants',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    },
    {
      href: '/platform/users',
      label: 'All Users',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
  ],
  [
    {
      href: '/jobs',
      label: 'Job History',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      href: '/errors',
      label: 'Error Queue',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
    {
      href: '/audit',
      label: 'Audit Log',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    },
    {
      href: '/approvals',
      label: 'Approvals',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><polyline points="20 6 9 17 4 12"/></svg>,
    },
  ],
  [
    {
      href: '/platform/connectors',
      label: 'Connectors',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M8 5.928A6 6 0 0 1 18 10"/><path d="M6 10a6 6 0 0 1 11.144-3"/><circle cx="12" cy="5" r="3"/></svg>,
    },
    {
      href: '/platform/mappings',
      label: 'Templates',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    },
    {
      href: '/platform/branding-templates',
      label: 'Branding',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" fill="none"/><path d="M12 6v2M12 16v2M6 12H4M20 12h-2"/></svg>,
    },
    {
      href: '/platform/plans',
      label: 'Plans',
      roles: ['platform_super_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
    },
    {
      href: '/platform/settings',
      label: 'Settings',
      roles: ['platform_super_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
    },
  ],
  [
    {
      href: '/help',
      label: 'Help',
      roles: ['platform_super_admin', 'mysoft_support_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
  ],
];

// ── Workspace (tenant) nav groups ────────────────────────────────────────────

const workspaceGroups: NavItem[][] = [
  [
    {
      href: '/dashboard',
      label: 'Dashboard',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    },
  ],
  [
    {
      href: '/uploads',
      label: 'Uploads',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    },
    {
      href: '/jobs',
      label: 'Job History',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      href: '/errors',
      label: 'Error Queue',
      roles: ['tenant_admin', 'tenant_operator'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
    {
      href: '/approvals',
      label: 'Approvals',
      roles: ['tenant_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><polyline points="20 6 9 17 4 12"/></svg>,
    },
  ],
  [
    {
      href: '/mappings',
      label: 'Mappings',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    },
    {
      href: '/audit',
      label: 'Audit Log',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    },
  ],
  [
    {
      href: '/settings',
      label: 'Settings',
      roles: ['tenant_admin'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
    },
  ],
  [
    {
      href: '/help',
      label: 'Help',
      roles: ['tenant_admin', 'tenant_operator', 'tenant_auditor'],
      icon: <svg {...I} viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
  ],
];

interface SidebarBranding {
  brand_name: string | null;
  logo_url: string | null;
  primary_color: string;
}

// ── Contrast helpers ─────────────────────────────────────────────────────────

/** WCAG relative luminance for a #rrggbb hex colour */
function relativeLuminance(hex: string): number {
  if (!hex.startsWith('#') || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Returns true when the background is light enough that white text would
 * fail WCAG AA (contrast < 4.5:1 against #FFFFFF).
 */
function needsDarkText(bgHex: string): boolean {
  const L = relativeLuminance(bgHex);
  const contrastVsWhite = 1.05 / (L + 0.05);
  return contrastVsWhite < 4.5;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ role, branding }: { role: UserRole; branding?: SidebarBranding }) {
  const pathname = usePathname();

  const isPlatformAdmin = role === 'platform_super_admin' || role === 'mysoft_support_admin';

  // ── Background colour ──
  // Platform admin → deep dark navy (--platform-nav = #0F1B2D), always.
  // Tenant → custom branding colour if set, else standard mid-blue navy (--navy = #003D5B).
  const sidebarBg = isPlatformAdmin
    ? 'var(--platform-nav)'
    : (branding?.primary_color ?? 'var(--navy)');

  // ── Contrast-aware text colours ──
  // When a tenant has set a light brand colour we flip to dark text so items remain readable.
  // Platform admin always has a very dark bg so we always use the light-text path there.
  const dark = !isPlatformAdmin
    && !!branding?.primary_color
    && needsDarkText(branding.primary_color);

  const textInactive   = dark ? 'rgba(15,27,45,0.70)'  : 'rgba(255,255,255,0.90)';
  const textActive     = dark ? '#003D5B'               : '#FFFFFF';
  const activeBg       = dark ? 'rgba(0,61,91,0.12)'   : 'rgba(255,255,255,0.15)';
  const activeBorder   = dark ? 'rgba(0,61,91,0.20)'   : 'rgba(255,255,255,0.08)';
  const dividerColor   = dark ? 'rgba(0,0,0,0.10)'     : 'rgba(255,255,255,0.10)';
  const brandTextColor = dark ? 'rgba(15,27,45,0.85)'  : 'rgba(255,255,255,0.90)';
  const iconStroke     = dark ? 'rgba(15,27,45,0.55)'  : 'rgba(255,255,255,0.75)';

  const itemStyle = (href: string, exact?: boolean): React.CSSProperties => {
    const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'));
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      borderRadius: 6,
      color: active ? textActive : textInactive,
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      background: active ? activeBg : 'transparent',
      border: `1px solid ${active ? activeBorder : 'transparent'}`,
      cursor: 'pointer',
      textDecoration: 'none',
      marginBottom: 1,
      transition: 'all 0.15s',
    };
  };

  const dividerStyle: React.CSSProperties = {
    border: 'none',
    borderTop: `1px solid ${dividerColor}`,
    margin: '6px 12px',
  };

  const displayBrandName = branding?.brand_name
    ?? (isPlatformAdmin ? 'Mysoft Platform' : 'Integration Platform');
  const logoUrl = branding?.logo_url ?? null;

  const groups = isPlatformAdmin ? platformGroups : workspaceGroups;
  const visibleGroups = groups
    .map((group) => group.filter((item) => item.roles.includes(role)))
    .filter((group) => group.length > 0);

  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: 220,
        background: sidebarBg,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 0',
        overflowY: 'auto',
      }}
    >
      {/* Brand header */}
      <div style={{
        padding: '8px 16px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: `1px solid ${dividerColor}`,
        marginBottom: 8,
      }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={displayBrandName} style={{ maxHeight: 32, objectFit: 'contain' }} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        )}
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: brandTextColor,
          lineHeight: 1.2,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {displayBrandName}
        </span>
      </div>

      {/* Nav groups with dividers */}
      <div style={{ padding: '0 12px' }}>
        {visibleGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {groupIdx > 0 && <hr style={dividerStyle} />}
            {group.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={itemStyle(item.href, item.exact)}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
