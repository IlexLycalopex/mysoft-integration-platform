import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPlatformSenderCredentials } from '@/lib/actions/platform-credentials';
import PlatformSenderForm from './PlatformSenderForm';
import type { UserRole } from '@/types/database';

export default async function PlatformSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user!.id)
    .single<{ role: UserRole }>();

  if (profile?.role !== 'platform_super_admin') {
    redirect('/platform/tenants');
  }

  const existing = await getPlatformSenderCredentials();

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Platform Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Platform-wide configuration shared across all tenants
        </p>
      </div>

      {/* Intacct Sender Credentials */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#F7FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Sage Intacct — Web Services Sender</span>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
              Shared developer credentials used for all tenant API calls. Encrypted at rest with AES-256-GCM.
            </p>
          </div>
          {existing && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--green)',
              background: '#E6F7ED',
              border: '1px solid #A3D9B1',
              borderRadius: 4,
              padding: '3px 8px',
              whiteSpace: 'nowrap',
            }}>
              Configured
            </span>
          )}
        </div>
        <div style={{ padding: 20 }}>
          <PlatformSenderForm existing={existing} />
        </div>
      </div>
    </div>
  );
}
