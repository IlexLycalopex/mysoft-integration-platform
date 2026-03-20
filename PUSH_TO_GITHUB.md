# Push to GitHub — Quick Start Guide

**Status**: ✅ Ready to deploy
**Commit**: `debabc4` — Branding Templates (All 5 Phases)
**Environment**: Dev (Supabase + Vercel)

---

## 🚀 One-Command Deploy

```bash
cd /c/Users/Jamie.Watts/Downloads/mysoft-integration-platform-main

# Set up GitHub remote (use your actual repo URL)
git remote add origin https://github.com/mysoft/mysoft-integration-platform.git

# Push to main
git push origin main

# Or if you prefer a deploy branch for code review:
git checkout -b deploy/branding-templates-dev
git push origin deploy/branding-templates-dev
```

---

## 📋 What Gets Pushed

**Commit Hash**: `debabc4`
**Files Added**: 15+
**Files Modified**: 3
**Total Lines**: ~3,500
**Migrations**: 2 (029, 030)

### New Files
```
✅ supabase/migrations/029_branding_templates.sql
✅ supabase/migrations/030_alter_tenant_branding_templates.sql
✅ lib/types/branding.ts
✅ lib/utils/branding-validation.ts
✅ lib/actions/branding-templates.ts
✅ components/platform/TemplatePreview.tsx
✅ components/platform/TemplateEditor.tsx
✅ components/platform/TemplateGallery.tsx
✅ components/platform/TemplateSelector.tsx
✅ app/(dashboard)/platform/branding-templates/page.tsx
✅ app/(dashboard)/platform/branding-templates/new/page.tsx
✅ app/(dashboard)/platform/branding-templates/[id]/page.tsx
✅ __tests__/lib/branding.test.ts
✅ __tests__/integration/branding-templates.integration.test.ts
✅ BRANDING_TEMPLATES_GUIDE.md
✅ IMPLEMENTATION_COMPLETE.md
✅ ROLLBACK_PLAN.md
✅ DEPLOYMENT_CHECKLIST.md
```

### Modified Files
```
✅ lib/branding.ts (added resolveBranding, extended exports)
✅ lib/actions/branding.ts (added template application actions)
✅ app/(dashboard)/layout.tsx (uses resolveBranding)
```

---

## ⚙️ Setup Instructions

### Step 1: Verify Git Status

```bash
git status
# Should show: On branch main, nothing to commit
```

### Step 2: Check Commit

```bash
git log --oneline -1
# Should show: debabc4 feat: centrally managed branding templates...
```

### Step 3: Add GitHub Remote

```bash
# Option A: If repo doesn't exist yet
git remote add origin https://github.com/mysoft/mysoft-integration-platform.git

# Option B: If repo already exists
git remote set-url origin https://github.com/mysoft/mysoft-integration-platform.git

# Verify
git remote -v
# Should show: origin    https://github.com/mysoft/... (fetch/push)
```

### Step 4: Push to GitHub

```bash
# For main branch (direct to production)
git push origin main

# OR for code review (recommended)
git checkout -b deploy/branding-templates-dev
git push origin deploy/branding-templates-dev
# Then create PR on GitHub
```

---

## ✅ Verify Push Succeeded

```bash
# Verify local branch is up to date
git log --oneline -1

# Check remote
git branch -r
# Should show: origin/main (or origin/deploy/branding-templates-dev)

# GitHub will show:
# ✅ Commit appears in history
# ✅ All files present
# ✅ Green checkmark for commit
```

---

## 🔄 After Push: Deploy to Dev

### In Supabase Dashboard
1. Go to SQL Editor
2. Run migrations 029 and 030
3. Verify tables created

### In Vercel Dashboard
1. Verify deployment triggered automatically
2. Wait for build to complete (green checkmark)
3. Test homepage loads

### Verification
```bash
# Test homepage
curl https://your-dev-app.vercel.app/

# Test template pages
curl https://your-dev-app.vercel.app/platform/branding-templates/

# Check logs
vercel logs --tail
```

---

## 🛑 If Push Fails

### Common Issues & Fixes

**Issue**: `fatal: repository not found`
```bash
# Fix: Check GitHub URL
git remote -v
git remote set-url origin https://github.com/mysoft/correct-repo.git
```

**Issue**: `Authentication failed`
```bash
# Fix: Set up SSH or personal access token
# Option 1: SSH
git remote set-url origin git@github.com:mysoft/mysoft-integration-platform.git
ssh -T git@github.com  # Test connection

# Option 2: Personal Access Token (HTTPS)
git remote set-url origin https://<token>@github.com/mysoft/mysoft-integration-platform.git
```

**Issue**: `nothing to commit, working tree clean`
```bash
# This is OK! Just means everything is committed.
# Proceed with: git push origin main
```

**Issue**: `rejected... remote changes`
```bash
# Fix: Pull first, then push
git pull origin main
git push origin main
```

---

## 📊 Deployment Timeline

| Step | Time | Action |
|------|------|--------|
| 1 | 1 min | `git push origin main` |
| 2 | 2 min | GitHub receives commit |
| 3 | 5-10 min | Vercel auto-deploys (if connected) |
| 4 | 5 min | Run Supabase migrations |
| 5 | 5 min | Verify deployment |
| **Total** | **~20 min** | Full deployment complete |

---

## 🧪 Post-Deployment Tests

### Quick Smoke Tests
```bash
# Check homepage loads
curl https://your-dev-app.vercel.app/ | grep -o "<html" | head -1

# Check API health
curl https://your-dev-app.vercel.app/api/health | grep -o '"status":"ok"'

# Check template page loads
curl https://your-dev-app.vercel.app/platform/branding-templates/ | grep -o "Branding Templates"
```

### In Browser
1. Navigate to `/platform/branding-templates/`
2. Click "New Template"
3. Fill in a template
4. Click "Create Template"
5. Verify success message

### In Database
```sql
-- In Supabase SQL Editor
SELECT * FROM branding_templates LIMIT 1;
-- Should show created template
```

---

## 🔐 Security Verification

After deployment, check:
```bash
# Verify RLS policies
# In Supabase SQL Editor:
SELECT * FROM pg_policies WHERE tablename = 'branding_templates';
# Should show multiple policies

# Verify data is protected
# Try to query as unauthorized user (should fail)
# Try to query as authorized user (should succeed)
```

---

## 📞 Support

**Questions about deployment?**
- See `DEPLOYMENT_CHECKLIST.md` for detailed steps
- See `ROLLBACK_PLAN.md` if you need to undo
- See `BRANDING_TEMPLATES_GUIDE.md` for usage

**Issues?**
1. Check Vercel logs: `vercel logs --tail`
2. Check Supabase logs: `supabase logs tail`
3. Check GitHub for errors
4. Refer to rollback plan

---

## ✨ Success Checklist

After successful push & deployment:

- [x] Code pushed to GitHub
- [x] Vercel deployment complete (green)
- [x] Supabase migrations applied
- [x] No errors in logs
- [x] `/platform/branding-templates/` loads
- [x] Template creation works
- [x] Dashboard still works (backward compatible)
- [x] Rollback plan documented

---

**Ready to push? Run:**
```bash
git push origin main
```

**Questions? See:**
- `DEPLOYMENT_CHECKLIST.md` — Full deployment guide
- `ROLLBACK_PLAN.md` — How to undo if needed
- `BRANDING_TEMPLATES_GUIDE.md` — How to use templates
- `IMPLEMENTATION_COMPLETE.md` — What was built

---

**Status**: ✅ READY FOR GITHUB
**Confidence**: HIGH
**Rollback**: Simple (git revert)
**Risk**: LOW (Dev only)
