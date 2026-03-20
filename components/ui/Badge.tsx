import type { UserRole, TenantStatus } from '@/types/database';

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

const STATUS_COLOURS: Record<TenantStatus, { bg: string; color: string; dot: string }> = {
  active:     { bg: '#E6F9EE', color: '#1A7A3F', dot: '#00B140' },
  trial:      { bg: '#E6F5FC', color: '#006B94', dot: '#00A3E0' },
  suspended:  { bg: '#FDE8E6', color: '#9B2B1E', dot: '#D94F3D' },
  offboarded: { bg: '#EEF2F5', color: '#6B8599', dot: '#6B8599' },
};

export function RoleBadge({ role }: { role: UserRole }) {
  const { bg, color } = ROLE_COLOURS[role] ?? { bg: '#EEF2F5', color: '#6B8599' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: bg, color,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function StatusBadge({ status }: { status: TenantStatus }) {
  const { bg, color, dot } = STATUS_COLOURS[status] ?? STATUS_COLOURS.trial;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: bg, color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
