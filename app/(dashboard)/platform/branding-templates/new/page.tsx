'use client';

import { TemplateEditor } from '@/components/platform/TemplateEditor';
import { createBrandingTemplate } from '@/lib/actions/branding-templates';
import { BrandingData } from '@/lib/types/branding';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Create new branding template page
 */
export default function NewTemplatesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

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
      // Get current user from Supabase client
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('You must be logged in to create templates');
        return;
      }

      const result = await createBrandingTemplate(data, user.id);

      if (!result.success) {
        setError(result.error || 'Failed to create template');
        return;
      }

      router.push(`/platform/branding-templates/${result.template?.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Create Branding Template</h1>
        <p className="mt-1 text-gray-600">Design a reusable branding template for your platform</p>
      </div>

      {/* Error */}
      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Editor */}
      <div className="rounded-lg border border-gray-200 p-6">
        <TemplateEditor onSave={handleSave} isLoading={isLoading} />
      </div>
    </div>
  );
}
