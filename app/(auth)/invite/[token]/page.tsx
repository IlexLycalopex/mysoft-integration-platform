import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import AcceptInviteForm from './AcceptInviteForm';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('user_invites')
    .select('email, role, expires_at, accepted_at')
    .eq('token', token)
    .single<{ email: string; role: string; expires_at: string; accepted_at: string | null }>();

  if (!invite) {
    return (
      <div style={cardStyle}>
        <Logo />
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
            Invalid invitation
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            This invitation link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  if (invite.accepted_at) redirect('/login?message=already_accepted');

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div style={cardStyle}>
        <Logo />
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
            Invitation expired
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Please ask your administrator to send a new invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <Logo />
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', margin: '0 0 6px' }}>
          Set your password
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          You&apos;ve been invited as <strong>{invite.email}</strong>. Create a password to activate your account.
        </p>
      </div>
      <AcceptInviteForm token={token} email={invite.email} />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '40px 36px',
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 4px 24px rgba(0,61,91,0.08)',
};

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#003D5B" />
          <path d="M8 22V14l6-4 6 4v8" stroke="#00A3E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 22v-5h6v5" stroke="#00B140" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3 }}>
          Mysoft <span style={{ color: 'var(--blue)' }}>Integrations</span>
        </span>
      </div>
    </div>
  );
}
