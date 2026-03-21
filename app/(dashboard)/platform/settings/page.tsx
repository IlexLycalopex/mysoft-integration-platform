import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPlatformSenderCredentials } from '@/lib/actions/platform-credentials';
import { getPlatformSettings } from '@/lib/actions/platform-settings';
import PlatformSenderForm from './PlatformSenderForm';
import SettingsSection from './SettingsSection';
import type { UserRole } from '@/types/database';

// Default values — used when the DB setting hasn't been configured yet
const DEFAULTS: Record<string, string> = {
  'health.dlq_threshold':         '10',
  'health.error_rate_pct':        '50',
  'health.agent_offline_minutes': '15',
  'notifications.support_email':  'support@mysoftx3.com',
  'jobs.default_supdoc_folder':   'Mysoft Imports',
  'users.invite_ttl_days':        '7',
  'sftp.connection_timeout_ms':   '15000',
  'sftp.retry_count':             '1',
};

function str(settings: Record<string, unknown>, key: string): string {
  const v = settings[key];
  if (v === undefined || v === null) return DEFAULTS[key] ?? '';
  return String(v);
}

const TABS = [
  { key: 'credentials',  label: 'Credentials' },
  { key: 'health',       label: 'Health & Monitoring' },
  { key: 'notifications',label: 'Notifications' },
  { key: 'jobs',         label: 'Jobs' },
  { key: 'users',        label: 'Users' },
  { key: 'sftp',         label: 'SFTP' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default async function PlatformSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const { tab: rawTab } = await searchParams;
  const activeTab: TabKey =
    TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : 'credentials';

  const [existing, settings] = await Promise.all([
    getPlatformSenderCredentials(),
    getPlatformSettings(),
  ]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', letterSpacing: -0.3, margin: 0 }}>
          Platform Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 20 }}>
          Platform-wide configuration shared across all tenants. Changes take effect immediately.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(({ key, label }) => {
          const isActive = key === activeTab;
          return (
            <Link
              key={key}
              href={`/platform/settings?tab=${key}`}
              style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--blue)' : 'var(--muted)',
                textDecoration: 'none',
                padding: '8px 16px',
                borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Credentials tab */}
      {activeTab === 'credentials' && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            background: '#F7FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                Sage Intacct — Web Services Sender
              </span>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                Shared ISV developer credentials used for all tenant API calls. Encrypted at rest with AES-256-GCM.
              </p>
            </div>
            {existing && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--green)',
                background: '#E6F7ED', border: '1px solid #A3D9B1',
                borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap',
              }}>
                Configured
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <PlatformSenderForm existing={existing} />
          </div>
        </div>
      )}

      {/* Health & Monitoring tab */}
      {activeTab === 'health' && (
        <SettingsSection
          title="Health Check Thresholds"
          description="Controls when the /api/health endpoint reports degraded or unhealthy status."
          fields={[
            {
              key: 'health.dlq_threshold',
              label: 'Dead-Letter Queue threshold',
              description: 'Jobs stuck in the DLQ above this count trigger a degraded status.',
              type: 'number',
              initialValue: str(settings, 'health.dlq_threshold'),
              suffix: 'jobs',
            },
            {
              key: 'health.error_rate_pct',
              label: 'Error rate threshold',
              description: 'Percentage of failed jobs in the last hour that triggers degraded status.',
              type: 'number',
              initialValue: str(settings, 'health.error_rate_pct'),
              suffix: '%',
            },
            {
              key: 'health.agent_offline_minutes',
              label: 'Agent offline window',
              description: 'Minutes of inactivity before a registered agent is considered offline.',
              type: 'number',
              initialValue: str(settings, 'health.agent_offline_minutes'),
              suffix: 'min',
            },
          ]}
        />
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <SettingsSection
          title="Email & Notifications"
          description="Default email addresses used in system-generated messages."
          fields={[
            {
              key: 'notifications.support_email',
              label: 'Support email address',
              description: 'Shown in invite emails, approval notifications, and error alerts as the contact address.',
              type: 'email',
              initialValue: str(settings, 'notifications.support_email'),
              placeholder: 'support@example.com',
            },
          ]}
        />
      )}

      {/* Jobs tab */}
      {activeTab === 'jobs' && (
        <SettingsSection
          title="Job Processing"
          description="Defaults applied when creating or processing import jobs."
          fields={[
            {
              key: 'jobs.default_supdoc_folder',
              label: 'Default supdoc folder name',
              description: 'The Sage Intacct folder used when pushing supporting documents without a specified folder.',
              type: 'text',
              initialValue: str(settings, 'jobs.default_supdoc_folder'),
              placeholder: 'Mysoft Imports',
            },
          ]}
        />
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <SettingsSection
          title="Users & Invites"
          description="Lifecycle settings for user provisioning."
          fields={[
            {
              key: 'users.invite_ttl_days',
              label: 'Invite link expiry',
              description: 'Number of days before a user invite link becomes invalid.',
              type: 'number',
              initialValue: str(settings, 'users.invite_ttl_days'),
              suffix: 'days',
            },
          ]}
        />
      )}

      {/* SFTP tab */}
      {activeTab === 'sftp' && (
        <SettingsSection
          title="SFTP Watcher Defaults"
          description="Global defaults applied to all SFTP watcher connections. Individual watcher configs override these."
          fields={[
            {
              key: 'sftp.connection_timeout_ms',
              label: 'Connection timeout',
              description: 'How long to wait when establishing an SFTP connection before timing out.',
              type: 'number',
              initialValue: str(settings, 'sftp.connection_timeout_ms'),
              suffix: 'ms',
            },
            {
              key: 'sftp.retry_count',
              label: 'Connection retry attempts',
              description: 'Number of times to retry a failed SFTP connection before marking the poll as failed.',
              type: 'number',
              initialValue: str(settings, 'sftp.retry_count'),
              suffix: 'retries',
            },
          ]}
        />
      )}
    </div>
  );
}
