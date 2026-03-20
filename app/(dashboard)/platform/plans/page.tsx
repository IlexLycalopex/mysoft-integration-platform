import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listAllPlans } from '@/lib/actions/plans';
import type { UserRole } from '@/types/database';

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  const isSuperAdmin = profile?.role === 'platform_super_admin';
  const isSupportAdmin = profile?.role === 'mysoft_support_admin';
  if (!isSuperAdmin && !isSupportAdmin) redirect('/platform');

  const plans = await listAllPlans();

  const thStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    padding: '9px 16px',
    textAlign: 'left',
    background: '#F7FAFC',
    borderBottom: '1px solid var(--border)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid #EEF2F5',
    fontSize: 13,
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>Plans</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Subscription plan tiers and limits</p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/platform/plans/new"
            style={{ background: 'var(--blue)', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
          >
            + New Plan
          </Link>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['ID', 'Name', 'Price', 'Jobs/mo', 'Rows/mo', 'Storage (MB)', 'Users', 'Status', 'Actions'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No plans found. {isSuperAdmin && <Link href="/platform/plans/new" style={{ color: 'var(--blue)' }}>Create the first plan</Link>}
                </td>
              </tr>
            ) : plans.map((plan) => (
              <tr key={plan.id}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{plan.id}</td>
                <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--navy)' }}>{plan.name}</td>
                <td style={tdStyle}>
                  {plan.price_gbp_monthly != null ? `£${Number(plan.price_gbp_monthly).toFixed(2)}` : '—'}
                </td>
                <td style={tdStyle}>{plan.max_jobs_per_month?.toLocaleString() ?? <span style={{ color: 'var(--muted)' }}>∞</span>}</td>
                <td style={tdStyle}>{plan.max_rows_per_month?.toLocaleString() ?? <span style={{ color: 'var(--muted)' }}>∞</span>}</td>
                <td style={tdStyle}>{plan.max_storage_mb?.toLocaleString() ?? <span style={{ color: 'var(--muted)' }}>∞</span>}</td>
                <td style={tdStyle}>{plan.max_users?.toLocaleString() ?? <span style={{ color: 'var(--muted)' }}>∞</span>}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 4,
                    color: plan.is_active ? '#1A6B30' : 'var(--muted)',
                    background: plan.is_active ? '#E6F7ED' : '#F7FAFC',
                    border: `1px solid ${plan.is_active ? '#A3D9B1' : 'var(--border)'}`,
                  }}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {isSuperAdmin && (
                    <Link
                      href={`/platform/plans/${plan.id}/edit`}
                      style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Edit
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
