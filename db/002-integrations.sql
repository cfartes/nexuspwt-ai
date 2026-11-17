CREATE TABLE IF NOT EXISTS company_integrations (
  company_id uuid NOT NULL REFERENCES companies,
  service text NOT NULL CHECK(service IN ('signature','whatsapp')),
  provider text NOT NULL CHECK(provider IN ('docusign','certisign','openwa')),
  settings jsonb NOT NULL DEFAULT '{}',
  secret_ciphertext text,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,service),
  CHECK((service='signature' AND provider IN ('docusign','certisign')) OR (service='whatsapp' AND provider='openwa'))
);
