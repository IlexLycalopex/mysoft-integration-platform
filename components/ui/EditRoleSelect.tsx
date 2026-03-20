'use client';

import { useState, useTransition } from 'react';
import { updateUserRole } from '@/lib/actions/users';
import type { UserRole } from '@/types/database';

const TENANT_ROLES: { value: UserRole; label: string }[] = [
  { value: 'tenant_admin', label: 'Admin' },
  { value: 'tenant_operator', label: 'Operator' },
  { value: 'tenant_auditor', label: 'Auditor' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  platform_super_admin: 'Super Admin',
  mysoft_support_admin: 'Support Admin',
  tenant_admin: 'Admin',
  tenant_operator: 'Operator',
  tenant_auditor: 'Auditor',
};

const ROLE_COLOURS: Record<UserRole, { bg: string; color: string }> = {
  platform_super_admin: { bg: '#E6F5FC', color: '#003D5B' },
  mysoft_support_admin: { bg: '#E6F5FC', color: '#006B94' },
  tenant_admin:         { bg: '#EEF2F5', color: '#1A2B38' },
  tenant_operator:      { bg: '#E6F9EE', color: '#1A7A3F' },
  tenant_auditor:       { bg: '#FEF3E6', color: '#9B5A14' },
};

interface Props {
  userId: string;
  currentRole: UserRole;
}

export default function EditRoleSelect({ userId, currentRole }: Props) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<UserRole>(currentRole);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPlatformRole = ['platform_super_admin', 'mysoft_support_admin'].includes(role);
  const { bg, color } = ROLE_COLOURS[role] ?? { bg: '#EEF2F5', color: '#6B8599' };

  function handleChange(newRole: UserRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result.error) {
        setError(result.error);
      } else {
        setRole(newRole);
        setEditing(false);
      }
    });
  }

  if (isPlatformRole) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>
        {ROLE_LABELS[role] ?? role}
      </span>
    );
  }

  if (editing) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <select
          value={role}
          onChange={(e) => handleChange(e.target.value as UserRole)}
          disabled={isPending}
          autoFocus
          style={{ padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--navy)', background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          {TENANT_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, lineHeight: 1, padding: 2 }}
          title="Cancel"
        >×</button>
        {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>
        {ROLE_LABELS[role] ?? role}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit role"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'inline-flex', alignItems: 'center', opacity: 0.6 }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  );
}
