ALTER TABLE users ADD COLUMN IF NOT EXISTS password_pending boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS email_gateway (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  sender text NOT NULL,
  secret_ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_invitations_user_idx ON user_invitations(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS invitation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES user_invitations(id),
  channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','sending','sent','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invitation_id,channel)
);
CREATE INDEX IF NOT EXISTS invitation_deliveries_queue_idx ON invitation_deliveries(status,available_at);
