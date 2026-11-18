CREATE TABLE IF NOT EXISTS whatsapp_gateway (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  base_url text NOT NULL,
  secret_ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
