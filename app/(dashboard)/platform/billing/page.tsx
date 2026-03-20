import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types/database';
import BillingExportButton from './BillingExportButton';

interface ActiveSubRow {
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  plan_price_gbp: number | null;
  effective_price_gbp: number | null;
  discount_pct: number;
  is_free_of_charge: boolean;
  period_start: string;
  period_end: string;
  notes: string | null;
  status: string;
  in_minimum_period: boolean;
  commitment_end_date: string;
}

interface TenantRow {
  id: string;
  name: string;
  is_sandbox: boolean;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatGbp(v: number | null | undefined) {
  if (v == null) return '—';
  return `£${v.toFixed(2)}`;
}

export default async function BillingReportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const [{ data: rawSubs }, { data: rawTenants }] = await Promise.all([
    admin.from('active_subscriptions').select('*'),
    admin.from('tenants').select('id, name, is_sandbox'),
  ]);

  const subs = (rawSubs ?? []) as ActiveSubRow[];
  const tenants = (rawTenants ?? []) as TenantRow[];
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

  // Filter to production tenants with active status
  const activeSubs = subs.filter((s) => {
    const t = tenantMap[s.tenant_id];
    return t && !t.is_sandbox && s.status === 'active';
  });

  // MRR computation
  const totalMrr = activeSubs.reduce((sum, s) => {
    if (s.is_free_of_charge) return sum;
    return sum + (s.effective_price_gbp ?? s.plan_price_gbp ?? 0);
  }, 0);
  const totalArr = totalMrr * 12;

  // Group MRR by plan
  const mrrByPlan = new Map<string, { planName: string; count: number; mrr: number }>();
  for (const s of activeSubs) {
    const existing = mrrByPlan.get(s.plan_id);
    const revenue = s.is_free_of_charge ? 0 : (s.effective_price_gbp ?? s.plan_price_gbp ?? 0);
    if (existing) {
      existing.count++;
      existing.mrr += revenue;
    } else {
      mrrByPlan.set(s.plan_id, { planName: s.plan_name, count: 1, mrr: revenue });
    }
  }

  const planBreakdown = [...mrrByPlan.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.mrr - a.mrr);

  // Rows sorted by effective price desc
  const sortedSubs = [...activeSubs].sort((a, b) => {
    const aPrice = a.is_free_of_charge ? 0 : (a.effective_price_gbp ?? a.plan_price_gbp ?? 0);
    const bPrice = b.is_free_of_charge ? 0 : (b.effective_price_gbp ?? b.plan_price_gbp ?? 0);
    return bPrice - aPrice;
  });

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const enterpriseCount = activeSubs.filter((s) => s.plan_id === 'enterprise').length;
  const freeOfChargeCount = activeSubs.filter((s) => s.is_free_of_charge).length;

  // Export rows
  const exportRows = sortedSubs.map((s) => ({
    tenantName: tenantMap[s.tenant_id]?.name ?? s.tenant_id,
    planName: s.plan_name,
    planId: s.plan_id,
    effectivePrice: s.effective_price_gbp,
    planPrice: s.plan_price_gbp,
    discountPct: s.discount_pct,
    isFreeOfCharge: s.is_free_of_charge,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    notes: s.notes,
  }));

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          <Link href="/platform" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Platform</Link>
          {' › '}
          <span>Billing Report</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px', letterSpacing: -0.3 }}>
            Billing Report
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {monthLabel} — {activeSubs.length} active subscription{activeSubs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <BillingExportButton rows={exportRows} month={yearMonth} />
      </div>

      {/* MRR summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Monthly MRR</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{formatGbp(totalMrr)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Recognised this month</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>ARR Run Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{formatGbp(totalArr)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>MRR × 12</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Enterprise</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{enterpriseCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Custom-priced tenants</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Free of Charge</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{freeOfChargeCount}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Comped accounts</div>
        </div>
      </div>

      {/* MRR by plan */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 14 }}>MRR by Plan</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {planBreakdown.map((p) => (
            <div key={p.id} style={{ minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{p.planName}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{formatGbp(p.mrr)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.count} tenant{p.count !== 1 ? 's' : ''}</div>
              {totalMrr > 0 && (
                <div style={{ height: 4, background: '#EEF2F5', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((p.mrr / totalMrr) * 100)}%`, background: 'var(--blue)', borderRadius: 2 }} />
                </div>
              )}
            </div>
          ))}
          {planBreakdown.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>No active paid subscriptions.</span>
          )}
        </div>
      </div>

      {/* Detail table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Active Subscriptions</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{activeSubs.length} records</span>
        </div>

        {activeSubs.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No active subscriptions found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tenant', 'Plan', 'List Price', 'Discount', 'Effective /mo', 'Period End', 'Committed?', ''].map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSubs.map((s) => {
                const tenant = tenantMap[s.tenant_id];
                const effectivePrice = s.is_free_of_charge ? 0 : (s.effective_price_gbp ?? s.plan_price_gbp ?? 0);
                return (
                  <tr key={s.tenant_id}>
                    <td style={tdStyle}>
                      <Link
                        href={`/platform/tenants/${s.tenant_id}/subscription`}
                        style={{ fontSize: 13, fontWeight: 500, color: 'var(--blue)', textDecoration: 'none' }}
                      >
                        {tenant?.name ?? s.tenant_id.slice(0, 8) + '…'}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 500 }}>{s.plan_name}</span>
                      {s.plan_id === 'enterprise' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6B35A0', background: '#F3F0FF', border: '1px solid #DDD6FE', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>
                          ENT
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {s.plan_price_gbp != null ? formatGbp(s.plan_price_gbp) : 'Custom'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: s.discount_pct > 0 ? '#92620A' : 'var(--muted)' }}>
                        {s.is_free_of_charge ? '100% (comped)' : s.discount_pct > 0 ? `${s.discount_pct}%` : '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: effectivePrice > 0 ? 'var(--navy)' : '#1A6B30' }}>
                        {s.is_free_of_charge ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#EDFAF3', border: '1px solid #A8DFBE', borderRadius: 4, padding: '2px 7px' }}>Free</span>
                        ) : formatGbp(effectivePrice)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(s.period_end)}</span>
                    </td>
                    <td style={tdStyle}>
                      {s.in_minimum_period ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#92620A', background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 7px' }}>
                          Until {formatDate(s.commitment_end_date)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rolling</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        href={`/platform/tenants/${s.tenant_id}/subscription`}
                        style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* MRR footer */}
            <tfoot>
              <tr style={{ background: '#F7FAFC' }}>
                <td colSpan={4} style={{ ...tdStyle, fontWeight: 600, fontSize: 12, color: 'var(--navy)', borderTop: '2px solid var(--border)' }}>
                  Total MRR
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, fontSize: 14, color: 'var(--navy)', borderTop: '2px solid var(--border)' }}>
                  {formatGbp(totalMrr)}
                </td>
                <td colSpan={3} style={{ ...tdStyle, borderTop: '2px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>ARR: {formatGbp(totalArr)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: 'var(--muted)',
  textTransform: 'uppercase', padding: '9px 16px', textAlign: 'left',
  background: '#F7FAFC', borderBottom: '1px solid var(--border)',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13, verticalAlign: 'middle',
};
