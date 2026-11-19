ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS unit_id uuid;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS unit_name text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_name text;

-- Preserve the original scope even after a unit or membership is removed.
CREATE OR REPLACE FUNCTION scope_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  context_unit uuid;
  context_company uuid;
  context_name text;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF NEW.actor_name IS NULL THEN
    SELECT CASE WHEN platform_admin THEN 'Suporte da plataforma' ELSE name END
      INTO NEW.actor_name FROM users WHERE id=NEW.actor_id;
  END IF;
  IF NEW.company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.document_id IS NOT NULL THEN
    SELECT company_id,unit_id INTO NEW.company_id,NEW.unit_id FROM documents WHERE id=NEW.document_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.details->>'companyId' ~ uuid_pattern THEN
    NEW.company_id := (NEW.details->>'companyId')::uuid;
  END IF;
  IF NEW.unit_id IS NULL AND NEW.details->>'unitId' ~ uuid_pattern THEN
    context_unit := (NEW.details->>'unitId')::uuid;
  ELSIF NEW.unit_id IS NOT NULL THEN
    context_unit := NEW.unit_id;
  ELSIF NEW.details->>'invitationId' ~ uuid_pattern THEN
    SELECT unit_id INTO context_unit FROM user_invitations WHERE id=(NEW.details->>'invitationId')::uuid;
  END IF;
  SELECT company_id,name INTO context_company,context_name FROM units WHERE id=context_unit;
  IF NEW.company_id IS NULL THEN NEW.company_id := context_company; END IF;
  IF NEW.company_id IS NOT NULL AND (context_company IS NULL OR context_company=NEW.company_id) THEN
    NEW.unit_id := context_unit;
    NEW.unit_name := COALESCE(context_name,
      CASE WHEN NEW.action='cadastro.excluido' AND NEW.details->>'kind'='unit' THEN NEW.details->>'name' END);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_event_scope ON audit_events;
CREATE TRIGGER audit_event_scope BEFORE INSERT OR UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION scope_audit_event();
UPDATE audit_events SET actor_name=actor_name WHERE company_id IS NULL OR actor_name IS NULL;
DROP TRIGGER audit_event_scope ON audit_events;
CREATE TRIGGER audit_event_scope BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION scope_audit_event();

CREATE INDEX IF NOT EXISTS audit_company_recent ON audit_events(company_id,id DESC);
CREATE INDEX IF NOT EXISTS audit_company_unit_recent ON audit_events(company_id,unit_id,id DESC);
