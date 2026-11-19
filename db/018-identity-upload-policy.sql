ALTER TABLE companies ADD COLUMN IF NOT EXISTS identity_upload_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS identity_policy_version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS identity_submission_person_company
 ON executor_identity_submissions(company_id,user_id,contractor_id,submitted_at DESC,id DESC);
