'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/types/database';

const tabs = [
  { href: '/settings', label: 'General', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin','tenant_operator','tenant_auditor'] as UserRole[] },
  { href: '/settings/users', label: 'Users', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin'] as UserRole[] },
  { href: '/settings/integrations', label: 'Integrations', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin'] as UserRole[] },
  { href: '/settings/webhooks', label: 'Webhooks', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin'] as UserRole[] },
  { href: '/settings/api-keys', label: 'API Keys', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin'] as UserRole[] },
  { href: '/settings/watchers', label: 'Watchers', roles: ['platform_super_admin','mysoft_support_admin','tenant_admin'] as UserRole[] },
  { href: '/settings/usage', label: 'Usage', roles: ['tenant_admin','tenant_operator','tenant_auditor'] as UserRole[] },
];

export default function SettingsNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const visible = tabs.filter((t) => t.roles.includes(role));

  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      {visible.map((tab) => {
        const active = tab.href === '/settings' ? pathname === '/settings' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--blue)' : 'var(--muted)',
              borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
