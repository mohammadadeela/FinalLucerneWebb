CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id integer,
  user_name text NOT NULL,
  user_role text NOT NULL,
  action text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  entity_type text,
  entity_id text,
  entity_name text,
  details jsonb,
  status integer NOT NULL,
  ip text
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
