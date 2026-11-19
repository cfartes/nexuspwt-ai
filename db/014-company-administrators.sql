CREATE TABLE IF NOT EXISTS company_admins (
 company_id uuid NOT NULL REFERENCES companies(id),
 user_id uuid NOT NULL REFERENCES users(id),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(company_id,user_id)
);
