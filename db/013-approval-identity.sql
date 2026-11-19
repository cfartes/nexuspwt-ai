ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_mfa_required boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS security_version integer NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS identity_verified_by uuid REFERENCES users(id);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS identity_snapshot jsonb;
CREATE TABLE IF NOT EXISTS user_security (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 secret_ciphertext text, enabled_at timestamptz, last_step bigint NOT NULL DEFAULT -1,
 pending_ciphertext text, pending_expires_at timestamptz,
 failures integer NOT NULL DEFAULT 0, window_at timestamptz NOT NULL DEFAULT now(),
 cpf_hash text UNIQUE, cpf_ciphertext text, cpf_last4 text
);
