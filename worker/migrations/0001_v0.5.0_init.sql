-- Migration: 0001_v0.5.0_init.sql
-- Description: Core tables for Switchroom v0.5.0 cloud projects, audio assets, upload sessions, and Better Auth

-- 1. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  owner_capability_hash TEXT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('draft', 'uploading', 'ready', 'expired', 'deleting')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private')),
  retention_days INTEGER NOT NULL CHECK(retention_days IN (1, 7, 14, 30, 60, 90)),
  crossfade_ms INTEGER NOT NULL DEFAULT 180,
  presentation_layout TEXT NOT NULL DEFAULT 'standard' CHECK(presentation_layout IN ('standard', 'player-focused', 'waveform-focused', 'compact-review')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CONSTRAINT owner_mode_check CHECK (
    (owner_user_id IS NOT NULL AND owner_capability_hash IS NULL) OR
    (owner_user_id IS NULL AND owner_capability_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_user ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_hash ON projects(owner_capability_hash);
CREATE INDEX IF NOT EXISTS idx_projects_expires_at ON projects(expires_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 2. Audio assets table
CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'edited')),
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK(status IN ('pending', 'uploading', 'ready', 'failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, role)
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_project ON audio_assets(project_id);

-- 3. Upload sessions table
CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'edited')),
  object_key TEXT NOT NULL,
  expected_size INTEGER NOT NULL,
  expected_mime TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('created', 'completed', 'cancelled', 'expired', 'failed')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_project ON upload_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);

-- 4. Better Auth tables
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE(providerId, accountId)
);

CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
