// Worker runtime environment and database types for Switchroom v0.5.0

export interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ASSETS?: Fetcher;
  APP_ENV?: string;
  SHARING_PASSWORD_PROTECTION_ENABLED?: string;
}

export type ProjectStatus = 'draft' | 'uploading' | 'ready' | 'expired' | 'deleting';
export type ProjectVisibility = 'public' | 'unlisted' | 'private';
export type RetentionDays = 1 | 7 | 14 | 30 | 60 | 90;
export type AssetRole = 'original' | 'edited';
export type AssetStatus = 'pending' | 'uploading' | 'ready' | 'failed';
export type UploadSessionStatus = 'created' | 'completed' | 'cancelled' | 'expired' | 'failed';
export type ShareLinkKind = 'primary' | 'invite';
export type ShareScope = 'listen';

export interface ProjectRow {
  id: string;
  owner_user_id: string | null;
  owner_capability_hash: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  /** Legacy v0.5 column; remains private due to its original CHECK constraint. */
  visibility: 'private';
  /** Authoritative v0.6 visibility setting. */
  sharing_visibility: ProjectVisibility;
  retention_days: RetentionDays;
  crossfade_ms: number;
  presentation_layout: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
  deleted_at: number | null;
  public_indexing_enabled: number;
  password_hash: string | null;
}

export interface ShareLinkRow {
  id: string;
  project_id: string;
  token_hash: string;
  kind: ShareLinkKind;
  scope: ShareScope;
  label: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_used_at: number | null;
}

export interface ShareAccessResult {
  project: ProjectRow;
  link: ShareLinkRow;
  capabilities: {
    listen: boolean;
    feedback: boolean;
    downloads: boolean;
  };
  passwordRequired: boolean;
  linkExpiresAt: number | null;
}

export interface PlaybackUrlResult {
  url: string;
  expiresAt: number;
  mimeType: string;
  sizeBytes: number;
}

export interface AudioAssetRow {
  id: string;
  project_id: string;
  role: AssetRole;
  object_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  status: AssetStatus;
  created_at: number;
  updated_at: number;
}

export interface UploadSessionRow {
  id: string;
  project_id: string;
  role: AssetRole;
  object_key: string;
  expected_size: number;
  expected_mime: string;
  status: UploadSessionStatus;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PROJECT_EXPIRED'
  | 'PROJECT_NOT_READY'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_MEDIA'
  | 'FILE_TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'UPLOAD_SESSION_EXPIRED'
  | 'UPLOAD_NOT_FOUND'
  | 'UPLOAD_VERIFICATION_FAILED'
  | 'STORAGE_UNAVAILABLE'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'LINK_UNAVAILABLE'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_INVALID'
  | 'TOO_MANY_ATTEMPTS'
  | 'SHARING_DISABLED'
  | 'INVALID_ROLE';

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type OwnerContext =
  { mode: 'user'; userId: string } | { mode: 'guest'; projectId: string; capabilityHash: string };

export interface SharingSettings {
  visibility: ProjectVisibility;
  public_indexing_enabled: boolean;
  passwordAvailable: boolean;
  feedback_enabled: boolean;
  downloads_enabled: boolean;
}
