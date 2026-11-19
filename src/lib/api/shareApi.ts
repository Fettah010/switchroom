// Typed API client for Switchroom v0.6.0 client sharing.
//
// All endpoints are same-origin and send credentials (Better Auth / guest /
// share grant cookies). Errors follow the repository's error envelope and are
// surfaced as ShareApiError with the server's error code and status.
import type { ProjectVisibility } from '../../features/cloud/cloudTypes';
import { CloudApiError } from './cloudApi';

export class ShareApiError extends CloudApiError {
  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(code, message, status, details);
    this.name = 'ShareApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include', // Share grant cookie and same-origin session
  });

  if (!response.ok) {
    let errBody: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    try {
      errBody = await response.json();
    } catch {
      errBody = { error: { message: `Request failed with status ${response.status}` } };
    }
    const code = errBody?.error?.code || 'UNKNOWN_ERROR';
    const message = errBody?.error?.message || response.statusText || 'Request failed';
    throw new ShareApiError(code, message, response.status, errBody?.error?.details);
  }

  const contentType = response.headers.get('content-type');
  if (response.status === 204 || !contentType?.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

export interface ShareAccessResponse {
  project: {
    title: string;
    description: string;
    original: { label: string; durationMs?: number | null };
    edited: { label: string; durationMs?: number | null };
    expiresAt: number;
  };
  capabilities: {
    listen: boolean;
    feedback: boolean;
    downloads: boolean;
  };
  access: {
    passwordRequired: boolean;
    linkExpiresAt: number | null;
  };
}

export interface SharePlaybackResponse {
  url: string;
  expiresAt: number;
  mimeType: string;
  sizeBytes: number;
}

export interface ShareLinkSummary {
  id: string;
  kind: 'primary' | 'invite';
  scope: 'listen';
  label: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  active: boolean;
}

export interface ShareLinksResponse {
  project: {
    id: string;
    title: string;
    visibility: ProjectVisibility;
    public_indexing_enabled: boolean;
    expires_at: number;
  };
  passwordAvailable: boolean;
  links: ShareLinkSummary[];
}

export interface CreateLinkParams {
  kind?: 'primary' | 'invite';
  expiresAt?: number | null;
  label?: string | null;
}

export interface CreateLinkResponse {
  url: string;
  link: ShareLinkSummary;
}

export interface UpdateSharingParams {
  visibility?: ProjectVisibility;
  public_indexing_enabled?: boolean;
  password?: string | null;
}

/** Resolves a share token to safe review-page metadata and capabilities. */
export async function getShareAccess(token: string): Promise<ShareAccessResponse> {
  return request<ShareAccessResponse>(`/api/share/${encodeURIComponent(token)}/access`);
}

/** Verifies a share password and issues a short-lived link-scoped grant cookie. */
export async function sharePassword(token: string, password: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/share/${encodeURIComponent(token)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

/** Issues a short-lived playback URL for an authorised asset role. */
export async function getSharePlayback(
  token: string,
  role: 'original' | 'edited',
): Promise<SharePlaybackResponse> {
  return request<SharePlaybackResponse>(
    `/api/share/${encodeURIComponent(token)}/playback/${encodeURIComponent(role)}`,
  );
}

/** Lists safe link metadata for an owner-managed project. */
export async function listShareLinks(projectId: string): Promise<ShareLinksResponse> {
  return request<ShareLinksResponse>(`/api/projects/${encodeURIComponent(projectId)}/links`);
}

/** Creates or rotates a primary link, or creates a private invite link. */
export async function createShareLink(
  projectId: string,
  params: CreateLinkParams,
): Promise<CreateLinkResponse> {
  return request<CreateLinkResponse>(`/api/projects/${encodeURIComponent(projectId)}/links`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Revokes a specific link idempotently. */
export async function revokeShareLink(
  projectId: string,
  linkId: string,
): Promise<{
  link: ShareLinkSummary;
}> {
  return request<{ link: ShareLinkSummary }>(
    `/api/projects/${encodeURIComponent(projectId)}/links/${encodeURIComponent(linkId)}`,
    { method: 'DELETE' },
  );
}

/** Updates sharing settings: visibility, indexing, password. */
export async function updateSharing(
  projectId: string,
  params: UpdateSharingParams,
): Promise<{ project: ShareLinksResponse['project'] }> {
  return request<{ project: ShareLinksResponse['project'] }>(
    `/api/projects/${encodeURIComponent(projectId)}/sharing`,
    { method: 'PATCH', body: JSON.stringify(params) },
  );
}
