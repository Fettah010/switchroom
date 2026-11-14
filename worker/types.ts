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
}

export type ProjectStatus = 'draft' | 'uploading' | 'ready' | 'expired' | 'deleting';
export type ProjectVisibility = 'private';
export type RetentionDays = 1 | 7 | 14 | 30 | 60 | 90;
export type AssetRole = 'original' | 'edited';
export type AssetStatus = 'pending' | 'uploading' | 'ready' | 'failed';
export type UploadSessionStatus = 'created' | 'completed' | 'cancelled' | 'expired' | 'failed';

export interface ProjectRow {
  id: string;
  owner_user_id: string | null;
  owner_capability_hash: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  retention_days: RetentionDays;
  crossfade_ms: number;
  presentation_layout: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
  deleted_at: number | null;
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
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type OwnerContext =
  { mode: 'user'; userId: string } | { mode: 'guest'; projectId: string; capabilityHash: string };
