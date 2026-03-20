import { createAdminClient } from '@/lib/supabase/admin';
import {
  TenantBranding,
  BrandingData,
  BrandingResolution,
  BrandingSource,
  BrandingTemplate,
  TenantBrandingConfig,
} from '@/lib/types/branding';

export type { TenantBranding, BrandingData, BrandingResolution, BrandingSource, BrandingTemplate, TenantBrandingConfig };

export const defaultBranding: TenantBranding = {
  brand_name: null,
  logo_url: null,
  favicon_url: null,
  primary_color: '#0069B4',
  accent_color: '#00A3E0',
  support_email: 'support@mysoftx3.com',
  support_url: null,
  custom_css: null,
  custom_domain: null,
};

export const platformDefaults: BrandingData = {
  brand_name: null,
  logo_url: null,
  favicon_url: null,
  primary_color: '#0069B4',
  accent_color: '#00A3E0',
  support_email: 'support@mysoftx3.com',
  support_url: null,
  custom_css: null,
  custom_domain: null,
};

/**
 * Fetches branding for a tenant. Falls back to defaultBranding if none set.
 * LEGACY: Use resolveBranding() for new code.
 * Uses admin client — safe to call from server components and API routes.
 */
export async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenant_branding')
    .select('brand_name, logo_url, favicon_url, primary_color, accent_color, support_email, support_url, custom_css, custom_domain')
    .eq('tenant_id', tenantId)
    .maybeSingle<{
      brand_name: string | null;
      logo_url: string | null;
      favicon_url: string | null;
      primary_color: string | null;
      accent_color: string | null;
      support_email: string | null;
      support_url: string | null;
      custom_css: string | null;
      custom_domain: string | null;
    }>();

  if (!data) return defaultBranding;

  return {
    brand_name: data.brand_name ?? null,
    logo_url: data.logo_url ?? null,
    favicon_url: data.favicon_url ?? null,
    primary_color: data.primary_color ?? defaultBranding.primary_color,
    accent_color: data.accent_color ?? defaultBranding.accent_color,
    support_email: data.support_email ?? defaultBranding.support_email,
    support_url: data.support_url ?? null,
    custom_css: data.custom_css ?? null,
    custom_domain: data.custom_domain ?? null,
  };
}

/**
 * Resolves branding for a tenant by merging: platform defaults → template → tenant customizations
 *
 * Resolution logic:
 * 1. Start with platform defaults
 * 2. If tenant has template_id, fetch template and merge template.branding_data
 * 3. If tenant has custom_branding_data, merge customizations on top
 * 4. If no template_id, use legacy direct columns as fallback
 * 5. Validate all fields (colors, URLs, CSS)
 * 6. Return fully resolved branding with audit trail
 *
 * Uses admin client — safe to call from server components and API routes.
 */
export async function resolveBranding(tenantId: string): Promise<BrandingResolution> {
  const admin = createAdminClient();
  const sources: BrandingSource[] = [];
  const warnings: string[] = [];

  // Start with platform defaults
  let merged: BrandingData = { ...platformDefaults };
  sources.push({
    field: 'primary_color' as const,
    source: 'platform',
    value: platformDefaults.primary_color,
  });
  sources.push({
    field: 'accent_color' as const,
    source: 'platform',
    value: platformDefaults.accent_color,
  });
  sources.push({
    field: 'support_email' as const,
    source: 'platform',
    value: platformDefaults.support_email,
  });

  // Fetch tenant branding configuration
  const { data: tenantBrandingConfig } = await admin
    .from('tenant_branding')
    .select(
      `
      template_id,
      allowed_template_ids,
      template_version,
      custom_branding_data,
      brand_name,
      logo_url,
      favicon_url,
      primary_color,
      accent_color,
      support_email,
      support_url,
      custom_css,
      custom_domain
      `
    )
    .eq('tenant_id', tenantId)
    .maybeSingle<TenantBrandingConfig>();

  if (!tenantBrandingConfig) {
    // No tenant branding config, return platform defaults
    return {
      branding: merged,
      sources,
      warnings: tenantBrandingConfig ? [] : ['No tenant branding configuration found, using platform defaults'],
    };
  }

  let templateId: string | undefined;
  let templateVersion: number | undefined;
  let templateLocked = true;

  // If tenant has a template assigned, fetch and merge it
  if (tenantBrandingConfig.template_id) {
    templateId = tenantBrandingConfig.template_id;
    templateVersion = tenantBrandingConfig.template_version;
    templateLocked = !tenantBrandingConfig.allowed_template_ids || tenantBrandingConfig.allowed_template_ids.length === 0;

    const { data: template, error: templateError } = await admin
      .from('branding_templates')
      .select('branding_data, version')
      .eq('id', tenantBrandingConfig.template_id)
      .maybeSingle<{ branding_data: BrandingData; version: number }>();

    if (templateError) {
      warnings.push(`Failed to fetch template: ${templateError.message}`);
    } else if (template) {
      // Merge template branding data
      merged = mergeObjects(merged, template.branding_data, 'template', sources);
    } else {
      warnings.push(`Template ${tenantBrandingConfig.template_id} not found`);
    }
  }

  // If tenant has custom branding data (overrides on top of template), merge it
  if (tenantBrandingConfig.custom_branding_data) {
    merged = mergeObjects(merged, tenantBrandingConfig.custom_branding_data, 'tenant', sources);
  } else if (!tenantBrandingConfig.template_id) {
    // No template, use legacy direct columns as fallback (backward compatible)
    const legacyBranding: BrandingData = {};
    if (tenantBrandingConfig.brand_name !== undefined) legacyBranding.brand_name = tenantBrandingConfig.brand_name;
    if (tenantBrandingConfig.logo_url !== undefined) legacyBranding.logo_url = tenantBrandingConfig.logo_url;
    if (tenantBrandingConfig.favicon_url !== undefined) legacyBranding.favicon_url = tenantBrandingConfig.favicon_url;
    if (tenantBrandingConfig.primary_color !== undefined) legacyBranding.primary_color = tenantBrandingConfig.primary_color;
    if (tenantBrandingConfig.accent_color !== undefined) legacyBranding.accent_color = tenantBrandingConfig.accent_color;
    if (tenantBrandingConfig.support_email !== undefined) legacyBranding.support_email = tenantBrandingConfig.support_email;
    if (tenantBrandingConfig.support_url !== undefined) legacyBranding.support_url = tenantBrandingConfig.support_url;
    if (tenantBrandingConfig.custom_css !== undefined) legacyBranding.custom_css = tenantBrandingConfig.custom_css;
    if (tenantBrandingConfig.custom_domain !== undefined) legacyBranding.custom_domain = tenantBrandingConfig.custom_domain;

    merged = mergeObjects(merged, legacyBranding, 'legacy', sources);
  }

  // Validate branding fields
  const validationWarnings = validateBranding(merged);
  warnings.push(...validationWarnings);

  return {
    branding: merged,
    sources,
    templateId,
    templateVersion,
    templateLocked,
    availableTemplates: tenantBrandingConfig.allowed_template_ids,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Deep merge two branding objects, tracking sources
 */
function mergeObjects(
  base: BrandingData,
  override: BrandingData,
  source: 'platform' | 'template' | 'tenant' | 'legacy',
  sources: BrandingSource[]
): BrandingData {
  const merged = { ...base };

  Object.entries(override).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      (merged as any)[key] = value;
      sources.push({
        field: key as keyof BrandingData,
        source,
        value,
      });
    }
  });

  return merged;
}

/**
 * Validate branding fields and return warnings for invalid data
 */
function validateBranding(branding: BrandingData): string[] {
  const warnings: string[] = [];

  // Validate colors (hex format)
  if (branding.primary_color && !isValidHexColor(branding.primary_color)) {
    warnings.push(`Invalid primary_color format: ${branding.primary_color}. Should be #RRGGBB or #RGB.`);
  }
  if (branding.accent_color && !isValidHexColor(branding.accent_color)) {
    warnings.push(`Invalid accent_color format: ${branding.accent_color}. Should be #RRGGBB or #RGB.`);
  }
  if (branding.secondary_color && !isValidHexColor(branding.secondary_color)) {
    warnings.push(`Invalid secondary_color format: ${branding.secondary_color}. Should be #RRGGBB or #RGB.`);
  }

  // Validate URLs (must be https or relative)
  if (branding.logo_url && !isValidUrl(branding.logo_url)) {
    warnings.push(`Invalid logo_url format: ${branding.logo_url}. Should be HTTPS URL.`);
  }
  if (branding.favicon_url && !isValidUrl(branding.favicon_url)) {
    warnings.push(`Invalid favicon_url format: ${branding.favicon_url}. Should be HTTPS URL.`);
  }
  if (branding.support_url && !isValidUrl(branding.support_url)) {
    warnings.push(`Invalid support_url format: ${branding.support_url}. Should be HTTPS URL.`);
  }

  // Validate email
  if (branding.support_email && !isValidEmail(branding.support_email)) {
    warnings.push(`Invalid support_email format: ${branding.support_email}.`);
  }

  return warnings;
}

/**
 * Check if a hex color is valid (#RGB or #RRGGBB)
 */
function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Check if a URL is valid (https://)
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if an email is valid (basic format)
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
