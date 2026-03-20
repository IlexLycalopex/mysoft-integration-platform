'use client';

import { BrandingTemplate } from '@/lib/types/branding';
import { useState, useEffect } from 'react';
import { listBrandingTemplates } from '@/lib/actions/branding-templates';

interface TemplateSelectorProps {
  allowedTemplateIds?: string[] | null;
  selectedTemplateId?: string;
  onSelect: (templateId: string) => void;
  isLocked: boolean;
}

export function TemplateSelector({ allowedTemplateIds, selectedTemplateId, onSelect, isLocked }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<BrandingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const result = await listBrandingTemplates({ visibility: 'platform_published' });
    if (result.success) {
      setTemplates(result.templates || []);
    }
    setIsLoading(false);
  };

  const availableTemplates = templates.filter((t) =>
    !allowedTemplateIds || allowedTemplateIds.length === 0 || allowedTemplateIds.includes(t.id)
  );

  if (isLocked) {
    const selected = templates.find((t) => t.id === selectedTemplateId);
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium">Template (Locked)</label>
        <div className="rounded border border-gray-300 bg-gray-50 p-3 text-sm">
          {selected ? (
            <div>
              <div className="font-medium">{selected.name}</div>
              <div className="text-xs text-gray-600">v{selected.version}</div>
            </div>
          ) : (
            <span className="text-gray-600">No template assigned</span>
          )}
        </div>
        <p className="text-xs text-gray-600">This tenant is locked to a single template.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Select Template</label>
      {isLoading ? (
        <div className="text-sm text-gray-600">Loading templates...</div>
      ) : (
        <select
          value={selectedTemplateId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">No template</option>
          {availableTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (v{t.version})
            </option>
          ))}
        </select>
      )}
      <p className="text-xs text-gray-600">
        {allowedTemplateIds && allowedTemplateIds.length > 0
          ? 'You can choose from allowed templates.'
          : 'You can select any published template.'}
      </p>
    </div>
  );
}
