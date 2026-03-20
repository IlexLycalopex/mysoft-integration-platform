// app/(dashboard)/platform/branding-templates/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TemplateGallery from '@/components/platform/TemplateGallery';
import { listBrandingTemplates } from '@/lib/actions/branding-templates';
import { BrandingTemplate } from '@/lib/types/branding';

type VisibilityFilter = 'all' | 'platform_published' | 'private' | 'shared_with_tenants';

const FILTER_TABS: { label: string; value: VisibilityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'platform_published' },
  { label: 'Private', value: 'private' },
  { label: 'Shared', value: 'shared_with_tenants' },
];

export default function BrandingTemplatesPage() {
  const [templates, setTemplates] = useState<BrandingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibilityFilter]);

  async function loadTemplates() {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await listBrandingTemplates({
        visibility: visibilityFilter !== 'all' ? (visibilityFilter as Exclude<VisibilityFilter, 'all'>) : undefined,
        excludeArchived: true,
      });
      if (result.success) {
        setTemplates(result.templates ?? []);
      } else {
        setError(result.error ?? 'Failed to load templates.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }

  const tabBase: React.CSSProperties = {
    padding: '8px 0',
    fontSize: 13,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginRight: 24,
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Platform</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.3px', margin: 0 }}>
            Branding Templates
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            Create and manage reusable branding templates for tenants.
          </p>
        </div>
        <Link
          href="/platform/branding-templates/new"
          style={{ padding: '8px 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }}
        >
          New Template
        </Link>
      </div>

      {/* Filter tab bar */}
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ display: 'flex' }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setVisibilityFilter(tab.value)}
              style={{
                ...tabBase,
                borderBottom: visibilityFilter === tab.value ? '2px solid var(--blue)' : '2px solid transparent',
                color: visibilityFilter === tab.value ? 'var(--blue)' : 'var(--muted)',
                fontWeight: visibilityFilter === tab.value ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FDE8E6', border: '1px solid #F5C6C2', color: '#9B2B1E', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <TemplateGallery templates={templates} />
      )}
    </div>
  );
}
