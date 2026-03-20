'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { BrandingTemplate, BrandingData } from '@/lib/types/branding';
import { validateBrandingData } from '@/lib/utils/branding-validation';

/**
 * Create a new branding template (platform admin only)
 */
export async function createBrandingTemplate(
  input: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data: BrandingData;
    visibility: 'private' | 'shared_with_tenants' | 'platform_published';
    thumbnail_url?: string;
  },
  userId: string
): Promise<{ success: boolean; template?: BrandingTemplate; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User not authenticated' };
  }

  // Validate user is platform admin
  const admin = createAdminClient();
  const { data: userRole } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (userRole?.role !== 'platform_super_admin' && userRole?.role !== 'mysoft_support_admin') {
    return { success: false, error: 'Only platform admins can create templates' };
  }

  // Validate branding data
  const validation = validateBrandingData(input.branding_data);
  if (!validation.valid) {
    return { success: false, error: `Invalid branding data: ${validation.errors.join(', ')}` };
  }

  // Create template
  const { data: template, error } = await (admin as any)
    .from("branding_templates")
    .insert({
      created_by: userId,
      name: input.name.trim(),
      description: input.description?.trim(),
      category: input.category?.trim(),
      tags: input.tags || [],
      branding_data: input.branding_data,
      visibility: input.visibility,
      thumbnail_url: input.thumbnail_url,
      version: 1,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to create template: ${error.message}` };
  }

  return { success: true, template };
}

/**
 * Get a template by ID (with visibility checks)
 */
export async function getBrandingTemplate(
  templateId: string,
  userId?: string
): Promise<{ success: boolean; template?: BrandingTemplate; error?: string }> {
  const admin = createAdminClient();

  const { data: template, error } = await (admin as any)
    .from("branding_templates")
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    return { success: false, error: `Failed to fetch template: ${error.message}` };
  }

  if (!template) {
    return { success: false, error: 'Template not found' };
  }

  // If userId is provided, check if they are a platform admin — platform admins see all templates
  if (userId) {
    const { data: userRole } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const isPlatformAdmin =
      userRole?.role === 'platform_super_admin' || userRole?.role === 'mysoft_support_admin';

    if (!isPlatformAdmin && template.visibility === 'private' && template.created_by !== userId) {
      return { success: false, error: 'Not authorized to view this template' };
    }
  } else {
    // No userId — only allow non-private templates
    if (template.visibility === 'private') {
      return { success: false, error: 'Not authorized to view this template' };
    }
  }

  return { success: true, template };
}

/**
 * List templates with filters
 */
export async function listBrandingTemplates(
  filters: {
    visibility?: 'private' | 'shared_with_tenants' | 'platform_published';
    category?: string;
    excludeArchived?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  userId?: string
): Promise<{ success: boolean; templates?: BrandingTemplate[]; total?: number; error?: string }> {
  const admin = createAdminClient();
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  let query = (admin as any).from("branding_templates").select('*', { count: 'exact' });

  // Apply filters
  if (filters.visibility) {
    query = query.eq('visibility', filters.visibility);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.excludeArchived !== false) {
    query = query.eq('is_archived', false);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data: templates, error, count } = await query;

  if (error) {
    return { success: false, error: `Failed to list templates: ${error.message}` };
  }

  return { success: true, templates: templates as BrandingTemplate[], total: count || 0 };
}

/**
 * Create a new version of a template (immutable update)
 */
export async function createTemplateVersion(
  templateId: string,
  updates: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data?: BrandingData;
    thumbnail_url?: string;
  },
  userId: string
): Promise<{ success: boolean; template?: BrandingTemplate; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User not authenticated' };
  }

  const admin = createAdminClient();

  // Verify user is platform admin
  const { data: userRole } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (userRole?.role !== 'platform_super_admin' && userRole?.role !== 'mysoft_support_admin') {
    return { success: false, error: 'Only platform admins can create template versions' };
  }

  // Get current template
  const { data: currentTemplate, error: fetchError } = await (admin as any)
    .from("branding_templates")
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (fetchError || !currentTemplate) {
    return { success: false, error: 'Template not found' };
  }

  // Validate branding data if provided
  if (updates.branding_data) {
    const validation = validateBrandingData(updates.branding_data);
    if (!validation.valid) {
      return { success: false, error: `Invalid branding data: ${validation.errors.join(', ')}` };
    }
  }

  // Create new version
  const newVersion = (currentTemplate.version || 1) + 1;
  const { data: newTemplate, error: createError } = await (admin as any)
    .from("branding_templates")
    .insert({
      created_by: userId,
      parent_template_id: templateId,
      version: newVersion,
      name: updates.name?.trim() || currentTemplate.name,
      description: updates.description?.trim() || currentTemplate.description,
      category: updates.category?.trim() || currentTemplate.category,
      tags: updates.tags || currentTemplate.tags || [],
      branding_data: updates.branding_data || currentTemplate.branding_data,
      thumbnail_url: updates.thumbnail_url || currentTemplate.thumbnail_url,
      visibility: currentTemplate.visibility,
      is_archived: false,
    })
    .select()
    .single();

  if (createError) {
    return { success: false, error: `Failed to create template version: ${createError.message}` };
  }

  return { success: true, template: newTemplate };
}

/**
 * Archive a template
 */
export async function archiveBrandingTemplate(
  templateId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User not authenticated' };
  }

  const admin = createAdminClient();

  // Verify user is platform admin
  const { data: userRole } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (userRole?.role !== 'platform_super_admin' && userRole?.role !== 'mysoft_support_admin') {
    return { success: false, error: 'Only platform admins can archive templates' };
  }

  const { error } = await (admin as any)
    .from("branding_templates")
    .update({ is_archived: true })
    .eq('id', templateId);

  if (error) {
    return { success: false, error: `Failed to archive template: ${error.message}` };
  }

  return { success: true };
}

/**
 * Publish a template (change visibility to platform_published)
 */
export async function publishBrandingTemplate(
  templateId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: 'User not authenticated' };
  }

  const admin = createAdminClient();

  // Verify user is platform admin
  const { data: userRole } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (userRole?.role !== 'platform_super_admin' && userRole?.role !== 'mysoft_support_admin') {
    return { success: false, error: 'Only platform admins can publish templates' };
  }

  const { error } = await (admin as any)
    .from("branding_templates")
    .update({ visibility: 'platform_published' })
    .eq('id', templateId);

  if (error) {
    return { success: false, error: `Failed to publish template: ${error.message}` };
  }

  return { success: true };
}

/**
 * Get template usage stats
 */
export async function getTemplateUsageStats(
  templateId: string
): Promise<{ success: boolean; stats?: { usage_count: number; tenants: Array<{ tenant_id: string; tenant_name: string }> }; error?: string }> {
  const admin = createAdminClient();

  // Get usage count from template
  const { data: template, error: templateError } = await (admin as any)
    .from("branding_templates")
    .select('usage_count')
    .eq('id', templateId)
    .maybeSingle();

  if (templateError || !template) {
    return { success: false, error: 'Template not found' };
  }

  // Get tenants using this template
  const { data: tenantUsage, error: usageError } = await admin
    .from('tenant_branding')
    .select('tenant_id, tenants(name)')
    .eq('template_id', templateId);

  if (usageError) {
    return { success: false, error: `Failed to fetch usage stats: ${usageError.message}` };
  }

  return {
    success: true,
    stats: {
      usage_count: template.usage_count,
      tenants: (tenantUsage || []).map((t: any) => ({
        tenant_id: t.tenant_id,
        tenant_name: t.tenants?.name || 'Unknown',
      })),
    },
  };
}
