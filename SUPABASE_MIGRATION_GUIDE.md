# Supabase Migration Guide — Step by Step

**Goal**: Apply 2 migrations to your Dev Supabase project
**Time**: ~2 minutes
**Risk**: LOW (Dev only, easy rollback)

---

## 🚀 Quick Start (Copy-Paste)

### Step 1: Go to Supabase Dashboard
```
https://app.supabase.com/
```

### Step 2: Select Your Dev Project
Click on your project in the dashboard

### Step 3: Open SQL Editor
- Left sidebar → **SQL Editor**
- Click **"+ New Query"** button

### Step 4: Copy Migration SQL
Copy the entire SQL code below (or from `RUN_MIGRATIONS.sql` file)

### Step 5: Paste and Run
- Paste into the SQL editor
- Click **RUN** button
- Wait for **Success** ✅

### Step 6: Verify
Run the verification queries at the bottom

---

## 📝 Complete SQL to Run

Copy everything below into Supabase SQL Editor:

```sql
-- ============================================================================
-- MIGRATION 029: Create branding_templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS branding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private'::text,
    CHECK (visibility IN ('private', 'shared_with_tenants', 'platform_published')),
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  category TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  branding_data JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  parent_template_id UUID REFERENCES branding_templates(id),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT template_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT template_data_not_empty CHECK (branding_data IS NOT NULL),
  CONSTRAINT version_positive CHECK (version > 0)
);

CREATE INDEX idx_branding_templates_visibility ON branding_templates(visibility);
CREATE INDEX idx_branding_templates_tenant_id ON branding_templates(tenant_id);
CREATE INDEX idx_branding_templates_created_by ON branding_templates(created_by);
CREATE INDEX idx_branding_templates_is_archived ON branding_templates(is_archived);
CREATE INDEX idx_branding_templates_created_at ON branding_templates(created_at DESC);

ALTER TABLE branding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage all templates"
  ON branding_templates FOR ALL
  USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('platform_super_admin', 'mysoft_support_admin'));

CREATE POLICY "Tenants can view published templates"
  ON branding_templates FOR SELECT
  USING (
    visibility = 'platform_published'
    OR (visibility = 'shared_with_tenants' AND auth.uid() IS NOT NULL)
    OR (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()) AND visibility = 'private')
  );

CREATE POLICY "Tenants can view own templates"
  ON branding_templates FOR SELECT
  USING (
    created_by = auth.uid()
    OR tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- MIGRATION 030: Extend tenant_branding for template support
-- ============================================================================

ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES branding_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allowed_template_ids UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS template_version INT,
  ADD COLUMN IF NOT EXISTS custom_branding_data JSONB,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE tenant_branding
  ADD CONSTRAINT template_version_positive CHECK (template_version IS NULL OR template_version > 0);

CREATE INDEX idx_tenant_branding_template_id ON tenant_branding(template_id);

-- ============================================================================
-- ✅ MIGRATIONS COMPLETE
-- ============================================================================
```

---

## ✅ Verification Queries

After running the migrations, run these queries one at a time to verify:

### Query 1: Check Tables Exist
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('branding_templates', 'tenant_branding')
ORDER BY table_name;
```
✅ Should return 2 rows: `branding_templates` and `tenant_branding`

### Query 2: Check New Columns on tenant_branding
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenant_branding'
  AND column_name IN ('template_id', 'allowed_template_ids', 'template_version', 'custom_branding_data', 'applied_by', 'applied_at')
ORDER BY column_name;
```
✅ Should return 6 rows (all new columns)

### Query 3: Check RLS Policies
```sql
SELECT policyname, tablename, qual
FROM pg_policies
WHERE tablename = 'branding_templates'
ORDER BY policyname;
```
✅ Should return 3 policies:
- Platform admins manage all templates
- Tenants can view published templates
- Tenants can view own templates

### Query 4: Check Indexes
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('branding_templates', 'tenant_branding')
ORDER BY indexname;
```
✅ Should return 6 indexes:
- idx_branding_templates_* (5 indexes)
- idx_tenant_branding_template_id (1 index)

---

## 🎯 Screenshots (What You'll See)

### Step 1: SQL Editor - Paste
```
┌─ SQL Editor ─────────────────────────────────────────┐
│ CREATE TABLE IF NOT EXISTS branding_templates (    │
│   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),   │
│   ...                                               │
│ ) WITH (oids = false);                              │
│                                                     │
│ [RUN] button                                        │
└─────────────────────────────────────────────────────┘
```

### Step 2: Success Message
```
┌─ Result ──────────────────────────────────────────┐
│ ✅ Query successful (completed in 245ms)          │
│                                                   │
│ 0 rows returned                                   │
└───────────────────────────────────────────────────┘
```

### Step 3: Verification Query Success
```
┌─ Result ──────────────────────────────────────────┐
│ ✅ Query successful (completed in 125ms)          │
│                                                   │
│ table_name                                        │
│ ────────────────────────────────                 │
│ branding_templates                                │
│ tenant_branding                                   │
└───────────────────────────────────────────────────┘
```

---

## ⏱️ Timing

| Step | Action | Time |
|------|--------|------|
| 1-3 | Navigate to SQL Editor | 30 sec |
| 4 | Copy SQL | 10 sec |
| 5 | Paste & Run | 10 sec |
| 6a | Query runs | 1-3 sec |
| 6b | Verify (4 queries) | 30 sec |
| **Total** | **Complete** | **~2 min** |

---

## 🆘 Troubleshooting

### Issue: "Column already exists"
This means the migration partially ran. This is OK! The `IF NOT EXISTS` clauses protect against this.
- Continue with verification queries
- Everything should still work

### Issue: "Permission denied"
You need to be logged in as a Supabase admin or project owner.
- Check you're using the right project
- Check your account permissions

### Issue: "Table does not exist"
The base table might have been deleted or renamed.
- Check `tenant_branding` table exists before running
- If not, you have a bigger issue (check backups)

### Issue: "Syntax error"
SQL might be malformed or database version incompatible.
- Copy the SQL exactly as provided
- No modifications
- If error persists, let me know the exact error message

---

## ✨ Success Indicators

After running, you should see:

✅ **Tables Created**
- `branding_templates` table exists
- `tenant_branding` table modified with 6 new columns

✅ **RLS Policies Active**
- 3 policies on `branding_templates`
- Protect against unauthorized access

✅ **Indexes Created**
- 5 indexes on `branding_templates`
- 1 index on `tenant_branding`
- Improves query performance

✅ **Backward Compatible**
- Existing branding data untouched
- Legacy columns still work
- No migration needed for existing tenants

---

## 🔄 Rollback (If Needed)

If something goes wrong:

```sql
-- Drop new table
DROP TABLE IF EXISTS branding_templates CASCADE;

-- Remove columns from tenant_branding
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS template_id;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS allowed_template_ids;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS template_version;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS custom_branding_data;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS applied_by;
ALTER TABLE tenant_branding DROP COLUMN IF EXISTS applied_at;

-- Remove constraint
ALTER TABLE tenant_branding DROP CONSTRAINT IF EXISTS template_version_positive;
```

See `ROLLBACK_PLAN.md` for full details.

---

## 📊 What Gets Deployed

After migrations:

✅ **branding_templates table** — stores immutable templates
✅ **tenant_branding extension** — links tenants to templates
✅ **RLS policies** — protects data by role
✅ **Indexes** — query performance
✅ **Backward compatibility** — existing branding still works

---

## 🎉 Next Steps After Successful Migration

1. ✅ Vercel auto-deploys from GitHub (in progress)
2. ✅ Test `/platform/branding-templates/` page
3. ✅ Create a test template
4. ✅ Apply to test tenant
5. ✅ Verify dashboard shows branding
6. ✅ Monitor logs for 24 hours

---

**Ready?**
1. Go to https://app.supabase.com/
2. Copy the SQL above
3. Paste into SQL Editor
4. Click RUN
5. Done! ✅

Questions? See BRANDING_TEMPLATES_GUIDE.md for full documentation.
