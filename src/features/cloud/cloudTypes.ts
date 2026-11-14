// Cloud Project and Upload Types for Switchroom v0.5.0 Frontend

import type { PresentationLayout } from '../../workspaces/workspaceTypes';

export type RetentionDays = 1 | 7 | 14 | 30 | 60 | 90;
export type AssetRole = 'original' | 'edited';
export type AssetStatus = 'pending' | 'uploading' | 'ready' | 'failed';
export type CloudProjectStatus = 'draft' | 'uploading' | 'ready' | 'expired' | 'deleting';

export interface CloudAsset {
  id?: string;
  role: AssetRole;
  filename: string;
  size_bytes: number;
  mime_type?: string;
  duration_ms?: number | null;
  status: AssetStatus;
}

export interface CloudProject {
  id: string;
  title: string;
  description: string;
  status: CloudProjectStatus;
  visibility: 'private';
  retention_days: RetentionDays;
  crossfade_ms: number;
  presentation_layout: PresentationLayout;
  created_at: number;
  updated_at: number;
  expires_at: number;
  isGuestOwned?: boolean;
  assets: {
    original: CloudAsset | null;
    edited: CloudAsset | null;
  };
}

export interface AuthProvidersInfo {
  guest: boolean;
  github: boolean;
  google: boolean;
  authAvailable: boolean;
}

export interface AuthUserInfo {
  id: string;
  email: string;
  name: string;
}

export interface StoredGuestProject {
  id: string;
  title: string;
  createdAt: number;
}

export interface UploadProgressState {
  role: AssetRole;
  filename: string;
  sizeBytes: number;
  bytesUploaded: number;
  status: 'preparing' | 'pending' | 'uploading' | 'verifying' | 'ready' | 'failed' | 'cancelled';
  error?: string | null;
}
