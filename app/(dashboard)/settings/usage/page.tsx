import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUsageForTenant, refreshUsageSnapshot } from '@/lib/actions/usage';
import { getEffectiveTenantId } from '@/lib/tenant-context';
import SettingsNav from '@/components/layout/SettingsNav';
import type { UserRole } from '@/types/database';
import type { UsageSnapshot, PlanRow } from '@/lib/actions/usage';

// ── Progress bar helper ───────────────────────────────────────────────────────

function ProgressBar({ value, max, label }: { value: number; max: number | null; label: string }) {
  const pct = max && max > 0 ? Math.min(100, Math.round((value / max) * 100)) : null;
  const isWarning = pct !== null && pct >= 80 && pct < 100;
  const isOver = pct !== null && pct >= 100;
  const barColor = isOver ? 'var(--error)' : isWarning ? '#f59e0b' : 'var(--blue)';

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {value.toLocaleString()}{max != null ? ` / ${max.toLocaleString()}` : ''}
          {pct !== null && <span style={{ marginLeft: 6, fontWeight: 600, color: barColor }}>{pct}%</span>}
        </span>
      </div>
      <div style={{ height: 8, background: '#E5EFF5', borderRadius: 4, overflow: 'hidden' }}>
        {pct !== null ? (
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
        ) : (
          <div style={{ height: '100%', width: '30%', background: 'var(--blue)', borderRadius: 4, opacity: 0.4 }} />
        )}
      </div>
      {max == null && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Unlimited</div>
      )}
      {isWarning && (
        <div style={{ fontSize: 11, color: '#92620A', marginTop: 4, background: '#FFF8E6', border: '1px solid #F5D98C', borderRadius: 4, padding: '2px 8px', display: 'inline-block' }}>
          Approaching limit
        </div>
      )}
      {isOver && (
        <div style={{ fontSize: 11, color: '#9B2B1E', marginTop: 4, background: '#FDE8E6', border: '1px solid #F5C6C2', borderRadius: 4, padding: '2px 8px', display: 'inline-block' }}>
          Limit reached
        </div>
      )}
    </div>
  );
}

// ── FAQ accordion ─────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: 'What counts as a job?', a: 'Each upload or automated ingestion is one job. Cancelled and failed jobs still count.' },
  { q: 'What counts as a row?', a: 'Each data row successfully posted to Intacct. Failed validation rows do not count.' },
  { q: 'When does my usage reset?', a: 'The 1st of each calendar month.' },
  { q: 'What happens if I exceed my plan limit?', a: 'A warning banner appears on your dashboard. Jobs still submit but your account manager will contact you.' },
  { q: 'How is storage calculated?', a: 'Sum of all uploaded file sizes for the current month.' },
  { q: 'How do I upgrade my plan?', a: 'Contact your account manager or email support.' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function UsagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user!.id)
    .single<{ role: UserRole; tenant_id: string | null }>();

  if (!profile) redirect('/dashboard');

  const isPlatformAdmin = ['platform_super_admin', 'mysoft_support_admin'].includes(profile.role);
  if (isPlatformAdmin) redirect('/platform');

  const { tenantId } = await getEffectiveTenantId(profile.tenant_id);
  if (!tenantId) redirect('/dashboard');

  let usageData = await getUsageForTenant(tenantId);
  if (!usageData.snapshot) {
    await refreshUsageSnapshot(tenantId);
    usageData = await getUsageForTenant(tenantId);
  }

  const snapshot: UsageSnapshot | null = usageData.snapshot;
  const plan: PlanRow | null = usageData.plan;
  const history: UsageSnapshot[] = usageData.history;

  const storageMb = snapshot ? Math.round(snapshot.storage_bytes / (1024 * 1024) * 100) / 100 : 0;
  const maxStorageMb = plan?.max_storage_mb ?? null;

  const panelStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  };
  const panelHeadStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: '#F7FAFC',
  };
  const panelTitleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--navy)',
  };
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
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Tenant configuration and preferences
        </p>
      </div>

      <SettingsNav role={profile.role} />

      {/* Page heading */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>Usage &amp; Plan</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Your workspace usage this billing period</p>
      </div>

      {/* Plan card */}
      <div style={{ ...panelStyle, marginBottom: 20 }}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>Current Plan</span>
        </div>
        <div style={{ padding: 20 }}>
          {plan ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>
                {plan.name}
                {plan.price_gbp_monthly != null && (
                  <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                    £{Number(plan.price_gbp_monthly).toFixed(2)}/mo
                  </span>
                )}
              </div>
              {plan.description && (
                <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 12px' }}>{plan.description}</p>
              )}
              {plan.features.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {plan.features.map((f) => (
                    <span
                      key={f}
                      style={{ fontSize: 11, fontWeight: 600, color: '#1A6B30', background: '#E6F7ED', border: '1px solid #A3D9B1', borderRadius: 4, padding: '2px 8px' }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No plan assigned. Contact your account manager.</p>
          )}
        </div>
      </div>

      {/* Progress bars */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>This Month</span>
        </div>
        <div style={{ padding: 20 }}>
          <ProgressBar
            label="Jobs"
            value={snapshot?.jobs_count ?? 0}
            max={plan?.max_jobs_per_month ?? null}
          />
          <ProgressBar
            label="Rows Processed"
            value={snapshot?.rows_processed ?? 0}
            max={plan?.max_rows_per_month ?? null}
          />
          <ProgressBar
            label="Storage (MB)"
            value={storageMb}
            max={maxStorageMb}
          />
        </div>
      </div>

      {/* Usage history */}
      {history.length > 0 && (
        <div style={{ ...panelStyle, marginTop: 16 }}>
          <div style={panelHeadStyle}>
            <span style={panelTitleStyle}>Usage History</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Month', 'Jobs', 'Rows', 'Storage (MB)'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.year_month}>
                  <td style={tdStyle}>{row.year_month}</td>
                  <td style={tdStyle}>{row.jobs_count.toLocaleString()}</td>
                  <td style={tdStyle}>{row.rows_processed.toLocaleString()}</td>
                  <td style={tdStyle}>{Math.round(row.storage_bytes / (1024 * 1024) * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FAQ */}
      <div style={{ ...panelStyle, marginTop: 16 }}>
        <div style={panelHeadStyle}>
          <span style={panelTitleStyle}>Frequently Asked Questions</span>
        </div>
        <div style={{ padding: '8px 0' }}>
          {FAQ_ITEMS.map(({ q, a }) => (
            <details key={q} style={{ borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
              <summary
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--navy)',
                  padding: '12px 0',
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {q}
                <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 300 }}>+</span>
              </summary>
              <p style={{ fontSize: 13, color: 'var(--muted)', paddingBottom: 12, margin: 0, lineHeight: 1.6 }}>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
