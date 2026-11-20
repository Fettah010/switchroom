-- Migration: 0003_v0.7.0_feedback_and_multipart.sql
-- Description: Client feedback (participants, preferred votes, comments/replies) and resumable multipart upload tracking for Switchroom v0.7.0

-- 1. Project-level feedback and downloads permissions
ALTER TABLE projects ADD COLUMN feedback_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN downloads_enabled INTEGER NOT NULL DEFAULT 0;

-- 2. Participants table for project-scoped client/creator identities
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  guest_token_hash TEXT,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  CONSTRAINT participant_identity_check CHECK (
    (user_id IS NOT NULL AND guest_token_hash IS NULL) OR
    (user_id IS NULL AND guest_token_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_participants_project ON participants(project_id);
CREATE INDEX IF NOT EXISTS idx_participants_guest_hash ON participants(project_id, guest_token_hash);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(project_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_project_user ON participants(project_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_project_guest ON participants(project_id, guest_token_hash) WHERE guest_token_hash IS NOT NULL;

-- 3. Preferred version votes table
CREATE TABLE IF NOT EXISTS preferred_votes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK(choice IN ('original', 'edited')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_preferred_votes_project ON preferred_votes(project_id);

-- 4. Timestamped comments and single-level replies
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  timestamp_ms INTEGER,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(project_id, created_at);

-- 5. Multipart upload session metadata and storage reservations
ALTER TABLE upload_sessions ADD COLUMN strategy TEXT NOT NULL DEFAULT 'single_put';
ALTER TABLE upload_sessions ADD COLUMN multipart_upload_id TEXT;
ALTER TABLE upload_sessions ADD COLUMN part_size INTEGER;
ALTER TABLE upload_sessions ADD COLUMN total_parts INTEGER;
ALTER TABLE upload_sessions ADD COLUMN reserved_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_reserved ON upload_sessions(status, expires_at, reserved_bytes);

-- 6. Server-tracked verified parts for resumable multipart uploads
CREATE TABLE IF NOT EXISTS upload_parts (
  id TEXT PRIMARY KEY,
  upload_session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(upload_session_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_upload_parts_session ON upload_parts(upload_session_id);
