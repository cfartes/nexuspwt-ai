ALTER TABLE audit_events ALTER COLUMN actor_id DROP NOT NULL;
CREATE TABLE IF NOT EXISTS contractor_registrations (
 id uuid PRIMARY KEY, company_id uuid NOT NULL, unit_id uuid NOT NULL,
 email text NOT NULL, created_by uuid NOT NULL REFERENCES users,
 token_hash text NOT NULL UNIQUE, token_ciphertext text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','submitted','changes_requested','approved')),
 payload_ciphertext text, card_ciphertext text, card_mime text, card_hash text,
 card_retain_until timestamptz,
 version integer NOT NULL DEFAULT 1, reason text, reviewed_by uuid REFERENCES users,
 contractor_id uuid REFERENCES contractors, submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sending','sent','blocked','uncertain','cancelled')),
 delivery_started_at timestamptz, delivery_error text, available_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,unit_id) REFERENCES units(company_id,id)
);
CREATE INDEX IF NOT EXISTS contractor_registrations_unit ON contractor_registrations(unit_id,created_at DESC);
CREATE INDEX IF NOT EXISTS contractor_registrations_delivery ON contractor_registrations(available_at) WHERE delivery_status IN ('pending','blocked');
CREATE TABLE IF NOT EXISTS contractor_registration_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL REFERENCES contractor_registrations,
 mime text NOT NULL, sha256 text NOT NULL, content_ciphertext text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), retain_until timestamptz NOT NULL DEFAULT now()+interval '5 years'
);
