-- Migration 026: Per-user Intacct entity restrictions
-- When set, a user may only upload to (or configure watchers for) entities in this list.
-- NULL means unrestricted — the user may use any entity their tenant has access to.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS allowed_entity_ids text[];

COMMENT ON COLUMN user_profiles.allowed_entity_ids IS
  'When non-NULL, restricts this user to the listed Intacct entity IDs. '
  'NULL = unrestricted (can use any entity). '
  'Enforced by upload and watcher creation actions.';
