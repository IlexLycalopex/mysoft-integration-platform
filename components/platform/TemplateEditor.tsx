// components/platform/TemplateEditor.tsx
'use client';

import { useState } from 'react';
import { BrandingData, BrandingTemplate } from '@/lib/types/branding';
import TemplatePreview from './TemplatePreview';

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

const DEFAULT_PRIMARY = '#0069B4';
const DEFAULT_ACCENT = '#00A3E0';

function isValidHex(color?: string | null): boolean {
  if (!color) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export default function TemplateEditor({ template, onSave, isLoading = false }: TemplateEditorProps) {
  // Details
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [visibility, setVisibility] = useState<'private' | 'shared_with_tenants' | 'platform_published'>(
    template?.visibility ?? 'private'
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(template?.thumbnail_url ?? '');
  const [tagsInput, setTagsInput] = useState((template?.tags ?? []).join(', '));

  // Brand Identity
  const [brandName, setBrandName] = useState(template?.branding_data?.brand_name ?? '');
  const [logoUrl, setLogoUrl] = useState(template?.branding_data?.logo_url ?? '');
  const [faviconUrl, setFaviconUrl] = useState(template?.branding_data?.favicon_url ?? '');

  // Colours
  const [primaryColor, setPrimaryColor] = useState(template?.branding_data?.primary_color ?? DEFAULT_PRIMARY);
  const [accentColor, setAccentColor] = useState(template?.branding_data?.accent_color ?? DEFAULT_ACCENT);

  // Contact
  const [supportEmail, setSupportEmail] = useState(template?.branding_data?.support_email ?? '');
  const [supportUrl, setSupportUrl] = useState(template?.branding_data?.support_url ?? '');

  // Advanced
  const [customCss, setCustomCss] = useState(template?.branding_data?.custom_css ?? '');
  const [customDomain, setCustomDomain] = useState(template?.branding_data?.custom_domain ?? '');

  const [error, setError] = useState<string | undefined>();

  const parsedTags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const brandingPreview: BrandingData = {
    brand_name: brandName.trim() || null,
    logo_url: logoUrl.trim() || null,
    favicon_url: faviconUrl.trim() || null,
    primary_color: isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY,
    accent_color: isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT,
    support_email: supportEmail.trim() || null,
    support_url: supportUrl.trim() || null,
    custom_css: customCss.trim() || null,
    custom_domain: customDomain.trim() || null,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        visibility,
        thumbnail_url: thumbnailUrl.trim() || undefined,
        branding_data: brandingPreview,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--navy)',
    background: '#fff',
    boxSizing: 'border-box' as const,
    outline: 'none',
    fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' };
  const fieldStyle: React.CSSProperties = { marginBottom: 18 };
  const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginTop: 4 };
  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' as const,
    letterSpacing: '0.5px', margin: '0 0 12px',
  };
  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
      {/* Left: Form */}
      <div>
        <form onSubmit={handleSubmit}>
          {/* Error banner */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FDE8E6', border: '1px solid #F5C6C2', color: '#9B2B1E', marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Details */}
          <div style={cardStyle}>
            <p style={sectionHeadingStyle}>Details</p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Template Name <span style={{ color: 'var(--error)' }}>*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tech Startup Blue"
                required
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this template is best suited for…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="professional">Professional</option>
                  <option value="tech">Tech</option>
                  <option value="financial">Financial</option>
                  <option value="minimal">Minimal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  style={inputStyle}
                >
                  <option value="private">Private</option>
                  <option value="shared_with_tenants">Shared with tenants</option>
                  <option value="platform_published">Published</option>
                </select>
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Thumbnail URL</label>
              <input
                type="text"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://example.com/thumbnail.png"
                style={inputStyle}
              />
              <p style={hintStyle}>Optional preview image shown in the template gallery.</p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="blue, modern, minimal"
                style={inputStyle}
              />
              <p style={hintStyle}>Comma-separated tags to help find this template.</p>
              {parsedTags.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {parsedTags.map((tag) => (
                    <span
                      key={tag}
                      style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#F7FAFC', border: '1px solid var(--border)', color: 'var(--muted)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Brand Identity */}
          <div style={cardStyle}>
            <p style={sectionHeadingStyle}>Brand Identity</p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Brand Name</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Acme Corp"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                style={inputStyle}
              />
              <p style={hintStyle}>Must start with https://. Shown in topbar when set.</p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Favicon URL</label>
              <input
                type="text"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                placeholder="https://example.com/favicon.ico"
                style={inputStyle}
              />
              <p style={hintStyle}>Must start with https://. Used as the browser tab icon.</p>
            </div>
          </div>

          {/* Colours */}
          <div style={cardStyle}>
            <p style={sectionHeadingStyle}>Colours</p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Primary Colour</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff', flexShrink: 0 }}
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#0069B4"
                  maxLength={7}
                  style={{ ...inputStyle, width: 110 }}
                />
              </div>
              {primaryColor && !isValidHex(primaryColor) && (
                <p style={{ ...hintStyle, color: 'var(--error)' }}>Must be a valid hex colour (e.g. #0069B4)</p>
              )}
              <p style={hintStyle}>Used as the sidebar and topbar background.</p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Accent Colour</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={isValidHex(accentColor) ? accentColor : DEFAULT_ACCENT}
                  onChange={(e) => setAccentColor(e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff', flexShrink: 0 }}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#00A3E0"
                  maxLength={7}
                  style={{ ...inputStyle, width: 110 }}
                />
              </div>
              {accentColor && !isValidHex(accentColor) && (
                <p style={{ ...hintStyle, color: 'var(--error)' }}>Must be a valid hex colour (e.g. #00A3E0)</p>
              )}
              <p style={hintStyle}>Used for active states, links, and highlights.</p>
            </div>
          </div>

          {/* Contact */}
          <div style={cardStyle}>
            <p style={sectionHeadingStyle}>Contact</p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Support Email</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@yourcompany.com"
                style={inputStyle}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Support URL</label>
              <input
                type="url"
                value={supportUrl}
                onChange={(e) => setSupportUrl(e.target.value)}
                placeholder="https://support.yourcompany.com"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Advanced */}
          <div style={cardStyle}>
            <p style={sectionHeadingStyle}>Advanced</p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Custom Domain</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="integrations.yourcompany.com"
                style={inputStyle}
              />
              <p style={hintStyle}>Hostname only — no protocol or path.</p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Custom CSS</label>
              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                rows={6}
                placeholder="/* injected into every page for tenants using this template */"
                style={{ ...inputStyle, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, resize: 'vertical', lineHeight: 1.6 }}
              />
              <p style={hintStyle}>Advanced: injected into a &lt;style&gt; tag. No scripts allowed.</p>
            </div>
          </div>

          {/* Save */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px 18px',
              background: isLoading ? 'var(--muted)' : 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Saving…' : template ? 'Create New Version' : 'Create Template'}
          </button>
        </form>
      </div>

      {/* Right: Live preview (sticky) */}
      <div style={{ position: 'sticky', top: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>
          Live Preview
        </p>
        <TemplatePreview branding={brandingPreview} compact={false} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
          Updates as you type
        </p>
      </div>
    </div>
  );
}
