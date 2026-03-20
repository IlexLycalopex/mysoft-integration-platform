'use client';

import { TemplateGallery } from '@/components/platform/TemplateGallery';
import { listBrandingTemplates } from '@/lib/actions/branding-templates';
import { BrandingTemplate } from '@/lib/types/branding';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Platform admin template library page
 * Browse, create, and manage branding templates
 */
export default function BrandingTemplatesPage() {
  const [templates, setTemplates] = useState<BrandingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState({
    visibility: 'platform_published' as const,
    category: '',
  });

  useEffect(() => {
    loadTemplates();
  }, [filters]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const result = await listBrandingTemplates({
        visibility: filters.visibility,
        category: filters.category || undefined,
        excludeArchived: true,
      });

      if (result.success) {
        setTemplates(result.templates || []);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Branding Templates</h1>
          <p className="mt-1 text-gray-600">Create and manage reusable branding templates for tenants</p>
        </div>
        <Link
          href="/platform/branding-templates/new"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          + New Template
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Visibility</label>
            <select
              value={filters.visibility}
              onChange={(e) => setFilters((prev) => ({ ...prev, visibility: e.target.value as any }))}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="platform_published">Platform Published</option>
              <option value="shared_with_tenants">Shared with Tenants</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              <option value="tech">Tech</option>
              <option value="financial">Financial</option>
              <option value="professional">Professional</option>
              <option value="minimal">Minimal</option>
              <option value="creative">Creative</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setFilters({ visibility: 'platform_published', category: '' })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Gallery */}
      <TemplateGallery templates={templates} isLoading={isLoading} />
    </div>
  );
}
