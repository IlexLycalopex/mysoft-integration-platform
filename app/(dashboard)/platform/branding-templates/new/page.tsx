// app/(dashboard)/platform/branding-templates/new/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TemplateEditor from '@/components/platform/TemplateEditor';
import { createBrandingTemplate } from '@/lib/actions/branding-templates';
import { BrandingData } from '@/lib/types/branding';
import { createClient } from '@/lib/supabase/client';

export default function NewBrandingTemplatePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSave = async (data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data: BrandingData;
    visibility: 'private' | 'shared_with_tenants' | 'platform_published';
    thumbnail_url?: string;
  }) => {
    setIsLoading(true);
    setError(undefined);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('You must be logged in to create templates.');
        return;
      }
      const result = await createBrandingTemplate(data, user.id);
      if (!result.success) {
        setError(result.error ?? 'Failed to create template.');
        return;
      }
      router.push(`/platform/branding-templates/${result.template?.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
        <Link href="/platform/branding-templates" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          Branding Templates
        </Link>
        {' '}&rsaquo;{' '}New Template
      </p>

      {/* Page heading */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.3px', margin: '0 0 4px' }}>
          New Branding Template
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Design a reusable branding template to apply to tenants.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FDE8E6', border: '1px solid #F5C6C2', color: '#9B2B1E', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <TemplateEditor onSave={handleSave} isLoading={isLoading} />
    </div>
  );
}
