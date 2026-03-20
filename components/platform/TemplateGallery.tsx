// components/platform/TemplateGallery.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandingTemplate } from '@/lib/types/branding';
import TemplatePreview from './TemplatePreview';

interface TemplateGalleryProps {
  templates: BrandingTemplate[];
  onSelect?: (template: BrandingTemplate) => void;
}

function visibilityBadge(visibility: string): React.CSSProperties & { label: string } {
  if (visibility === 'platform_published') {
    return {
      label: 'Published',
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: '#EDFAF3', border: '1px solid #A8DFBE', color: '#1A6B30',
    };
  }
  if (visibility === 'shared_with_tenants') {
    return {
      label: 'Shared',
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: '#FFF8E6', border: '1px solid #F5D98C', color: '#92620A',
    };
  }
  return {
    label: 'Private',
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
    background: '#F7FAFC', border: '1px solid var(--border)', color: 'var(--muted)',
  };
}

export default function TemplateGallery({ templates, onSelect }: TemplateGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [hoveredId, setHoveredId] = useState<string | undefined>();

  if (templates.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        <div style={{ marginBottom: 8 }}>No templates yet.</div>
        <div>
          <Link href="/platform/branding-templates/new" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
            Create your first template
          </Link>
        </div>
      </div>
    );
  }

  const handleCardClick = (template: BrandingTemplate) => {
    if (onSelect) {
      setSelectedId(template.id);
      onSelect(template);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
      {templates.map((template) => {
        const isSelected = onSelect && selectedId === template.id;
        const isHovered = hoveredId === template.id;
        const badge = visibilityBadge(template.visibility);
        const { label, ...badgeStyle } = badge;

        return (
          <div
            key={template.id}
            onClick={() => handleCardClick(template)}
            onMouseEnter={() => setHoveredId(template.id)}
            onMouseLeave={() => setHoveredId(undefined)}
            style={{
              background: 'var(--surface)',
              border: isSelected ? '2px solid var(--blue)' : '1px solid var(--border)',
              borderRadius: 8,
              padding: 0,
              overflow: 'hidden',
              cursor: onSelect ? 'pointer' : 'default',
              boxShadow: isHovered ? '0 4px 16px rgba(0,61,91,0.10)' : '0 1px 3px rgba(0,61,91,0.04)',
              transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
            }}
          >
            {/* Preview */}
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <TemplatePreview branding={template.branding_data} compact />
            </div>

            {/* Card body */}
            <div style={{ padding: '14px 16px 12px' }}>
              {/* Name + version */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {template.name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: '#F7FAFC', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                  v{template.version}
                </span>
              </div>

              {/* Category pill */}
              {template.category && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#0A4F92', background: '#EEF6FF', border: '1px solid #A3CFFF', borderRadius: 4, padding: '1px 7px' }}>
                    {template.category}
                  </span>
                </div>
              )}

              {/* Description (2-line clamp) */}
              {template.description && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                  {template.description}
                </p>
              )}

              {/* Footer: badge + link */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={badgeStyle as React.CSSProperties}>{label}</span>
                <Link
                  href={`/platform/branding-templates/${template.id}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}
                >
                  View details
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
