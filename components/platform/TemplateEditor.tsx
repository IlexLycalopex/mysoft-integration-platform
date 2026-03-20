'use client';

import { BrandingData, BrandingTemplate } from '@/lib/types/branding';
import { TemplatePreview } from './TemplatePreview';
import { useState } from 'react';

interface TemplateEditorProps {
  template?: BrandingTemplate;
  onSave: (data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data: BrandingData;
    visibility: 'private' | 'shared_with_tenants' | 'platform_published';
    thumbnail_url?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Form editor for creating/editing branding templates
 * Platform admins use this to create reusable branding templates
 */
export function TemplateEditor({ template, onSave, isLoading = false }: TemplateEditorProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || '',
    tags: (template?.tags || []).join(','),
    visibility: (template?.visibility || 'private') as 'private' | 'shared_with_tenants' | 'platform_published',
    thumbnail_url: template?.thumbnail_url || '',

    // Branding data
    brand_name: template?.branding_data?.brand_name || '',
    logo_url: template?.branding_data?.logo_url || '',
    favicon_url: template?.branding_data?.favicon_url || '',
    primary_color: template?.branding_data?.primary_color || '#0069B4',
    accent_color: template?.branding_data?.accent_color || '#00A3E0',
    secondary_color: template?.branding_data?.secondary_color || '',
    support_email: template?.branding_data?.support_email || '',
    support_url: template?.branding_data?.support_url || '',
    support_phone: template?.branding_data?.support_phone || '',
    custom_css: template?.branding_data?.custom_css || '',
    custom_domain: template?.branding_data?.custom_domain || '',
  });

  const [error, setError] = useState<string>();

  const brandingPreview: BrandingData = {
    brand_name: formData.brand_name || null,
    logo_url: formData.logo_url || null,
    favicon_url: formData.favicon_url || null,
    primary_color: formData.primary_color,
    accent_color: formData.accent_color,
    secondary_color: formData.secondary_color || undefined,
    support_email: formData.support_email || null,
    support_url: formData.support_url || null,
    support_phone: formData.support_phone || null,
    custom_css: formData.custom_css || null,
    custom_domain: formData.custom_domain || null,
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await onSave({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category.trim() || undefined,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()) : undefined,
        visibility: formData.visibility,
        thumbnail_url: formData.thumbnail_url || undefined,
        branding_data: brandingPreview,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Metadata */}
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold">Template Metadata</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Tech Startup Blue"
              required
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe this branding template..."
              rows={3}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select category</option>
                <option value="tech">Tech</option>
                <option value="financial">Financial</option>
                <option value="professional">Professional</option>
                <option value="minimal">Minimal</option>
                <option value="creative">Creative</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Visibility</label>
              <select
                value={formData.visibility}
                onChange={(e) => handleInputChange('visibility', e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="private">Private</option>
                <option value="shared_with_tenants">Shared with Tenants</option>
                <option value="platform_published">Platform Published</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => handleInputChange('tags', e.target.value)}
              placeholder="e.g., blue, modern, tech"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Thumbnail URL</label>
            <input
              type="url"
              value={formData.thumbnail_url}
              onChange={(e) => handleInputChange('thumbnail_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Branding Data */}
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold">Branding Data</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">Brand Name</label>
            <input
              type="text"
              value={formData.brand_name}
              onChange={(e) => handleInputChange('brand_name', e.target.value)}
              placeholder="e.g., Acme Corp"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Logo URL</label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => handleInputChange('logo_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Favicon URL</label>
            <input
              type="url"
              value={formData.favicon_url}
              onChange={(e) => handleInputChange('favicon_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Color</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => handleInputChange('primary_color', e.target.value)}
                  className="h-10 w-12 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={formData.primary_color}
                  onChange={(e) => handleInputChange('primary_color', e.target.value)}
                  placeholder="#0069B4"
                  className="flex-1 rounded border border-gray-300 px-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Accent Color</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) => handleInputChange('accent_color', e.target.value)}
                  className="h-10 w-12 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={formData.accent_color}
                  onChange={(e) => handleInputChange('accent_color', e.target.value)}
                  placeholder="#00A3E0"
                  className="flex-1 rounded border border-gray-300 px-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Secondary Color</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="color"
                  value={formData.secondary_color}
                  onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                  className="h-10 w-12 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={formData.secondary_color}
                  onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                  placeholder="#000000"
                  className="flex-1 rounded border border-gray-300 px-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Support Email</label>
              <input
                type="email"
                value={formData.support_email}
                onChange={(e) => handleInputChange('support_email', e.target.value)}
                placeholder="support@example.com"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Support Phone</label>
              <input
                type="tel"
                value={formData.support_phone}
                onChange={(e) => handleInputChange('support_phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Support URL</label>
            <input
              type="url"
              value={formData.support_url}
              onChange={(e) => handleInputChange('support_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Custom Domain</label>
            <input
              type="text"
              value={formData.custom_domain}
              onChange={(e) => handleInputChange('custom_domain', e.target.value)}
              placeholder="integrations.example.com"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Custom CSS</label>
            <textarea
              value={formData.custom_css}
              onChange={(e) => handleInputChange('custom_css', e.target.value)}
              placeholder=".sidebar { color: red; }"
              rows={4}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono text-xs"
            />
            <p className="mt-1 text-xs text-gray-500">Advanced CSS customizations (no scripts)</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : template ? 'Create New Version' : 'Create Template'}
        </button>
      </form>

      {/* Preview */}
      <div className="sticky top-4 h-fit">
        <TemplatePreview branding={brandingPreview} title={`${template ? 'New Version' : 'Template'} Preview`} />
      </div>
    </div>
  );
}
