// Feedback, preference votes, and timestamped comment threads for Switchroom v0.7.0

import type {
  Env,
  ProjectRow,
  ParticipantRow,
  PreferredVoteChoice,
  VoteCounts,
  CommentItem,
  CommentRow,
} from '../types';
import { generateOpaqueId, sha256Hex } from './crypto';

export class FeedbackError extends Error {
  constructor(
    public code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'FEEDBACK_DISABLED'
      | 'INVALID_INPUT'
      | 'INVALID_PARTICIPANT'
      | 'COMMENT_NOT_FOUND',
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export interface ResolveParticipantResult {
  participant: ParticipantRow | null;
  isCreator: boolean;
  guestSecret?: string;
  cookieToSet?: {
    name: string;
    value: string;
    maxAge: number;
  };
}

export function participantCookieName(projectId: string): string {
  return `switchroom_partic_${projectId.slice(0, 16)}`;
}

/**
 * Resolves or registers a project-scoped participant identity:
 * 1. Project Owner (creator session or guest capability) -> Creator participant
 * 2. Authenticated user (Better Auth session) -> User participant
 * 3. Guest with valid cookie -> Guest participant
 * 4. New guest with displayName -> Registers guest, issues secure cookie
 */
export async function resolveParticipant(
  env: Env,
  project: ProjectRow,
  options: {
    isOwner: boolean;
    authUserId?: string | null;
    authUserName?: string | null;
    guestSecretCookie?: string | null;
    displayName?: string | null;
  },
): Promise<ResolveParticipantResult> {
  const now = Date.now();
  const { isOwner, authUserId, authUserName, guestSecretCookie, displayName } = options;

  // 1. Owner participant
  if (isOwner) {
    const ownerName = authUserName?.trim() || 'Creator';
    let participant: ParticipantRow | null = null;

    if (authUserId) {
      participant = await env.DB.prepare(
        'SELECT * FROM participants WHERE project_id = ? AND user_id = ?',
      )
        .bind(project.id, authUserId)
        .first<ParticipantRow>();

      if (!participant) {
        const id = generateOpaqueId('partic');
        await env.DB.prepare(
          `INSERT INTO participants (id, project_id, user_id, display_name, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, project.id, authUserId, ownerName, now, now)
          .run();

        participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
          .bind(id)
          .first<ParticipantRow>();
      }
    } else {
      // Guest creator: use project's owner capability hash
      const capabilityHash = project.owner_capability_hash;
      if (capabilityHash) {
        participant = await env.DB.prepare(
          'SELECT * FROM participants WHERE project_id = ? AND guest_token_hash = ?',
        )
          .bind(project.id, capabilityHash)
          .first<ParticipantRow>();

        if (!participant) {
          const id = generateOpaqueId('partic');
          await env.DB.prepare(
            `INSERT INTO participants (id, project_id, guest_token_hash, display_name, created_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
            .bind(id, project.id, capabilityHash, 'Creator', now, now)
            .run();

          participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
            .bind(id)
            .first<ParticipantRow>();
        }
      }
    }

    if (participant) {
      await env.DB.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?')
        .bind(now, participant.id)
        .run();
      return { participant, isCreator: true };
    }
  }

  // 2. Signed-in client
  if (authUserId) {
    let participant = await env.DB.prepare(
      'SELECT * FROM participants WHERE project_id = ? AND user_id = ?',
    )
      .bind(project.id, authUserId)
      .first<ParticipantRow>();

    const clientName = authUserName?.trim() || 'Client';

    if (!participant) {
      const id = generateOpaqueId('partic');
      await env.DB.prepare(
        `INSERT INTO participants (id, project_id, user_id, display_name, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, project.id, authUserId, clientName, now, now)
        .run();

      participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
        .bind(id)
        .first<ParticipantRow>();
    } else {
      await env.DB.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?')
        .bind(now, participant.id)
        .run();
    }

    return { participant, isCreator: false };
  }

  // 3. Guest with existing cookie
  if (guestSecretCookie) {
    const hash = await sha256Hex(guestSecretCookie);
    const participant = await env.DB.prepare(
      'SELECT * FROM participants WHERE project_id = ? AND guest_token_hash = ?',
    )
      .bind(project.id, hash)
      .first<ParticipantRow>();

    if (participant) {
      if (
        displayName &&
        displayName.trim().length > 0 &&
        displayName.trim() !== participant.display_name
      ) {
        const cleanName = displayName.trim().slice(0, 50);
        await env.DB.prepare(
          'UPDATE participants SET display_name = ?, last_seen_at = ? WHERE id = ?',
        )
          .bind(cleanName, now, participant.id)
          .run();
        participant.display_name = cleanName;
      } else {
        await env.DB.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?')
          .bind(now, participant.id)
          .run();
      }

      return { participant, isCreator: false };
    }
  }

  // 4. Register new guest participant if displayName is provided
  if (displayName) {
    const cleanName = displayName.trim();
    if (cleanName.length < 1 || cleanName.length > 50) {
      throw new FeedbackError('INVALID_INPUT', 'Display name must be between 1 and 50 characters');
    }

    const guestSecret = generateOpaqueId('guest_sec');
    const hash = await sha256Hex(guestSecret);
    const id = generateOpaqueId('partic');

    await env.DB.prepare(
      `INSERT INTO participants (id, project_id, guest_token_hash, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, project.id, hash, cleanName, now, now)
      .run();

    const participant = await env.DB.prepare('SELECT * FROM participants WHERE id = ?')
      .bind(id)
      .first<ParticipantRow>();

    return {
      participant,
      isCreator: false,
      guestSecret,
      cookieToSet: {
        name: participantCookieName(project.id),
        value: guestSecret,
        maxAge: 90 * 24 * 60 * 60, // 90 days
      },
    };
  }

  return { participant: null, isCreator: false };
}

/**
 * Records or updates a participant's preferred version vote (original or edited).
 */
export async function submitVote(
  env: Env,
  project: ProjectRow,
  participant: ParticipantRow,
  choice: PreferredVoteChoice,
): Promise<{ choice: PreferredVoteChoice; counts: VoteCounts }> {
  if (project.feedback_enabled !== 1) {
    throw new FeedbackError('FEEDBACK_DISABLED', 'Feedback is disabled for this project');
  }

  if (choice !== 'original' && choice !== 'edited') {
    throw new FeedbackError('INVALID_INPUT', "Choice must be 'original' or 'edited'");
  }

  const now = Date.now();
  const id = generateOpaqueId('vote');

  await env.DB.prepare(
    `INSERT INTO preferred_votes (id, project_id, participant_id, choice, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, participant_id) DO UPDATE SET
       choice = excluded.choice,
       updated_at = excluded.updated_at`,
  )
    .bind(id, project.id, participant.id, choice, now, now)
    .run();

  const counts = await getVoteCounts(env.DB, project.id);
  return { choice, counts };
}

/**
 * Returns current aggregated vote counts for a project.
 */
export async function getVoteCounts(db: D1Database, projectId: string): Promise<VoteCounts> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN choice = 'original' THEN 1 ELSE 0 END), 0) AS original,
         COALESCE(SUM(CASE WHEN choice = 'edited' THEN 1 ELSE 0 END), 0) AS edited,
         COUNT(*) AS total
       FROM preferred_votes
       WHERE project_id = ?`,
    )
    .bind(projectId)
    .first<{ original: number; edited: number; total: number }>();

  return {
    original: Number(row?.original ?? 0),
    edited: Number(row?.edited ?? 0),
    total: Number(row?.total ?? 0),
  };
}

/**
 * Returns a participant's current vote if any.
 */
export async function getParticipantVote(
  db: D1Database,
  projectId: string,
  participantId: string,
): Promise<PreferredVoteChoice | null> {
  const row = await db
    .prepare('SELECT choice FROM preferred_votes WHERE project_id = ? AND participant_id = ?')
    .bind(projectId, participantId)
    .first<{ choice: PreferredVoteChoice }>();

  return row?.choice ?? null;
}

export interface CreateCommentParams {
  timestampMs?: number | null;
  body: string;
  parentCommentId?: string | null;
}

/**
 * Creates a timestamped comment or a single-level reply.
 */
export async function createComment(
  env: Env,
  project: ProjectRow,
  participant: ParticipantRow,
  params: CreateCommentParams,
  isCreator = false,
): Promise<CommentItem> {
  if (project.feedback_enabled !== 1) {
    throw new FeedbackError('FEEDBACK_DISABLED', 'Feedback is disabled for this project');
  }

  const rawBody = (params.body || '').trim();
  if (rawBody.length < 1) {
    throw new FeedbackError('INVALID_INPUT', 'Comment body cannot be empty');
  }
  if (rawBody.length > 1000) {
    throw new FeedbackError(
      'INVALID_INPUT',
      'Comment body exceeds maximum limit (1000 characters)',
    );
  }

  // Validate timestamp if provided
  let timestampMs: number | null = null;
  if (params.timestampMs !== undefined && params.timestampMs !== null) {
    const ts = Math.floor(Number(params.timestampMs));
    if (!Number.isFinite(ts) || ts < 0) {
      throw new FeedbackError(
        'INVALID_INPUT',
        'Timestamp must be a non-negative integer in milliseconds',
      );
    }
    timestampMs = ts;
  }

  // Validate parent comment for replies (single-level reply constraint)
  let parentCommentId: string | null = null;
  if (params.parentCommentId) {
    const parent = await env.DB.prepare(
      'SELECT * FROM comments WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    )
      .bind(params.parentCommentId, project.id)
      .first<CommentRow>();

    if (!parent) {
      throw new FeedbackError('COMMENT_NOT_FOUND', 'Parent comment not found');
    }

    if (parent.parent_comment_id !== null) {
      throw new FeedbackError(
        'INVALID_INPUT',
        'Replies cannot be nested; reply to the root comment instead',
      );
    }

    parentCommentId = parent.id;
  }

  const now = Date.now();
  const id = generateOpaqueId('comm');

  await env.DB.prepare(
    `INSERT INTO comments (id, project_id, participant_id, parent_comment_id, timestamp_ms, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, project.id, participant.id, parentCommentId, timestampMs, rawBody, now, now)
    .run();

  return {
    id,
    projectId: project.id,
    author: {
      displayName: participant.display_name,
      isCreator,
    },
    timestampMs,
    body: rawBody,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    replies: [],
    canDelete: true,
  };
}

/**
 * Lists threaded comments (root comments + replies) with bounded pagination.
 */
export async function listComments(
  db: D1Database,
  project: ProjectRow,
  callerParticipantId?: string | null,
  isCallerOwner = false,
  limit = 100,
): Promise<{ comments: CommentItem[]; totalCount: number }> {
  // Query all non-purged comments for the project
  const rows = await db
    .prepare(
      `SELECT
         c.id, c.project_id, c.participant_id, c.parent_comment_id,
         c.timestamp_ms, c.body, c.created_at, c.updated_at, c.deleted_at,
         p.display_name, p.user_id, p.guest_token_hash
       FROM comments c
       JOIN participants p ON c.participant_id = p.id
       WHERE c.project_id = ?
       ORDER BY c.created_at ASC
       LIMIT ?`,
    )
    .bind(project.id, Math.min(limit, 200))
    .all<
      CommentRow & {
        display_name: string;
        user_id: string | null;
        guest_token_hash: string | null;
      }
    >();

  const allComments = rows.results || [];
  const rootComments: CommentItem[] = [];
  const repliesByParent: Record<string, CommentItem[]> = {};

  const isCreatorRow = (row: { user_id: string | null; guest_token_hash: string | null }) => {
    if (project.owner_user_id && row.user_id === project.owner_user_id) return true;
    if (project.owner_capability_hash && row.guest_token_hash === project.owner_capability_hash)
      return true;
    return false;
  };

  for (const r of allComments) {
    const isDeleted = r.deleted_at !== null;
    const canDelete =
      !isDeleted &&
      (isCallerOwner || (Boolean(callerParticipantId) && callerParticipantId === r.participant_id));
    const item: CommentItem = {
      id: r.id,
      projectId: r.project_id,
      author: {
        displayName: r.display_name,
        isCreator: isCreatorRow(r),
      },
      timestampMs: r.timestamp_ms,
      body: isDeleted ? '[Comment deleted]' : r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deleted: isDeleted,
      replies: [],
      canDelete,
    };

    if (r.parent_comment_id) {
      const list = repliesByParent[r.parent_comment_id] || [];
      list.push(item);
      repliesByParent[r.parent_comment_id] = list;
    } else {
      rootComments.push(item);
    }
  }

  // Attach replies to their parent comments
  for (const root of rootComments) {
    root.replies = repliesByParent[root.id] || [];
  }

  return {
    comments: rootComments,
    totalCount: rootComments.length,
  };
}

/**
 * Soft deletes a comment (creator moderation or author self-delete).
 */
export async function deleteComment(
  db: D1Database,
  project: ProjectRow,
  commentId: string,
  participantId?: string | null,
  isCallerOwner = false,
): Promise<{ success: boolean }> {
  const comment = await db
    .prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?')
    .bind(commentId, project.id)
    .first<CommentRow>();

  if (!comment || comment.deleted_at !== null) {
    throw new FeedbackError('COMMENT_NOT_FOUND', 'Comment not found or already deleted');
  }

  if (!isCallerOwner && comment.participant_id !== participantId) {
    throw new FeedbackError('FORBIDDEN', 'You do not have permission to delete this comment');
  }

  const now = Date.now();
  await db
    .prepare('UPDATE comments SET deleted_at = ?, body = ?, updated_at = ? WHERE id = ?')
    .bind(now, '', now, commentId)
    .run();

  return { success: true };
}
