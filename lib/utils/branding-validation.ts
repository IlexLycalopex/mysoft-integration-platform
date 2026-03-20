import { BrandingData } from '@/lib/types/branding';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate branding data for consistency and correctness
 */
export function validateBrandingData(branding: BrandingData | undefined): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!branding) {
    errors.push('Branding data is required');
    return { valid: false, errors, warnings };
  }

  // Validate colors
  if (branding.primary_color && !isValidHexColor(branding.primary_color)) {
    errors.push(`Invalid primary_color format: ${branding.primary_color}. Should be #RRGGBB or #RGB.`);
  }
  if (branding.accent_color && !isValidHexColor(branding.accent_color)) {
    errors.push(`Invalid accent_color format: ${branding.accent_color}. Should be #RRGGBB or #RGB.`);
  }
  if (branding.secondary_color && !isValidHexColor(branding.secondary_color)) {
    errors.push(`Invalid secondary_color format: ${branding.secondary_color}. Should be #RRGGBB or #RGB.`);
  }

  // Validate URLs
  if (branding.logo_url && !isValidUrl(branding.logo_url)) {
    errors.push(`Invalid logo_url: ${branding.logo_url}. Must be HTTPS URL.`);
  }
  if (branding.favicon_url && !isValidUrl(branding.favicon_url)) {
    errors.push(`Invalid favicon_url: ${branding.favicon_url}. Must be HTTPS URL.`);
  }
  if (branding.support_url && !isValidUrl(branding.support_url)) {
    errors.push(`Invalid support_url: ${branding.support_url}. Must be HTTPS URL.`);
  }

  // Validate email
  if (branding.support_email && !isValidEmail(branding.support_email)) {
    errors.push(`Invalid support_email: ${branding.support_email}`);
  }

  // Validate contrast ratio for readability (WCAG 3:1 minimum)
  if (branding.primary_color && branding.primary_color !== '#0069B4') {
    const contrastRatio = getContrastRatio(branding.primary_color, '#FFFFFF');
    if (contrastRatio < 3) {
      warnings.push(`primary_color contrast ratio is ${contrastRatio.toFixed(2)}:1. WCAG AA requires 4.5:1 for text.`);
    }
  }

  // Validate string lengths
  if (branding.brand_name && branding.brand_name.length > 255) {
    errors.push('brand_name must be 255 characters or less');
  }

  // Validate custom CSS doesn't contain harmful content
  if (branding.custom_css) {
    if (branding.custom_css.toLowerCase().includes('<script')) {
      errors.push('custom_css cannot contain <script> tags');
    }
    if (branding.custom_css.toLowerCase().includes('javascript:')) {
      errors.push('custom_css cannot contain javascript: protocol');
    }
  }

  // Validate custom domain format
  if (branding.custom_domain) {
    if (!isValidDomain(branding.custom_domain)) {
      errors.push(`Invalid custom_domain format: ${branding.custom_domain}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a hex color is valid (#RGB or #RRGGBB)
 */
function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Check if a URL is valid (must be HTTPS)
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
 * Check if email is valid (basic format)
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if domain is valid (hostname format)
 */
function isValidDomain(domain: string): boolean {
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain);
}

/**
 * Calculate contrast ratio between two colors (WCAG formula)
 * Returns ratio like 1:1, 4.5:1, 21:1, etc.
 */
function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 1;

  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})?([a-f\d]{2})?([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1] || 'ff', 16),
        g: parseInt(result[2] || 'ff', 16),
        b: parseInt(result[3] || 'ff', 16),
      }
    : null;
}

/**
 * Get relative luminance (WCAG formula)
 */
function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Sanitize custom CSS by removing potentially harmful content
 */
export function sanitizeCustomCss(css: string): string {
  // Remove script tags
  let sanitized = css.replace(/<script[^>]*>.*?<\/script>/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');

  return sanitized;
}
