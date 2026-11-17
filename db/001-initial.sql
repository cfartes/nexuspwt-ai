CREATE TABLE IF NOT EXISTS companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS regions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies, name text NOT NULL,
 UNIQUE(company_id, id), UNIQUE(company_id, name)
);
CREATE TABLE IF NOT EXISTS units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies,
 region_id uuid, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('CDD','Fábrica','Escritório')),
 UNIQUE(company_id, id), UNIQUE(company_id, name), FOREIGN KEY(company_id,region_id) REFERENCES regions(company_id,id)
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
 phone text NOT NULL DEFAULT '', password_hash text NOT NULL, platform_admin boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
 user_id uuid NOT NULL REFERENCES users, unit_id uuid NOT NULL REFERENCES units,
 role text NOT NULL CHECK(role IN ('admin','gestor','aprovador','executante')), PRIMARY KEY(user_id,unit_id)
);
CREATE TABLE IF NOT EXISTS contractors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies,
 name text NOT NULL, cnpj text NOT NULL, UNIQUE(company_id,cnpj), UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS contractor_units (
 company_id uuid NOT NULL, contractor_id uuid NOT NULL, unit_id uuid NOT NULL,
 PRIMARY KEY(contractor_id,unit_id), FOREIGN KEY(company_id,contractor_id) REFERENCES contractors(company_id,id),
 FOREIGN KEY(company_id,unit_id) REFERENCES units(company_id,id)
);
CREATE TABLE IF NOT EXISTS approvers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies,
 unit_id uuid, region_id uuid, user_id uuid NOT NULL REFERENCES users, kind text NOT NULL CHECK(kind IN ('APR','PT')),
 profile text NOT NULL, CHECK((unit_id IS NULL) <> (region_id IS NULL)),
 FOREIGN KEY(company_id,unit_id) REFERENCES units(company_id,id),
 FOREIGN KEY(company_id,region_id) REFERENCES regions(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS approver_assignment ON approvers
 (company_id,coalesce(unit_id,region_id),kind,profile);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
 email text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, window_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
 id uuid PRIMARY KEY, company_id uuid NOT NULL, unit_id uuid NOT NULL,
 contractor_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('APR','PT')),
 number bigint GENERATED ALWAYS AS IDENTITY UNIQUE, title text NOT NULL, location text NOT NULL,
 starts_at date NOT NULL, ends_at date NOT NULL, apr_id uuid REFERENCES documents,
 apr_version integer, data jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','em_aprovacao','aprovado','rejeitado')),
 created_by uuid NOT NULL REFERENCES users, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at >= starts_at), CHECK((kind='APR' AND apr_id IS NULL) OR (kind='PT' AND apr_id IS NOT NULL)),
 FOREIGN KEY(company_id,unit_id) REFERENCES units(company_id,id),
 FOREIGN KEY(company_id,contractor_id) REFERENCES contractors(company_id,id)
);
CREATE INDEX IF NOT EXISTS documents_unit_date ON documents(unit_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS document_versions (
 document_id uuid NOT NULL REFERENCES documents, version integer NOT NULL, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,version)
);
CREATE TABLE IF NOT EXISTS approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents,
 version integer NOT NULL, profile text NOT NULL, user_id uuid NOT NULL REFERENCES users,
 decision text CHECK(decision IN ('aprovado','rejeitado')), comment text, decided_at timestamptz,
 UNIQUE(document_id,version,profile), FOREIGN KEY(document_id,version) REFERENCES document_versions
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id uuid REFERENCES documents,
 actor_id uuid NOT NULL REFERENCES users, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT now()
);
-- shortcut: fotos no banco aumentam o backup, migrar para objetos antes de ampliar o volume.
CREATE TABLE IF NOT EXISTS photos (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES documents, actor_id uuid NOT NULL REFERENCES users,
 caption text NOT NULL, captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), accuracy double precision NOT NULL CHECK(accuracy >= 0),
 mime text NOT NULL, sha256 text NOT NULL, content bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_document ON photos(document_id);
