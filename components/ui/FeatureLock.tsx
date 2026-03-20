export default function FeatureLock({ featureName }: { featureName: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(247,250,252,0.9)',
      borderRadius: 8, zIndex: 10,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8, padding: 24, textAlign: 'center',
      border: '1px solid var(--border)',
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{featureName} not available on your plan</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Contact your account manager to upgrade and unlock this feature.</div>
    </div>
  );
}
