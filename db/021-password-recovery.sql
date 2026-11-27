CREATE TABLE IF NOT EXISTS password_recovery_limits (
 bucket text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS password_recoveries (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), recipient text NOT NULL,
 token_hash text NOT NULL UNIQUE, token_ciphertext text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 consumed_at timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','sending','sent','uncertain','cancelled')),
 available_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, last_error text
);
CREATE INDEX IF NOT EXISTS password_recoveries_user ON password_recoveries(user_id,created_at);
CREATE INDEX IF NOT EXISTS password_recoveries_pending ON password_recoveries(available_at) WHERE status IN ('pending','blocked');
