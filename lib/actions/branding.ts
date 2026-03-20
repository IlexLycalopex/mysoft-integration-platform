'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { UserRole } from '@/types/database';

interface BrandingData {
  brand_name?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string;
  accent_color?: string;
  support_email?: string | null;
  support_url?: string | null;
  custom_css?: string | null;
  custom_domain?: string | null;
}

function isValidHex(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export async function saveBranding(
  tenantId: string,
  data: BrandingData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  // Validate colours
  if (data.primary_color && !isValidHex(data.primary_color)) {
    return { success: false, error: 'Primary colour must be a valid CSS hex value (e.g. #0069B4)' };
  }
  if (data.accent_color && !isValidHex(data.accent_color)) {
    return { success: false, error: 'Accent colour must be a valid CSS hex value (e.g. #00A3E0)' };
  }

  // Validate primary colour contrast against white — sidebar text must be readable
  if (data.primary_color && isValidHex(data.primary_color)) {
    const ratio = contrastRatio(data.primary_color, '#FFFFFF');
    if (ratio < 3.0) {
      return {
        success: false,
        error: `Primary colour has insufficient contrast against white text (${ratio.toFixed(1)}:1 — minimum 3:1 required). Choose a darker colour so navigation labels remain readable.`,
      };
    }
  }

  // Validate URLs — must be https:// or empty
  if (data.logo_url && !isValidHttpsUrl(data.logo_url)) {
    return { success: false, error: 'Logo URL must start with https://' };
  }
  if (data.favicon_url && !isValidHttpsUrl(data.favicon_url)) {
    return { success: false, error: 'Favicon URL must start with https://' };
  }

  // Validate custom domain — basic format check (no protocol, no path, just hostname)
  if (data.custom_domain) {
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainPattern.test(data.custom_domain)) {
      return { success: false, error: 'Custom domain must be a valid hostname (e.g. integrations.yourcompany.com)' };
    }
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from("tenant_branding")
    .upsert({
      tenant_id: tenantId,
      brand_name: data.brand_name ?? null,
      logo_url: data.logo_url ?? null,
      favicon_url: data.favicon_url ?? null,
      primary_color: data.primary_color ?? '#0069B4',
      accent_color: data.accent_color ?? '#00A3E0',
      support_email: data.support_email ?? null,
      support_url: data.support_url ?? null,
      custom_css: data.custom_css ?? null,
      custom_domain: data.custom_domain ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  return { success: true };
}

/**
 * Removes all branding customisation for a tenant, reverting to Mysoft defaults.
 * Platform super admin only.
 */
export async function resetBranding(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'platform_super_admin') {
    return { success: false, error: 'Super admin access required' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from("tenant_branding")
    .delete()
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { success: true };
}

/**
 * Apply a template to a tenant and optionally customize on top
 */
export async function applyTemplateToTenant(
  tenantId: string,
  templateId: string,
  customizations?: BrandingData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  // Fetch template to get version
  const admin = createAdminClient();
  const { data: template } = await (admin as any)
    .from("branding_templates")
    .select('version')
    .eq('id', templateId)
    .maybeSingle();

  if (!template) {
    return { success: false, error: 'Template not found' };
  }

  // Update tenant branding to use template
  const { error } = await (admin as any)
    .from("tenant_branding")
    .upsert({
      tenant_id: tenantId,
      template_id: templateId,
      template_version: template.version,
      custom_branding_data: customizations || null,
      applied_by: user.id,
      applied_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  return { success: true };
}

/**
 * Set tenant's allowed templates (restricts choices or unlocks flexibility)
 */
export async function setTenantAllowedTemplates(
  tenantId: string,
  allowedTemplateIds: string[] | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from("tenant_branding")
    .update({ allowed_template_ids: allowedTemplateIds })
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  return { success: true };
}

/**
 * Update tenant's branding customizations on top of template
 */
export async function updateBrandingCustomizations(
  tenantId: string,
  customizations: BrandingData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from("tenant_branding")
    .update({
      custom_branding_data: customizations,
      applied_by: user.id,
      applied_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  return { success: true };
}

/**
 * Remove a template from a tenant, reverting to direct branding columns
 */
export async function clearTenantTemplate(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: UserRole }>();

  if (!profile || !['platform_super_admin', 'mysoft_support_admin'].includes(profile.role)) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createAdminClient();
  const { error } = await (admin as any)
    .from('tenant_branding')
    .update({
      template_id: null,
      template_version: null,
      custom_branding_data: null,
      allowed_template_ids: null,
      applied_by: user.id,
      applied_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/platform/tenants/${tenantId}/branding`);
  return { success: true };
}
