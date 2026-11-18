ALTER TABLE memberships ADD COLUMN IF NOT EXISTS contractor_id uuid;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE memberships ADD CONSTRAINT membership_contractor_unit
    FOREIGN KEY(contractor_id,unit_id) REFERENCES contractor_units(contractor_id,unit_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE memberships ADD CONSTRAINT internal_unit_admin CHECK(role<>'admin' OR contractor_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
