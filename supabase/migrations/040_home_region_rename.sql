-- Rename region → home_region to signal it is a durable governance property
ALTER TABLE tenants RENAME COLUMN region TO home_region;

-- Immutability trigger: prevent casual region changes post-creation
CREATE OR REPLACE FUNCTION prevent_home_region_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.home_region IS NOT NULL AND NEW.home_region <> OLD.home_region THEN
    RAISE EXCEPTION 'home_region is immutable. Region changes require a managed migration process.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_home_region_immutability
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION prevent_home_region_change();
