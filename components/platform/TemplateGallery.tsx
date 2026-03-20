'use client';

import { BrandingTemplate } from '@/lib/types/branding';
import { TemplatePreview } from './TemplatePreview';
import Link from 'next/link';
import { useState } from 'react';

interface TemplateGalleryProps {
  templates: BrandingTemplate[];
  onTemplateSelect?: (template: BrandingTemplate) => void;
  isLoading?: boolean;
}

/**
 * Gallery view of branding templates
 * Platform admins browse and manage templates
 */
export function TemplateGallery({ templates, onTemplateSelect, isLoading = false }: TemplateGalleryProps) {
  const [selectedId, setSelectedId] = useState<string>();

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  const handleSelect = (template: BrandingTemplate) => {
    setSelectedId(template.id);
    onTemplateSelect?.(template);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading templates...</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <div className="text-gray-600">No templates found</div>
        <Link
          href="/platform/branding-templates/new"
          className="mt-3 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create First Template
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Template List */}
      <div className="col-span-1 space-y-2 rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold">Templates</h3>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelect(template)}
              className={`w-full rounded-lg p-3 text-left transition-colors ${
                selectedId === template.id
                  ? 'bg-blue-50 border border-blue-300'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="font-medium text-sm">{template.name}</div>
              <div className="text-xs text-gray-600">v{template.version}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block rounded bg-gray-200 px-2 py-0.5 text-xs">
                  {template.visibility}
                </span>
                {template.is_archived && (
                  <span className="inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                    Archived
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <Link
          href="/platform/branding-templates/new"
          className="mt-3 block w-full rounded bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Template
        </Link>
      </div>

      {/* Template Details & Preview */}
      <div className="col-span-2 space-y-6">
        {selectedTemplate ? (
          <>
            {/* Header */}
            <div className="space-y-2 rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
                  {selectedTemplate.description && (
                    <p className="text-sm text-gray-600">{selectedTemplate.description}</p>
                  )}
                </div>
                <Link
                  href={`/platform/branding-templates/${selectedTemplate.id}`}
                  className="rounded bg-gray-200 px-3 py-1 text-sm font-medium hover:bg-gray-300"
                >
                  View Details
                </Link>
              </div>

              <div className="flex gap-2 flex-wrap">
                {selectedTemplate.category && (
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">{selectedTemplate.category}</span>
                )}
                {selectedTemplate.tags?.map((tag) => (
                  <span key={tag} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Version</div>
                  <div className="font-semibold">v{selectedTemplate.version}</div>
                </div>
                <div>
                  <div className="text-gray-600">Usage</div>
                  <div className="font-semibold">{selectedTemplate.usage_count} tenants</div>
                </div>
                <div>
                  <div className="text-gray-600">Created</div>
                  <div className="font-semibold text-xs">
                    {new Date(selectedTemplate.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <TemplatePreview branding={selectedTemplate.branding_data} title="Template Preview" />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
            <div className="text-gray-600">Select a template to preview</div>
          </div>
        )}
      </div>
    </div>
  );
}
