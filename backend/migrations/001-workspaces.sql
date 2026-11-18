CREATE TABLE cardboard.schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cardboard.workspaces (
  clerk_user_id TEXT PRIMARY KEY CHECK (length(btrim(clerk_user_id)) > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
