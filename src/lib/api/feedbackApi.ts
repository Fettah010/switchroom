// Typed Feedback API Client for Switchroom v0.7.0 (votes, timestamped comments, replies)

export interface VoteCounts {
  original: number;
  edited: number;
  total: number;
}

export type PreferredVoteChoice = 'original' | 'edited';

export interface CommentAuthor {
  displayName: string;
  isCreator: boolean;
}

export interface CommentItem {
  id: string;
  projectId: string;
  author: CommentAuthor;
  timestampMs: number | null;
  body: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  replies: CommentItem[];
  canDelete: boolean;
}

export interface ParticipantInfo {
  id: string;
  displayName: string;
  isCreator: boolean;
  currentVote: PreferredVoteChoice | null;
}

export class FeedbackApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'FeedbackApiError';
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
    credentials: 'include',
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
    throw new FeedbackApiError(code, message, response.status, errBody?.error?.details);
  }

  const contentType = response.headers.get('content-type');
  if (response.status === 204 || !contentType?.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

/**
 * Registers or resolves a project-scoped participant identity.
 */
export async function registerParticipant(
  projectId: string,
  displayName: string,
  token?: string,
): Promise<{ participant: ParticipantInfo }> {
  const url = token
    ? `/api/share/${encodeURIComponent(token)}/participant`
    : `/api/projects/${encodeURIComponent(projectId)}/participant`;
  return request<{ participant: ParticipantInfo }>(url, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
    headers: token ? { 'X-Share-Token': token } : {},
  });
}

/**
 * Fetches current vote counts and the participant's vote.
 */
export async function getProjectVotes(
  projectId: string,
  token?: string,
): Promise<{ counts: VoteCounts; userVote: PreferredVoteChoice | null }> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/vote`;
  return request<{ counts: VoteCounts; userVote: PreferredVoteChoice | null }>(url, {
    headers: token ? { 'X-Share-Token': token } : {},
  });
}

/**
 * Submits or changes a preferred version vote ('original' or 'edited').
 */
export async function submitProjectVote(
  projectId: string,
  choice: PreferredVoteChoice,
  displayName?: string,
  token?: string,
): Promise<{ choice: PreferredVoteChoice; counts: VoteCounts }> {
  const url = token
    ? `/api/share/${encodeURIComponent(token)}/vote`
    : `/api/projects/${encodeURIComponent(projectId)}/vote`;
  return request<{ choice: PreferredVoteChoice; counts: VoteCounts }>(url, {
    method: 'POST',
    body: JSON.stringify({ choice, displayName }),
    headers: token ? { 'X-Share-Token': token } : {},
  });
}

/**
 * Lists threaded timestamped comments and single-level replies.
 */
export async function listProjectComments(
  projectId: string,
  token?: string,
): Promise<{ comments: CommentItem[]; totalCount: number }> {
  const url = token
    ? `/api/share/${encodeURIComponent(token)}/comments`
    : `/api/projects/${encodeURIComponent(projectId)}/comments`;
  return request<{ comments: CommentItem[]; totalCount: number }>(url, {
    headers: token ? { 'X-Share-Token': token } : {},
  });
}

/**
 * Creates a root comment or a single-level reply.
 */
export async function createProjectComment(
  projectId: string,
  params: {
    timestampMs?: number | null;
    body: string;
    parentCommentId?: string | null;
    displayName?: string;
  },
  token?: string,
): Promise<{ comment: CommentItem }> {
  const url = token
    ? `/api/share/${encodeURIComponent(token)}/comments`
    : `/api/projects/${encodeURIComponent(projectId)}/comments`;
  return request<{ comment: CommentItem }>(url, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: token ? { 'X-Share-Token': token } : {},
  });
}

/**
 * Replies to a comment directly via the replies route.
 */
export async function replyToComment(
  parentCommentId: string,
  body: string,
  displayName?: string,
  projectId?: string,
  token?: string,
): Promise<{ comment: CommentItem }> {
  return request<{ comment: CommentItem }>(
    `/api/comments/${encodeURIComponent(parentCommentId)}/replies`,
    {
      method: 'POST',
      body: JSON.stringify({ body, displayName, projectId }),
      headers: token ? { 'X-Share-Token': token } : {},
    },
  );
}

/**
 * Soft deletes a comment (creator moderation or author delete).
 */
export async function deleteProjectComment(
  projectId: string,
  commentId: string,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'DELETE',
    },
  );
}
