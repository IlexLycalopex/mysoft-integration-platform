'use client';

import { BrandingData } from '@/lib/types/branding';
import React, { useEffect, useState } from 'react';

interface TemplatePreviewProps {
  branding: BrandingData;
  title?: string;
}

/**
 * Live preview of branding template
 * Shows how the branding would look in the actual UI
 */
export function TemplatePreview({ branding, title = 'Preview' }: TemplatePreviewProps) {
  const [cssVars, setCssVars] = useState<Record<string, string>>({});

  useEffect(() => {
    // Build CSS variables from branding
    const vars: Record<string, string> = {};
    if (branding.primary_color) vars['--blue'] = branding.primary_color;
    if (branding.accent_color) vars['--accent'] = branding.accent_color;

    setCssVars(vars);
  }, [branding]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      <style>{`
        .template-preview {
          ${Object.entries(cssVars)
            .map(([key, value]) => `${key}: ${value};`)
            .join('\n')}
        }
        .template-preview .header {
          background-color: var(--blue, #0069B4);
        }
        .template-preview .link {
          color: var(--accent, #00A3E0);
        }
      `}</style>

      <div className="template-preview rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        {/* Header */}
        <div className="header flex items-center gap-2 rounded p-3 text-white">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt="Logo"
              className="h-8 w-8 rounded object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="h-8 w-8 rounded bg-white/20" />
          )}
          <span className="font-semibold">{branding.brand_name || 'Mysoft Integration Platform'}</span>
        </div>

        {/* Content Area */}
        <div className="space-y-2 rounded bg-white p-3">
          <div className="text-sm text-gray-700">Dashboard Content</div>
          <button className="link inline-block text-sm font-medium underline">Interactive Link</button>
        </div>

        {/* Footer */}
        <div className="space-y-1 border-t border-gray-200 pt-2 text-xs text-gray-600">
          {branding.support_email && <div>Support: {branding.support_email}</div>}
          {branding.support_url && (
            <div>
              Support Portal:{' '}
              <a href={branding.support_url} className="link font-medium">
                Visit
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Color Palette Display */}
      <div className="grid grid-cols-3 gap-2">
        {branding.primary_color && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600">Primary</div>
            <div
              className="h-12 rounded border border-gray-300"
              style={{ backgroundColor: branding.primary_color }}
              title={branding.primary_color}
            />
          </div>
        )}
        {branding.accent_color && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600">Accent</div>
            <div
              className="h-12 rounded border border-gray-300"
              style={{ backgroundColor: branding.accent_color }}
              title={branding.accent_color}
            />
          </div>
        )}
        {branding.secondary_color && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600">Secondary</div>
            <div
              className="h-12 rounded border border-gray-300"
              style={{ backgroundColor: branding.secondary_color }}
              title={branding.secondary_color}
            />
          </div>
        )}
      </div>

      {/* Favicon Preview */}
      {branding.favicon_url && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600">Favicon</div>
          <img
            src={branding.favicon_url}
            alt="Favicon"
            className="h-6 w-6 rounded object-contain border border-gray-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}
