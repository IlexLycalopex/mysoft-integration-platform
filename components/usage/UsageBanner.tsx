'use client';

interface UsageBannerProps {
  usage: {
    jobs_count: number;
    rows_processed: number;
  };
  plan: {
    max_jobs_per_month: number | null;
    max_rows_per_month: number | null;
  };
  planName: string;
}

export default function UsageBanner({ usage, plan, planName }: UsageBannerProps) {
  // If both limits are null (unlimited plan) — render nothing
  if (plan.max_jobs_per_month == null && plan.max_rows_per_month == null) {
    return null;
  }

  let severity: 'over' | 'approaching' | 'none' = 'none';
  const messages: string[] = [];

  function check(used: number, max: number | null, label: string, unit: string) {
    if (!max) return;
    const ratio = used / max;
    if (ratio > 1) {
      if (severity !== 'over') severity = 'over';
      messages.push(`${used.toLocaleString()} of ${max.toLocaleString()} ${unit} used this month`);
    } else if (ratio > 0.8) {
      if (severity === 'none') severity = 'approaching';
      messages.push(`${used.toLocaleString()} of ${max.toLocaleString()} ${label.toLowerCase()} used this month`);
    }
  }

  check(usage.jobs_count, plan.max_jobs_per_month, 'jobs', 'jobs');
  check(usage.rows_processed, plan.max_rows_per_month, 'rows', 'rows');

  if (severity === 'none') return null;

  const isOver = severity === 'over';

  const bannerStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: 6,
    border: `1px solid ${isOver ? '#F5C6C2' : '#F5D98C'}`,
    background: isOver ? '#FDE8E6' : '#FFF8E6',
    color: isOver ? '#9B2B1E' : '#7A5500',
    fontSize: 13,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  };

  const iconStyle: React.CSSProperties = {
    flexShrink: 0,
    fontWeight: 700,
    fontSize: 15,
    marginTop: 1,
  };

  const mainMessage = isOver
    ? `You have exceeded your ${planName} plan limit.`
    : `You are approaching your ${planName} plan limit.`;

  return (
    <div style={bannerStyle}>
      <span style={iconStyle}>{isOver ? '!' : '⚠'}</span>
      <div>
        <span style={{ fontWeight: 600 }}>{mainMessage}</span>{' '}
        {messages.map((msg, i) => (
          <span key={i}>{msg}{i < messages.length - 1 ? '; ' : '.'}{' '}</span>
        ))}
        <span>
          Contact{' '}
          <a href="mailto:support@mysoftx3.com" style={{ color: 'inherit', fontWeight: 600 }}>
            support
          </a>{' '}
          to upgrade.
        </span>
      </div>
    </div>
  );
}
