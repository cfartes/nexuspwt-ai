ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS identity_document_required boolean NOT NULL DEFAULT false;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK(role IN ('admin','gestor','aprovador','seguranca_trabalho','executante','admin_contratada'));
DO $$ BEGIN
  ALTER TABLE memberships ADD CONSTRAINT contractor_manager_scope CHECK(role<>'admin_contratada' OR contractor_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS executor_identity_submissions (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies, unit_id uuid NOT NULL,
 contractor_id uuid NOT NULL REFERENCES contractors, user_id uuid NOT NULL REFERENCES users,
 document_type text NOT NULL CHECK(document_type IN ('RG','CNH','Passaporte')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 identity_snapshot jsonb NOT NULL, submitted_by uuid NOT NULL REFERENCES users,
 submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users,
 reviewed_at timestamptz, reason text, version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS executor_identity_unit ON executor_identity_submissions(company_id,unit_id,user_id,submitted_at DESC);
CREATE TABLE IF NOT EXISTS executor_identity_files (
 id uuid PRIMARY KEY, submission_id uuid NOT NULL REFERENCES executor_identity_submissions,
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','application/pdf')),
 sha256 text NOT NULL, content_ciphertext text NOT NULL,
 retain_until timestamptz NOT NULL DEFAULT now()+interval '5 years'
);
CREATE INDEX IF NOT EXISTS executor_identity_files_submission ON executor_identity_files(submission_id);
