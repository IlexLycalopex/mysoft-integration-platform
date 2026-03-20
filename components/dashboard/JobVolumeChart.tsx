'use client';

export interface DayData {
  date: string; // YYYY-MM-DD
  completed: number;
  withErrors: number;
  failed: number;
  pending: number;
}

interface Props {
  days: DayData[];
  height?: number;
}

const VIEW_W = 800;
const VIEW_H = 200;
const LEFT_PAD = 36;
const RIGHT_PAD = 8;
const TOP_PAD = 12;
const BOTTOM_PAD = 28;

const CHART_W = VIEW_W - LEFT_PAD - RIGHT_PAD;
const CHART_H = VIEW_H - TOP_PAD - BOTTOM_PAD;

export default function JobVolumeChart({ days, height = 200 }: Props) {
  const maxVal = Math.max(...days.map((d) => d.completed + d.withErrors + d.failed + d.pending), 0);

  if (maxVal === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
        No jobs in the last 30 days
      </div>
    );
  }

  const roundedMax = Math.ceil(maxVal / 5) * 5 || 5;
  const barCount = days.length;
  const barSlot = CHART_W / barCount;
  const barW = Math.max(barSlot - 2, 2);

  const yLabel = (v: number) => String(v);
  const yPos = (v: number) => TOP_PAD + CHART_H - (v / roundedMax) * CHART_H;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      {/* Y-axis gridlines & labels */}
      {[0, Math.round(roundedMax / 2), roundedMax].map((v) => {
        const y = yPos(v);
        return (
          <g key={v}>
            <line x1={LEFT_PAD} y1={y} x2={VIEW_W - RIGHT_PAD} y2={y} stroke="#E8EAED" strokeWidth={0.8} />
            <text x={LEFT_PAD - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill="#9CA3AF">
              {yLabel(v)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {days.map((d, i) => {
        const x = LEFT_PAD + i * barSlot + (barSlot - barW) / 2;
        const total = d.completed + d.withErrors + d.failed + d.pending;
        if (total === 0) return null;

        const segments: Array<{ value: number; colour: string; label: string }> = [
          { value: d.completed, colour: '#22c55e', label: 'Completed' },
          { value: d.withErrors, colour: '#f59e0b', label: 'Completed w/ errors' },
          { value: d.failed, colour: '#ef4444', label: 'Failed' },
          { value: d.pending, colour: '#94a3b8', label: 'Pending' },
        ];

        let stackY = yPos(total);
        const rects: React.ReactElement[] = [];
        for (const seg of segments) {
          if (seg.value === 0) continue;
          const h = (seg.value / roundedMax) * CHART_H;
          rects.push(
            <rect
              key={seg.label}
              x={x}
              y={stackY}
              width={barW}
              height={h}
              fill={seg.colour}
            />
          );
          stackY += h;
        }

        const dd = d.date.slice(8, 10);
        const mm = d.date.slice(5, 7);
        const tooltipText = `${dd}/${mm}: ${d.completed} ok, ${d.withErrors} warn, ${d.failed} fail`;

        return (
          <g key={d.date}>
            <title>{tooltipText}</title>
            {rects}
          </g>
        );
      })}

      {/* X-axis labels — every 5th day */}
      {days.map((d, i) => {
        if (i % 5 !== 0) return null;
        const x = LEFT_PAD + i * barSlot + barSlot / 2;
        const dd = d.date.slice(8, 10);
        const mm = d.date.slice(5, 7);
        return (
          <text key={d.date} x={x} y={VIEW_H - 6} textAnchor="middle" fontSize={9} fill="#9CA3AF">
            {dd}/{mm}
          </text>
        );
      })}

      {/* Legend */}
      {[
        { colour: '#22c55e', label: 'Completed' },
        { colour: '#f59e0b', label: 'W/ Errors' },
        { colour: '#ef4444', label: 'Failed' },
      ].map((item, i) => (
        <g key={item.label} transform={`translate(${LEFT_PAD + i * 90}, ${TOP_PAD - 2})`}>
          <rect width={8} height={8} fill={item.colour} rx={1} />
          <text x={11} y={7.5} fontSize={8.5} fill="#6B7280">{item.label}</text>
        </g>
      ))}
    </svg>
  );
}
