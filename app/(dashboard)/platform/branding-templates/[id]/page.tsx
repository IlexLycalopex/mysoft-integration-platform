// app/(dashboard)/platform/branding-templates/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import TemplatePreview from '@/components/platform/TemplatePreview';
import TemplateEditor from '@/components/platform/TemplateEditor';
import {
  getBrandingTemplate,
  getTemplateUsageStats,
  createTemplateVersion,
  publishBrandingTemplate,
  archiveBrandingTemplate,
} from '@/lib/actions/branding-templates';
import { BrandingData, BrandingTemplate } from '@/lib/types/branding';
import { createClient } from '@/lib/supabase/client';

type Tab = 'preview' | 'version' | 'usage' | 'settings';

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'preview', label: 'Preview' },
  { key: 'version', label: 'New Version' },
  { key: 'usage', label: 'Usage' },
  { key: 'settings', label: 'Settings' },
];

function visibilityBadgeStyle(visibility: string): React.CSSProperties {
  if (visibility === 'platform_published') {
    return { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#EDFAF3', border: '1px solid #A8DFBE', color: '#1A6B30' };
  }
  if (visibility === 'shared_with_tenants') {
    return { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#FFF8E6', border: '1px solid #F5D98C', color: '#92620A' };
  }
  return { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#F7FAFC', border: '1px solid var(--border)', color: 'var(--muted)' };
}

function visibilityLabel(v: string) {
  if (v === 'platform_published') return 'Published';
  if (v === 'shared_with_tenants') return 'Shared';
  return 'Private';
}

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<BrandingTemplate | undefined>();
  const [usage, setUsage] = useState<{ usage_count: number; tenants: Array<{ tenant_id: string; tenant_name: string }> } | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isVersionSaving, setIsVersionSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [tab, setTab] = useState<Tab>('preview');
  const [userId, setUserId] = useState<string | undefined>();
  const [archiveConfirming, setArchiveConfirming] = useState(false);

  // Load user
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    init();
  }, []);

  // Load template + usage once userId is known
  useEffect(() => {
    if (!userId) return;
    loadTemplate();
    loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, userId]);

  async function loadTemplate() {
    setIsLoading(true);
    const result = await getBrandingTemplate(params.id, userId);
    if (result.success && result.template) {
      setTemplate(result.template);
    } else {
      setError(result.error ?? 'Failed to load template.');
    }
    setIsLoading(false);
  }

  async function loadUsage() {
    const result = await getTemplateUsageStats(params.id);
    if (result.success && result.stats) {
      setUsage(result.stats);
    }
  }

  async function handleCreateVersion(data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data: BrandingData;
    visibility: 'private' | 'shared_with_tenants' | 'platform_published';
    thumbnail_url?: string;
  }) {
    setIsVersionSaving(true);
    setError(undefined);
    const result = await createTemplateVersion(params.id, data, userId ?? '');
    setIsVersionSaving(false);
    if (result.success && result.template) {
      router.push(`/platform/branding-templates/${result.template.id}`);
      router.refresh();
    } else {
      setError(result.error ?? 'Failed to create version.');
    }
  }

  async function handlePublish() {
    setError(undefined);
    const result = await publishBrandingTemplate(params.id, userId ?? '');
    if (result.success) {
      await loadTemplate();
    } else {
      setError(result.error ?? 'Failed to publish template.');
    }
  }

  async function handleArchive() {
    setError(undefined);
    const result = await archiveBrandingTemplate(params.id, userId ?? '');
    if (result.success) {
      router.push('/platform/branding-templates');
    } else {
      setError(result.error ?? 'Failed to archive template.');
      setArchiveConfirming(false);
    }
  }

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.4px', padding: '9px 16px', background: '#F7FAFC',
    borderBottom: '1px solid var(--border)', textAlign: 'left',
  };
  const tdStyle: React.CSSProperties = {
    padding: '11px 16px', borderBottom: '1px solid #EEF2F5', fontSize: 13,
    color: 'var(--text)', verticalAlign: 'middle',
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>;
  }

  if (!template) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Template not found.{' '}
        <Link href="/platform/branding-templates" style={{ color: 'var(--blue)' }}>Back to templates</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
        <Link href="/platform/branding-templates" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Branding Templates
        </Link>
        {' '}&rsaquo;{' '}{template.name}
      </p>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.3px', margin: 0 }}>
              {template.name}
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>
              v{template.version}
            </span>
            <span style={visibilityBadgeStyle(template.visibility)}>
              {visibilityLabel(template.visibility)}
            </span>
            {template.is_archived && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#F7FAFC', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                Archived
              </span>
            )}
          </div>
          {template.description && (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>{template.description}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {template.visibility !== 'platform_published' && !template.is_archived && (
            <button
              onClick={handlePublish}
              style={{ padding: '8px 16px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Publish
            </button>
          )}
          {!template.is_archived && !archiveConfirming && (
            <button
              onClick={() => setArchiveConfirming(true)}
              style={{ padding: '8px 14px', background: 'transparent', color: '#9B2B1E', border: '1px solid #F5C6C2', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Archive
            </button>
          )}
          {archiveConfirming && (
            <>
              <button
                onClick={handleArchive}
                style={{ padding: '8px 14px', background: '#9B2B1E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm Archive
              </button>
              <button
                onClick={() => setArchiveConfirming(false)}
                style={{ padding: '8px 14px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FDE8E6', border: '1px solid #F5C6C2', color: '#9B2B1E', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ display: 'flex' }}>
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 0',
                fontSize: 13,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginRight: 24,
                borderBottom: tab === key ? '2px solid var(--blue)' : '2px solid transparent',
                color: tab === key ? 'var(--blue)' : 'var(--muted)',
                fontWeight: tab === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'preview' && (
        <div style={{ maxWidth: 700 }}>
          <TemplatePreview branding={template.branding_data} compact={false} />
        </div>
      )}

      {tab === 'version' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>
            Create New Version — inherits from v{template.version}
          </p>
          <TemplateEditor template={template} onSave={handleCreateVersion} isLoading={isVersionSaving} />
        </div>
      )}

      {tab === 'usage' && (
        <div>
          {/* Stats card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 20, display: 'inline-block', minWidth: 200 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
              Active Tenants
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--navy)', margin: 0, lineHeight: 1 }}>
              {usage?.usage_count ?? 0}
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>tenants using this template</p>
          </div>

          {/* Tenants table */}
          {usage && usage.tenants.length > 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tenant</th>
                    <th style={thStyle}>Tenant ID</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.tenants.map((t) => (
                    <tr key={t.tenant_id}>
                      <td style={tdStyle}>{t.tenant_name}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{t.tenant_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No tenants are currently using this template.
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Name</p>
              <p style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 500, margin: 0 }}>{template.name}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Visibility</p>
              <span style={visibilityBadgeStyle(template.visibility)}>{visibilityLabel(template.visibility)}</span>
            </div>
            {template.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Description</p>
                <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>{template.description}</p>
              </div>
            )}
            {template.category && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Category</p>
                <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, textTransform: 'capitalize' }}>{template.category}</p>
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Version</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>v{template.version}</p>
            </div>
          </div>

          {template.tags && template.tags.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Tags</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {template.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#F7FAFC', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Created</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{new Date(template.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Updated</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{new Date(template.updated_at).toLocaleDateString()}</p>
            </div>
            {template.parent_template_id && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Parent Template</p>
                <Link href={`/platform/branding-templates/${template.parent_template_id}`} style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
                  View parent
                </Link>
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Status</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{template.is_archived ? 'Archived' : 'Active'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
