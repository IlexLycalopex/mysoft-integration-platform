'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createTenant } from '@/lib/actions/tenants';
import { platformInviteUser } from '@/lib/actions/invites';

const initialState = { error: undefined, success: false };
const initialInviteState = { error: undefined, success: false };

export default function NewTenantForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTenant, initialState);

  const tenantId = state.tenantId ?? '';
  const boundInvite = platformInviteUser.bind(null, tenantId);
  const [inviteState, inviteAction, invitePending] = useActionState(boundInvite, initialInviteState);

  if (inviteState.success) {
    setTimeout(() => router.push(`/platform/tenants/${tenantId}`), 1200);
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>Invite sent!</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Redirecting to tenant…</p>
      </div>
    );
  }

  if (state.success && state.tenantId) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A6B3C' }}>Tenant created successfully</span>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px' }}>Invite first admin user</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Send an invite to set up the first administrator for this tenant. You can skip this and do it later from the tenant page.
        </p>

        <form action={inviteAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>EMAIL ADDRESS <span style={{ color: 'var(--error)' }}>*</span></label>
            <input name="email" type="email" required placeholder="admin@company.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ROLE</label>
            <select name="role" defaultValue="tenant_admin" style={inputStyle}>
              <option value="tenant_admin">Tenant Admin</option>
              <option value="tenant_operator">Tenant Operator</option>
              <option value="tenant_auditor">Tenant Auditor</option>
            </select>
          </div>

          {inviteState.error && (
            <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
              {inviteState.error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button type="submit" disabled={invitePending} style={{ background: invitePending ? '#7dcbee' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: invitePending ? 'not-allowed' : 'pointer' }}>
              {invitePending ? 'Sending…' : 'Send invite'}
            </button>
            <a href={`/platform/tenants/${tenantId}`} style={{ background: 'transparent', color: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Skip for now
            </a>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>TENANT NAME <span style={{ color: 'var(--error)' }}>*</span></label>
        <input name="name" required placeholder="e.g. Acme Corp" style={inputStyle} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>A URL-safe slug will be generated automatically.</p>
      </div>

      <div>
        <label style={labelStyle}>REGION <span style={{ color: 'var(--error)' }}>*</span></label>
        <select name="region" required defaultValue="uk" style={inputStyle}>
          <option value="uk">United Kingdom</option>
          <option value="us">United States</option>
          <option value="eu">European Union</option>
        </select>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Determines data residency for this tenant.</p>
      </div>

      {state.error && (
        <div style={{ background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#9B2B1E' }}>
          {state.error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <Link href="/platform/tenants" style={{ background: 'transparent', color: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} style={{ background: pending ? '#7dcbee' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer' }}>
          {pending ? 'Creating…' : 'Create tenant'}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' };
