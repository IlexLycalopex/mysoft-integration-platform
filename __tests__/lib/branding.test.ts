import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveBranding, platformDefaults } from '@/lib/branding';
import { BrandingData, BrandingResolution } from '@/lib/types/branding';

// Mock the admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

import { createAdminClient } from '@/lib/supabase/admin';

describe('branding resolution', () => {
  let mockAdminClient: any;

  beforeEach(() => {
    mockAdminClient = {
      from: vi.fn(),
    };
    (createAdminClient as any).mockReturnValue(mockAdminClient);
  });

  describe('resolveBranding', () => {
    it('should return platform defaults when no tenant branding exists', async () => {
      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.branding.primary_color).toBe('#0069B4');
      expect(result.branding.accent_color).toBe('#00A3E0');
      expect(result.branding.support_email).toBe('support@mysoftx3.com');
      expect(result.sources).toContainEqual(
        expect.objectContaining({
          field: 'primary_color',
          source: 'platform',
        })
      );
    });

    it('should merge legacy direct columns', async () => {
      const legacyBranding = {
        template_id: null,
        allowed_template_ids: null,
        template_version: null,
        custom_branding_data: null,
        brand_name: 'Acme Corp',
        logo_url: 'https://example.com/logo.png',
        favicon_url: 'https://example.com/favicon.ico',
        primary_color: '#FF0000',
        accent_color: '#00FF00',
        support_email: 'support@acme.com',
        support_url: 'https://acme.com/support',
        custom_css: '.custom { color: red; }',
        custom_domain: null,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: legacyBranding }),
          }),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.branding.brand_name).toBe('Acme Corp');
      expect(result.branding.primary_color).toBe('#FF0000');
      expect(result.branding.support_email).toBe('support@acme.com');
      expect(result.templateId).toBeUndefined();
      expect(
        result.sources.some((s) => s.source === 'legacy' && s.field === 'brand_name')
      ).toBe(true);
    });

    it('should merge template branding data when template_id is set', async () => {
      const templateBranding = {
        template_id: 'template-456',
        allowed_template_ids: [],
        template_version: 1,
        custom_branding_data: null,
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      const template = {
        branding_data: {
          brand_name: 'Template Brand',
          primary_color: '#0000FF',
          accent_color: '#FF00FF',
        },
        version: 1,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field, value) => ({
            maybeSingle: vi.fn().mockResolvedValue(
              field === 'tenant_id'
                ? { data: templateBranding }
                : { data: template }
            ),
          })),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.branding.brand_name).toBe('Template Brand');
      expect(result.branding.primary_color).toBe('#0000FF');
      expect(result.templateId).toBe('template-456');
      expect(result.templateVersion).toBe(1);
      expect(result.templateLocked).toBe(true); // no allowed_template_ids = locked
    });

    it('should merge custom branding on top of template', async () => {
      const tenantConfig = {
        template_id: 'template-456',
        allowed_template_ids: [],
        template_version: 1,
        custom_branding_data: {
          brand_name: 'Customer Override',
          primary_color: '#00AA00',
        },
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      const template = {
        branding_data: {
          brand_name: 'Template Brand',
          primary_color: '#0000FF',
          accent_color: '#FF00FF',
          support_email: 'template@example.com',
        },
        version: 1,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field, value) => ({
            maybeSingle: vi.fn().mockResolvedValue(
              field === 'tenant_id'
                ? { data: tenantConfig }
                : { data: template }
            ),
          })),
        }),
      });

      const result = await resolveBranding('tenant-123');

      // Custom branding overrides template
      expect(result.branding.brand_name).toBe('Customer Override');
      expect(result.branding.primary_color).toBe('#00AA00');
      // Template values that aren't overridden remain
      expect(result.branding.accent_color).toBe('#FF00FF');
      expect(result.branding.support_email).toBe('template@example.com');

      // Verify sources show custom overrides template
      const primaryColorSource = result.sources.find((s) => s.field === 'primary_color');
      expect(primaryColorSource?.source).toBe('tenant');
      const accentColorSource = result.sources.find((s) => s.field === 'accent_color');
      expect(accentColorSource?.source).toBe('template');
    });

    it('should detect unlocked templates (flexible mode)', async () => {
      const tenantConfig = {
        template_id: 'template-456',
        allowed_template_ids: ['template-456', 'template-789'], // Additional templates allowed
        template_version: 1,
        custom_branding_data: null,
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      const template = {
        branding_data: { brand_name: 'Template' },
        version: 1,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field, value) => ({
            maybeSingle: vi.fn().mockResolvedValue(
              field === 'tenant_id'
                ? { data: tenantConfig }
                : { data: template }
            ),
          })),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.templateLocked).toBe(false); // allowed_template_ids is non-empty
      expect(result.availableTemplates).toEqual(['template-456', 'template-789']);
    });

    it('should warn when template not found', async () => {
      const tenantConfig = {
        template_id: 'missing-template',
        allowed_template_ids: [],
        template_version: 1,
        custom_branding_data: null,
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field, value) => ({
            maybeSingle: vi.fn().mockResolvedValue(
              field === 'tenant_id'
                ? { data: tenantConfig }
                : { data: null } // Template not found
            ),
          })),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes('not found'))).toBe(true);
    });

    it('should validate hex colors', async () => {
      const tenantConfig = {
        template_id: null,
        allowed_template_ids: null,
        template_version: null,
        custom_branding_data: {
          primary_color: 'red', // Invalid
          accent_color: '#0000FF', // Valid
        },
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tenantConfig }),
          }),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes('Invalid primary_color'))).toBe(true);
    });

    it('should validate URLs (must be https)', async () => {
      const tenantConfig = {
        template_id: null,
        allowed_template_ids: null,
        template_version: null,
        custom_branding_data: {
          logo_url: 'http://example.com/logo.png', // Invalid: http not https
          favicon_url: 'https://example.com/favicon.ico', // Valid
        },
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tenantConfig }),
          }),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes('Invalid logo_url'))).toBe(true);
    });

    it('should validate email format', async () => {
      const tenantConfig = {
        template_id: null,
        allowed_template_ids: null,
        template_version: null,
        custom_branding_data: {
          support_email: 'not-an-email', // Invalid
        },
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tenantConfig }),
          }),
        }),
      });

      const result = await resolveBranding('tenant-123');

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes('Invalid support_email'))).toBe(true);
    });

    it('should handle resolution order correctly (platform → template → tenant)', async () => {
      const tenantConfig = {
        template_id: 'template-456',
        allowed_template_ids: [],
        template_version: 1,
        custom_branding_data: {
          primary_color: '#111111', // Tenant override
        },
        brand_name: null,
        logo_url: null,
        favicon_url: null,
        primary_color: null,
        accent_color: null,
        support_email: null,
        support_url: null,
        custom_css: null,
        custom_domain: null,
      };

      const template = {
        branding_data: {
          primary_color: '#222222', // Template value (should be overridden)
          accent_color: '#333333', // Template value (no tenant override)
        },
        version: 1,
      };

      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field, value) => ({
            maybeSingle: vi.fn().mockResolvedValue(
              field === 'tenant_id'
                ? { data: tenantConfig }
                : { data: template }
            ),
          })),
        }),
      });

      const result = await resolveBranding('tenant-123');

      // Tenant override takes precedence
      expect(result.branding.primary_color).toBe('#111111');
      // Template value used when no tenant override
      expect(result.branding.accent_color).toBe('#333333');

      // Verify sources
      const primarySource = result.sources.find((s) => s.field === 'primary_color');
      expect(primarySource?.source).toBe('tenant');
      const accentSource = result.sources.find((s) => s.field === 'accent_color');
      expect(accentSource?.source).toBe('template');
    });
  });
});
