DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='companies' AND column_name='unit_limit') THEN
    ALTER TABLE companies ADD COLUMN unit_limit integer NOT NULL DEFAULT 1 CHECK(unit_limit>=1);
    UPDATE companies c SET unit_limit=GREATEST(1,(SELECT count(*)::integer FROM units u WHERE u.company_id=c.id));
  END IF;
END $$;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS unit_limit_version integer NOT NULL DEFAULT 1;
