ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authenticated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS factor_enabled_at timestamptz;
UPDATE sessions SET expires_at=LEAST(expires_at,authenticated_at+interval '8 hours');
