-- Migration: 0002_v0.6.0_sharing.sql
-- Add v0.6 share metadata without rebuilding projects. The legacy `visibility`
-- column has a v0.5 CHECK constraint allowing only `private` and is retained
-- unchanged for backward compatibility. `sharing_visibility` is authoritative
-- for v0.6 access and defaults every existing project to private.

ALTER TABLE projects ADD COLUMN sharing_visibility TEXT NOT NULL DEFAULT 'private'
  CHECK(sharing_visibility IN ('public', 'unlisted', 'private'));
ALTER TABLE projects ADD COLUMN password_hash TEXT;
ALTER TABLE projects ADD COLUMN public_indexing_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('primary', 'invite')),
  scope TEXT NOT NULL DEFAULT 'listen' CHECK(scope IN ('listen')),
  label TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_share_links_token_hash ON share_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_share_links_project_id ON share_links(project_id);
CREATE INDEX IF NOT EXISTS idx_share_links_kind_scope ON share_links(kind, scope);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_revoked ON share_links(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS password_attempts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  attempt_key_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until_at INTEGER,
  first_attempt_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_attempts_project_key ON password_attempts(project_id, attempt_key_hash);
CREATE INDEX IF NOT EXISTS idx_password_attempts_locked_until ON password_attempts(locked_until_at);

CREATE TABLE IF NOT EXISTS share_password_grants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  grant_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_password_grants_hash ON share_password_grants(grant_hash);
CREATE INDEX IF NOT EXISTS idx_share_password_grants_link ON share_password_grants(link_id);
CREATE INDEX IF NOT EXISTS idx_share_password_grants_expires_at ON share_password_grants(expires_at);
