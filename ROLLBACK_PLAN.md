# Rollback Plan — Branding Templates Implementation

**Deployment Date**: March 20, 2026
**Environment**: Dev (Supabase + Vercel)
**Risk Level**: LOW (Dev only, no production data)

---

## Quick Rollback Commands

### Option 1: Revert Git Commit (Safest)
```bash
# If deployment was just merged
git revert <commit-hash>
git push origin main

# If on a branch, revert the branch
git checkout main
git reset --hard origin/main
```

### Option 2: Rollback Migrations (Database)
```bash
# In Supabase dashboard or via CLI
supabase migration down 030
supabase migration down 029

# Or via SQL:
DROP TABLE IF EXISTS branding_templates CASCADE;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS template_id;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS allowed_template_ids;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS template_version;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS custom_branding_data;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS applied_by;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS applied_at;
```

### Option 3: Vercel Rollback
1. Go to Vercel dashboard
2. Select project
3. Click "Deployments"
4. Find previous working deployment
5. Click "..." menu → "Promote to Production"

---

## Rollback Decision Tree

### Issue: Database migration failed
**Action**: Revert migrations (Option 2)
```bash
supabase migration down 030
supabase migration down 029
git revert <commit-hash>
git push
```

### Issue: Components/pages not rendering
**Action**: Vercel rollback (Option 3)
- Redeploy previous commit
- Or use Vercel's one-click rollback

### Issue: API endpoints returning errors
**Action**: Check error logs first
```bash
# Supabase logs
supabase logs tail

# Vercel logs
vercel logs
```
If unfixable → Git revert + migrations down

### Issue: TypeScript compilation errors in production
**Action**: Git revert immediately
```bash
git revert <commit-hash>
git push origin main
# Vercel will auto-redeploy
```

---

## Step-by-Step Rollback

### 1. **Immediate (within 5 minutes)**
```bash
# Option A: Full git revert
git log --oneline | grep -i branding
git revert <commit-hash>
git push origin main

# Option B: Direct branch reset
git checkout main
git reset --hard HEAD~1
git push -f origin main
```

### 2. **Database Cleanup (if needed)**
```bash
# Connect to Supabase CLI
supabase db pull

# If migrations need manual rollback
supabase migration down

# Verify tables
SELECT table_name FROM information_schema.tables WHERE table_schema='public';
```

### 3. **Clear Vercel Cache**
```bash
# Purge cache and redeploy
vercel --prod --skip-build

# Or visit Vercel dashboard → Settings → Deployment → Purge Cache
```

### 4. **Verify Rollback**
```bash
# Check deployment status
vercel list

# Test API
curl https://your-dev-app.vercel.app/api/health

# Verify database
supabase db list
```

---

## What Gets Deleted

### Git Rollback Removes
- ✅ 2 migration files (029, 030)
- ✅ `lib/types/branding.ts`
- ✅ `lib/utils/branding-validation.ts`
- ✅ `lib/actions/branding-templates.ts`
- ✅ 5 UI components (TemplatePreview, TemplateEditor, TemplateGallery, TemplateSelector)
- ✅ 3 new pages (template list, create, detail)
- ✅ Unit tests, integration tests
- ✅ Documentation files (BRANDING_TEMPLATES_GUIDE.md, IMPLEMENTATION_COMPLETE.md, ROLLBACK_PLAN.md)
- ✅ Changes to existing files reverted

### Database Rollback Removes
- ✅ `branding_templates` table
- ✅ Template columns from `tenant_branding`
- ✅ All RLS policies for templates
- ✅ All indexes on templates

### What STAYS (Backward Compatible)
- ✅ Legacy `getTenantBranding()` function (unchanged)
- ✅ Existing `tenant_branding` legacy columns
- ✅ Existing branding configurations
- ✅ All existing tenant data

---

## Timeline & Verification

| Phase | Action | Time | Verification |
|-------|--------|------|--------------|
| 0 | Identify issue | 0-2 min | Logs show error |
| 1 | Git revert | 2-3 min | `git log` shows revert |
| 2 | Push to GitHub | 3-5 min | GitHub shows new commit |
| 3 | Vercel redeploys | 5-10 min | Vercel dashboard shows active deployment |
| 4 | Database clean (if needed) | 10-15 min | Supabase shows tables removed |
| 5 | Verify API working | 15-20 min | `curl` returns 200 OK |

**Total Rollback Time**: ~20 minutes maximum

---

## No-Rollback Scenarios (Can Fix Forward)

### Scenario 1: Minor UI Bug
- Fix in new commit
- Deploy normally
- No rollback needed

### Scenario 2: Migration Bug (Schema Error)
- Fix migration syntax
- Run corrected migration
- No rollback needed

### Scenario 3: Permission/RLS Issue
- Update policies in Supabase SQL editor
- No rollback needed

### Scenario 4: Validation Too Strict
- Loosen validation in `lib/utils/branding-validation.ts`
- Deploy fix
- No rollback needed

---

## Rollback Triggers (Do Rollback If...)

🔴 **Critical** — Rollback immediately:
- Database connection broken
- All API endpoints down
- Data corruption detected
- TypeScript compilation fails in production
- Authentication broken

🟡 **Warning** — Rollback after investigation:
- Template creation fails completely
- Tenant branding not loading
- Multiple endpoints returning 500 errors
- RLS policies blocking legitimate access

🟢 **Minor** — Fix forward:
- Single UI component not rendering
- Validation too strict/loose
- Performance slightly degraded
- Single API endpoint has bug

---

## Testing Before Rollback

**Before rolling back, test:**

1. **Is the issue new?**
   - Compare with previous deployment
   - Check git diff

2. **Is it environment-specific?**
   - Test in local dev
   - Test in Supabase staging
   - Check Vercel logs

3. **Can it be fixed forward?**
   - Quick fix available?
   - Estimated fix time < 30 min?
   - Risk of fix introducing new bugs?

---

## Post-Rollback Checklist

After rollback, verify:
- [ ] Git history is clean (no dangling commits)
- [ ] Database migrations properly reverted
- [ ] Vercel shows previous deployment active
- [ ] API responding normally
- [ ] No errors in Vercel logs
- [ ] No errors in Supabase logs
- [ ] Existing branding still works (legacy)
- [ ] No data loss (legacy tenants unaffected)

---

## Communication

**If rollback happens:**

1. Notify team in #dev-ops Slack
   - "Rolled back branding templates commit ABC123"
   - "Reason: [specific error]"
   - "Status: back to normal"

2. Document incident
   - What failed
   - Why it failed
   - What was rolled back
   - How to prevent next time

3. Schedule post-mortem
   - Root cause analysis
   - Improvements to testing/deployment
   - Updated rollback procedures

---

## Prevention Checklist

Before deploying:
- [ ] Run `npm test` locally
- [ ] Run `npm run build` locally
- [ ] Verify all tests pass
- [ ] Lint check passes
- [ ] TypeScript types correct
- [ ] Database migrations tested on staging
- [ ] RLS policies tested
- [ ] Manual smoke test of key features
- [ ] Vercel preview deployment works
- [ ] No console errors in Vercel logs

---

## Emergency Contacts

- **Database Issue**: Check Supabase status page + logs
- **Deployment Issue**: Check Vercel deployment logs
- **Git Issue**: `git reflog` to recover previous state
- **Authentication Issue**: Check Supabase auth settings

---

## Reference: What Was Deployed

**Commit**: Branding Templates — All 5 Phases
**Files Added**: ~15 new files
**Files Modified**: 2-3 existing files
**Lines Added**: ~3,500
**Migrations**: 2 (029, 030)

For detailed deployment manifest, see `IMPLEMENTATION_COMPLETE.md`.

---

**Rollback Risk**: ✅ LOW
**Data Loss Risk**: ✅ NONE (Dev environment, backward compatible)
**Rollback Time**: ⏱️ ~20 minutes max
**Estimated Effort**: 📋 SIMPLE (1 command)

---

**Last Updated**: March 20, 2026
**Status**: Ready for deployment ✅
