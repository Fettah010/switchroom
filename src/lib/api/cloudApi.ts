// Typed API Client for Switchroom v0.5.0 Cloud Integration

import type {
  AssetRole,
  AuthProvidersInfo,
  AuthUserInfo,
  CloudProject,
  RetentionDays,
} from '../../features/cloud/cloudTypes';
import type { PresentationLayout } from '../../workspaces/workspaceTypes';

export class CloudApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'CloudApiError';
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
    credentials: 'include', // Include Better Auth & guest cookies
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
    throw new CloudApiError(code, message, response.status, errBody?.error?.details);
  }

  // If 204 or no content
  const contentType = response.headers.get('content-type');
  if (response.status === 204 || !contentType?.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

/** Fetches available OAuth and guest auth providers configured on the server */
export async function getAuthProviders(): Promise<AuthProvidersInfo> {
  try {
    return await request<AuthProvidersInfo>('/api/auth/providers');
  } catch {
    return { guest: true, github: false, google: false, authAvailable: false };
  }
}

/** Fetches currently authenticated user if session exists */
export async function getCurrentUser(): Promise<AuthUserInfo | null> {
  try {
    const res = await request<{ user: AuthUserInfo | null }>('/api/auth/me');
    return res.user;
  } catch {
    return null;
  }
}

/** Lists active cloud projects owned by the signed-in account */
export async function listUserProjects(): Promise<CloudProject[]> {
  const res = await request<{ projects: CloudProject[] }>('/api/projects');
  return res.projects;
}

/** Fetches project status summaries for a batch of IDs (guest local browser index) */
export async function listBatchProjects(projectIds: string[]): Promise<CloudProject[]> {
  if (projectIds.length === 0) return [];
  const res = await request<{ projects: CloudProject[] }>('/api/projects/batch', {
    method: 'POST',
    body: JSON.stringify({ projectIds }),
  });
  return res.projects;
}

export interface CreateProjectPayload {
  title: string;
  description?: string;
  retentionDays?: RetentionDays;
  crossfadeMs?: number;
  presentationLayout?: PresentationLayout;
}

export interface CreateProjectResponse {
  project: CloudProject;
  guestCapability?: string;
  recoveryUrl?: string;
}

/** Creates a new cloud project */
export async function createCloudProject(
  payload: CreateProjectPayload,
): Promise<CreateProjectResponse> {
  return request<CreateProjectResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Retrieves a single cloud project by ID with owner access */
export async function getCloudProject(projectId: string): Promise<CloudProject> {
  const res = await request<{ project: CloudProject }>([`/api/projects/${projectId}`].join(''));
  return res.project;
}

/** Updates metadata or retention for a project */
export async function updateCloudProject(
  projectId: string,
  updates: Partial<CreateProjectPayload>,
): Promise<CloudProject> {
  const res = await request<{ project: CloudProject }>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.project;
}

/** Deletes a project and its R2 audio assets */
export async function deleteCloudProject(projectId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
}

/** Exchanges a guest owner secret capability for an owner session cookie */
export async function exchangeGuestCapability(
  projectId: string,
  capability: string,
): Promise<CloudProject> {
  const res = await request<{ success: boolean; project: CloudProject }>(
    `/api/projects/${projectId}/owner-access`,
    {
      method: 'POST',
      body: JSON.stringify({ capability }),
    },
  );
  return res.project;
}

/** Claims a guest project into an authenticated account */
export async function claimGuestProject(
  projectId: string,
  capability?: string,
): Promise<CloudProject> {
  const res = await request<{ success: boolean; project: CloudProject }>(
    `/api/projects/${projectId}/claim`,
    {
      method: 'POST',
      body: JSON.stringify({ capability }),
    },
  );
  return res.project;
}

export interface InitUploadParams {
  projectId: string;
  role: AssetRole;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  durationMs?: number | null;
}

export interface InitUploadResponse {
  uploadSessionId: string;
  uploadUrl: string;
  objectKey: string;
  role: AssetRole;
  expiresAt: number;
}

/** Initializes an upload session and returns a short-lived presigned PUT URL */
export async function initUploadSession(params: InitUploadParams): Promise<InitUploadResponse> {
  return request<InitUploadResponse>('/api/uploads/init', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Completes an upload session after the browser finishes PUT */
export async function completeUploadSession(uploadSessionId: string): Promise<{
  success: boolean;
  projectStatus: string;
}> {
  return request<{ success: boolean; projectStatus: string }>(
    `/api/uploads/${uploadSessionId}/complete`,
    {
      method: 'POST',
    },
  );
}

/** Cancels an upload session */
export async function cancelUploadSession(uploadSessionId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/uploads/${uploadSessionId}/cancel`, {
    method: 'POST',
  });
}

export interface PlaybackInfoResponse {
  playbackUrl: string;
  role: AssetRole;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: number;
}

/** Obtains an owner-authorized temporary playback URL */
export async function getPlaybackInfo(
  projectId: string,
  role: AssetRole,
): Promise<PlaybackInfoResponse> {
  return request<PlaybackInfoResponse>(`/api/projects/${projectId}/assets/${role}/playback`);
}

/**
 * Uploads a file directly from the browser to private R2 storage via presigned PUT.
 * Uses XMLHttpRequest to provide real, accurate byte progress.
 */
export function uploadFileToR2(
  uploadUrl: string,
  file: File,
  onProgress: (bytesUploaded: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (signal) {
      if (signal.aborted) {
        return reject(new Error('Upload aborted'));
      }
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Upload aborted'));
      });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      } else {
        onProgress(event.loaded, file.size);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`Direct storage upload failed with status ${xhr.status} (${xhr.statusText})`),
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Direct storage upload failed due to network error'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Direct storage upload timed out'));
    };

    xhr.open('PUT', uploadUrl, true);
    // Explicitly set Content-Type to match what was signed
    xhr.setRequestHeader('Content-Type', file.type || 'audio/wav');
    xhr.send(file);
  });
}
