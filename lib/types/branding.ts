import { UUID } from 'crypto';

/**
 * Branding data structure — normalized format used across templates, tenants, and customizations
 */
export interface BrandingData {
  // Visual Identity
  brand_name?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;

  // Colors
  primary_color?: string | null;      // #RRGGBB hex format
  accent_color?: string | null;       // #RRGGBB hex format
  secondary_color?: string | null;    // #RRGGBB hex format

  // Support
  support_email?: string | null;
  support_url?: string | null;
  support_phone?: string | null;

  // Customization
  custom_css?: string | null;
  custom_domain?: string | null;

  // Extended styling
  fonts?: {
    heading?: string;                 // font-family for headings
    body?: string;                    // font-family for body text
  };
  color_palette?: {
    neutral?: string[];               // array of gray/neutral hex colors
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };

  // Metadata
  _metadata?: {
    created_at?: string;
    last_modified_by?: string;
  };
}

/**
 * Audit trail entry — shows which level (platform, template, tenant) provided each field
 */
export interface BrandingSource {
  field: keyof BrandingData;
  source: 'platform' | 'template' | 'tenant' | 'legacy';
  value: any;
}

/**
 * Result of branding resolution — includes audit trail and metadata
 */
export interface BrandingResolution {
  branding: BrandingData;              // final merged, validated branding
  sources: BrandingSource[];           // audit trail: which level provided each field
  templateId?: string;                 // UUID of the template used (if any)
  templateVersion?: number;            // version of the template applied
  templateLocked?: boolean;            // whether tenant is locked to this template
  availableTemplates?: string[];       // UUID list of templates tenant can use
  warnings?: string[];                 // warnings during resolution (e.g., "template not found")
}

/**
 * Branding template — immutable, versioned
 */
export interface BrandingTemplate {
  id: string;                          // UUID
  created_by: string;                  // UUID of creator
  tenant_id: string | null;            // NULL for platform templates
  visibility: 'private' | 'shared_with_tenants' | 'platform_published';
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  category?: string | null;
  tags?: string[];
  branding_data: BrandingData;         // immutable snapshot
  version: number;
  parent_template_id?: string | null;  // for template inheritance
  is_archived: boolean;
  usage_count: number;
  created_at: string;                  // ISO 8601
  updated_at: string;                  // ISO 8601
}

/**
 * Tenant branding configuration — extends legacy direct columns with template support
 */
export interface TenantBrandingConfig {
  tenant_id: string;                   // UUID

  // Template configuration (new)
  template_id?: string | null;         // UUID of primary assigned template
  allowed_template_ids?: string[];     // UUIDs of additional templates tenant can choose from
  template_version?: number | null;
  template_locked?: boolean;           // computed: true if allowed_template_ids is empty

  // Customizations on top of template (new)
  custom_branding_data?: BrandingData | null;
  applied_by?: string | null;          // UUID
  applied_at?: string | null;          // ISO 8601

  // Legacy direct columns (backward compatible)
  brand_name?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string;
  accent_color?: string;
  support_email?: string | null;
  support_url?: string | null;
  custom_css?: string | null;
  custom_domain?: string | null;

  // Metadata
  updated_by?: string | null;          // UUID
  updated_at?: string;                 // ISO 8601
}

/**
 * Backward-compatible TenantBranding interface (legacy)
 */
export interface TenantBranding {
  brand_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  accent_color: string;
  support_email: string | null;
  support_url: string | null;
  custom_css: string | null;
  custom_domain: string | null;
}
