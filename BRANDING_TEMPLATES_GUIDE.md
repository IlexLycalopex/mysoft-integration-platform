# Branding/Whitelabeling Enhancement — Complete Implementation Guide

## Overview

This guide documents the complete implementation of centrally managed, multi-tenant branding with reusable templates. The system supports:

- **Immutable, versioned templates** created by platform admins
- **Single locked template by default** for most restrictive control
- **Optional flexibility** allowing tenants to choose from allowed templates
- **Tenant customizations** that override template defaults
- **Full backward compatibility** with legacy direct branding columns

## Architecture

### Hierarchy

```
Platform Defaults
    ↓ (immutable version)
Branding Template
    ↓ (merge → customizations)
Tenant Customizations
    ↓ (rendered in UI)
Final Branding
```

### Key Concepts

**Template Immutability**: Templates cannot be edited in-place. Updates create new versions, preserving audit trail.

**Locked vs. Flexible**:
- **Locked (default)**: `allowed_template_ids` is empty → tenant cannot change template
- **Flexible (opt-in)**: `allowed_template_ids` has values → tenant can select from allowed list

**Resolution Chain**: Platform defaults → Template → Tenant customizations → validation & sanitization

## Implementation Summary

### Phase 1: Foundation ✅

**Database Migrations**
- `029_branding_templates.sql`: Creates `branding_templates` table with RLS, versioning, and metadata
- `030_alter_tenant_branding_templates.sql`: Adds template columns to `tenant_branding`

**Core Logic**
- `lib/branding.ts`: `resolveBranding()` function resolves full branding hierarchy
- `lib/types/branding.ts`: TypeScript interfaces for `BrandingData`, `BrandingTemplate`, `BrandingResolution`
- `lib/utils/branding-validation.ts`: Validation and sanitization utilities

**Testing**
- `__tests__/lib/branding.test.ts`: Comprehensive unit tests for resolution logic

### Phase 2: Template Management ✅

**Server Actions**
- `lib/actions/branding-templates.ts`: CRUD operations (create, list, get, publish, archive, version)

**UI Components**
- `components/platform/TemplatePreview.tsx`: Live preview of template branding
- `components/platform/TemplateEditor.tsx`: Form to create/edit templates
- `components/platform/TemplateGallery.tsx`: Browse and select templates

**Pages**
- `/platform/branding-templates/`: List and filter templates
- `/platform/branding-templates/new`: Create new template
- `/platform/branding-templates/[id]`: View template details, versions, usage

### Phase 3: Tenant Integration ✅

**Server Actions (Extended)**
- `applyTemplateToTenant()`: Assign template to tenant
- `setTenantAllowedTemplates()`: Control template flexibility
- `updateBrandingCustomizations()`: Update customizations on top of template

**UI Components**
- `components/platform/TemplateSelector.tsx`: Dropdown to select template (respects locks)

**Key Features**
- Template selector hidden if tenant is locked
- Customizations form always available
- Real-time preview of merged branding

### Phase 4: Runtime Application ✅

**Dashboard Layout Update**
- `app/(dashboard)/layout.tsx`: Switched from `getTenantBranding()` to `resolveBranding()`
- CSS variables injected based on resolved branding
- Full template + customization support

**No Breaking Changes**
- Legacy tenants with direct columns continue to work
- `getTenantBranding()` remains for backward compatibility

### Phase 5: QA & Documentation ✅

**Testing Strategy**
- Unit tests: Resolution logic, validation, sanitization
- Integration tests: Template CRUD, tenant application, feature gating
- E2E tests: Admin creates template → tenant applies → UI renders

**Validation**
- Hex color validation (#RGB, #RRGGBB)
- HTTPS URL validation
- Contrast ratio checking (WCAG 3:1 minimum)
- Custom CSS sanitization (no scripts, no javascript: protocol)
- Domain format validation

---

## Files Created/Modified

### Database Migrations
```
supabase/migrations/029_branding_templates.sql (NEW)
supabase/migrations/030_alter_tenant_branding_templates.sql (NEW)
```

### Core Library
```
lib/branding.ts (MODIFIED - added resolveBranding())
lib/types/branding.ts (NEW)
lib/utils/branding-validation.ts (NEW)
```

### Server Actions
```
lib/actions/branding-templates.ts (NEW)
lib/actions/branding.ts (MODIFIED - added applyTemplateToTenant, setTenantAllowedTemplates, updateBrandingCustomizations)
```

### UI Components
```
components/platform/TemplatePreview.tsx (NEW)
components/platform/TemplateEditor.tsx (NEW)
components/platform/TemplateGallery.tsx (NEW)
components/platform/TemplateSelector.tsx (NEW)
```

### Pages
```
app/(dashboard)/platform/branding-templates/page.tsx (NEW)
app/(dashboard)/platform/branding-templates/new/page.tsx (NEW)
app/(dashboard)/platform/branding-templates/[id]/page.tsx (NEW)
```

### Layout
```
app/(dashboard)/layout.tsx (MODIFIED - uses resolveBranding)
```

### Tests
```
__tests__/lib/branding.test.ts (NEW)
```

---

## Usage Guide

### For Platform Admins

#### Create a Template

1. Navigate to `/platform/branding-templates/`
2. Click "+ New Template"
3. Fill in template details:
   - Name (required)
   - Description, category, tags (optional)
   - Branding data (colors, logo, domain, CSS)
4. Preview updates live on the right side
5. Click "Create Template"

#### Publish Template

1. Go to template detail page
2. Click "Publish" button
3. Template becomes available to all tenants

#### Create New Version

1. Go to template detail page
2. Switch to "Version" tab
3. Make changes (creates new version, doesn't modify original)
4. Click "Create New Version"

#### Assign Template to Tenant

1. Navigate to tenant's branding page: `/platform/tenants/[id]/branding/`
2. Platform admin can see template assignment UI
3. Select template → customizations form appears
4. Customize if needed (e.g., override just the logo)
5. Save

#### Control Tenant's Template Choices

1. Go to `/platform/tenants/[id]/branding-settings/` (admin-only)
2. **Locked template** (default): Tenant cannot change template
3. **Add allowed templates**: Tenant can choose from list
4. Save settings

### For Tenant Admins

#### Apply Template to Tenant

(If not already locked by platform admin)

1. Go to `/platform/tenants/[tenant-id]/branding/`
2. If template selector visible → choose template
3. If locked → template shown read-only
4. In "Template Customizations" section:
   - Override specific fields (e.g., support email)
   - Leave others blank to inherit from template
5. Save

#### Customize on Top of Template

1. Template provides base branding
2. Customization form lets you override specific fields
3. Only filled fields override template; empty fields inherit
4. Changes persist when switching templates

---

## Technical Details

### Resolution Algorithm

```typescript
async function resolveBranding(tenantId: string): Promise<BrandingResolution> {
  1. Start with platform defaults
  2. If tenant.template_id set:
     - Fetch template branding_data
     - Merge into defaults
  3. If tenant.custom_branding_data set:
     - Merge customizations on top
  4. If no template_id:
     - Use legacy direct columns as fallback
  5. Validate (colors, URLs, CSS)
  6. Return resolved branding + audit trail
}
```

### Permission Model

- **Platform Admins**: Create/publish/archive templates, assign to tenants, control access
- **Tenant Admins**: Apply published templates, customize on top (if flexible)
- **Tenant Operators**: Read-only access

### Feature Gating

- Existing `white_label` plan feature gates all branding (templates inherit)
- No new feature flags needed
- Tenants without `white_label` cannot use templates

### RLS Policies

- **branding_templates**:
  - Platform admins: see all
  - Tenants: see published + shared_with_tenants + own private templates
- **tenant_branding**:
  - Tenant members: read/write own
  - Platform admins: read all (audit)

---

## Validation Rules

### Colors
- **Format**: `#RGB` or `#RRGGBB` hex
- **Contrast**: Primary color vs. white: minimum 3:1 ratio (WCAG)

### URLs
- **Format**: Must be `https://` (not `http://`)
- **Fields**: logo_url, favicon_url, support_url

### Email
- **Format**: Standard email format validation

### Custom CSS
- **Security**: Strips `<script>` tags, `javascript:` protocol
- **Length**: No hard limit (validate on save)

### Custom Domain
- **Format**: Valid hostname (no protocol, no path)
- **Example**: `integrations.example.com`

---

## Backward Compatibility

### Legacy Tenants
- Tenants with no `template_id` use legacy direct columns
- `resolveBranding()` falls back to direct columns
- Existing branding continues to work unchanged

### Migration Path
- No data migration required
- New tenants can use templates
- Legacy tenants can opt-in by selecting a template
- Once a template is selected, customizations stack on top

### `getTenantBranding()` Function
- Still available for backward compatibility
- New code should use `resolveBranding()`
- No urgent need to migrate existing code

---

## Testing Checklist

### Unit Tests ✅
- [x] Resolution logic: platform → template → tenant
- [x] Backward compatibility: legacy columns work
- [x] Validation: colors, URLs, emails, domains
- [x] Template versioning: new versions created
- [x] Access control: locked vs. flexible modes
- [x] Error handling: missing templates, invalid branding

### Integration Tests
- [ ] Template CRUD: create, read, publish, archive
- [ ] Tenant application: apply template, customize
- [ ] Feature gating: non-white_label tenants cannot use templates
- [ ] Multi-version: tenant with v1 → v2 created → tenant still on v1

### E2E Tests
- [ ] Platform admin creates template
- [ ] Tenant applies template
- [ ] Dashboard renders with template branding
- [ ] Customizations override template values
- [ ] Switching templates preserves customizations

---

## Roadmap (Future Enhancements)

### Email Branding
- Emails respect resolved branding (currently not included)
- Job completion emails use tenant's brand_name, colors

### Document Branding
- PDF reports use resolved branding
- Colors, logo, fonts in generated documents

### Advanced Styling
- Font family customization
- Additional color palette (success, warning, error, info)
- Component-level CSS customization

### Template Discovery
- Search templates by name, tags, category
- Sort by popularity, recency
- User ratings/feedback

### Bulk Operations
- Apply template to multiple tenants
- Bulk update customizations
- Export/import branding configs

---

## Troubleshooting

### Template Not Appearing in Selector
- Verify template visibility is `platform_published`
- Check `is_archived` is `false`
- Verify RLS policies allow tenant to see template
- Confirm `white_label` feature is enabled for tenant

### Branding Not Applied
- Check `resolveBranding()` returns correct values
- Verify CSS variables are injected into `<style>` tag
- Inspect browser DevTools: check computed `--blue`, `--accent` variables
- Confirm custom CSS doesn't conflict

### Customizations Overriding Template Incorrectly
- Verify `custom_branding_data` doesn't have null/empty values
- Check merge logic in `resolveBranding()`: tenant customizations should only override if value is not null/undefined
- Review audit trail in `sources` array

### Validation Errors
- **Color errors**: Ensure hex format is `#` followed by 3 or 6 hex digits
- **URL errors**: Check protocol is `https://` and URL is valid
- **Domain errors**: No protocol, no path, valid hostname format
- **CSS errors**: Verify no `<script>` tags or `javascript:` patterns

---

## Performance Considerations

### Caching
- `resolveBranding()` can be cached at request level (Next.js `cache()`)
- Platform defaults are constant (never query from DB)
- Template queries use JOIN to avoid N+1

### Database Queries
- Single query per tenant branding fetch
- Join with templates table for template lookup
- Indexed by: `tenant_id`, `template_id`, `visibility`, `created_at`

### Frontend
- Template selector lazy-loads templates on mount
- Preview updates in real-time (client-side only)
- No full-page refresh on template selection

---

## Security Considerations

### CSS Injection
- Custom CSS sanitized: `<script>` and `javascript:` stripped
- Applied in `<style>` tag (not as dangerously set HTML)
- Server-side sanitization before storage

### Logo/Favicon URLs
- Must be HTTPS only (no data: URIs, no file://)
- Validated before storage
- Client-side error handling if URL invalid

### Domain Configuration
- Custom domain is informational (DNS/SSL configured outside platform)
- No security validation required
- Used for display purposes only

### RLS Policies
- Platform admins bypass all checks (trusted users)
- Tenants can only see published/shared/own templates
- Cross-tenant data leakage prevented at DB level

---

## Maintenance

### Monitoring
- Track template usage via `usage_count` field
- Monitor version count (indicates active maintenance)
- Log template publish/archive actions (audit trail)

### Cleanup
- Archive unused templates (don't delete)
- Consolidate similar templates
- Document template purposes/use cases

### Updates
- Create new versions for changes (don't modify existing)
- Notify tenants of template updates
- Provide migration guide for major changes

---

## Support & Escalation

**For Platform Admins**: See template management pages (`/platform/branding-templates/`) for full control.

**For Tenant Admins**: Limited to applying published templates and customizing. Contact platform admin for new templates.

**For Tenants**: Branding is locked by platform admin. Request branding changes from tenant admin.

---

## Questions?

Refer to:
1. This guide for features & usage
2. `lib/branding.ts` for resolution logic
3. `__tests__/lib/branding.test.ts` for examples
4. Database migrations for schema details
