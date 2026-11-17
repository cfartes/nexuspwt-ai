CREATE TABLE IF NOT EXISTS notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL,
 version integer NOT NULL,
 user_id uuid NOT NULL REFERENCES users,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','blocked','sending','sent','uncertain','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 sent_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 recipient_hint text,
 UNIQUE(document_id,version,user_id),
 FOREIGN KEY(document_id,version) REFERENCES document_versions(document_id,version)
);
CREATE INDEX IF NOT EXISTS notification_dispatch ON notification_outbox(status,available_at);
CREATE INDEX IF NOT EXISTS notification_started ON notification_outbox(started_at DESC) WHERE started_at IS NOT NULL;
