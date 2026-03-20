'use client';

interface Props {
  days: Array<{ date: string; rate: number }>;
  currentRate: number;
}

const W = 120;
const H = 40;
const PAD = 4;

function rateColour(rate: number): string {
  if (rate < 0.1) return '#22c55e';
  if (rate <= 0.3) return '#f59e0b';
  return '#ef4444';
}

export default function ErrorRateSparkline({ days, currentRate }: Props) {
  const colour = rateColour(currentRate);

  if (currentRate === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', letterSpacing: -1, lineHeight: 1 }}>
          0%
        </div>
        <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>All clean</div>
      </div>
    );
  }

  const maxRate = Math.max(...days.map((d) => d.rate), 0.01);
  const usableDays = days.length > 1 ? days : [...days, { date: '', rate: 0 }];
  const n = usableDays.length;

  const xOf = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const yOf = (r: number) => PAD + (1 - r / maxRate) * (H - PAD * 2);

  const points = usableDays.map((d, i) => `${xOf(i)},${yOf(d.rate)}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: colour, letterSpacing: -1, lineHeight: 1 }}>
        {(currentRate * 100).toFixed(1)}%
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>14-day error rate</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 200, height: H, display: 'block' }}>
        {/* Area fill */}
        <polyline
          points={`${xOf(0)},${H - PAD} ${points} ${xOf(n - 1)},${H - PAD}`}
          fill={`${colour}22`}
          stroke="none"
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={colour}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Dots */}
        {usableDays.map((d, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(d.rate)} r={2} fill={colour}>
            <title>{d.date ? `${d.date}: ${(d.rate * 100).toFixed(1)}%` : ''}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
