ALTER TABLE documents ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES users(id);
