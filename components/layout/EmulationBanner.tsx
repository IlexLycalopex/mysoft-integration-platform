import { stopEmulationAction } from '@/lib/actions/emulation';
import { emulationMinutesLeft } from '@/lib/emulation';

interface Props {
  userName: string;
  tenantName: string;
  tenantId: string;
  startedAt: string;
}

export default function EmulationBanner({ userName, tenantName, tenantId, startedAt }: Props) {
  const minutesLeft = emulationMinutesLeft(startedAt);
  const boundStop = stopEmulationAction.bind(null, tenantId);

  return (
    <div style={{
      background: '#D97706',
      borderBottom: '1px solid #B45309',
      padding: '7px 20px',
      fontSize: 12,
      fontWeight: 600,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexShrink: 0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span>
          Emulating <strong>{userName}</strong> in <strong>{tenantName}</strong>
          <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 8 }}>— {minutesLeft} min remaining</span>
        </span>
      </span>
      <form action={boundStop} style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="submit"
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.4)',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            cursor: 'pointer',
            letterSpacing: 0.3,
          }}
        >
          End session ✕
        </button>
      </form>
    </div>
  );
}
