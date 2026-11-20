import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, PreferredVoteChoice } from '../types';
import { getProjectById } from '../services/projects';
import { resolveProjectOwner, getAuthenticatedUser } from '../services/auth';
import { resolveShareAccess, validateTokenShape } from '../services/sharing';
import {
  resolveParticipant,
  submitVote,
  getVoteCounts,
  getParticipantVote,
  createComment,
  listComments,
  deleteComment,
  FeedbackError,
  participantCookieName,
} from '../services/feedback';

export const feedbackRoute = new Hono<{ Bindings: Env }>();

function mapFeedbackError(err: FeedbackError): {
  status: ContentfulStatusCode;
  body: { error: { code: string; message: string; details?: unknown } };
} {
  const statusMap: Record<string, ContentfulStatusCode> = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    FEEDBACK_DISABLED: 403,
    INVALID_INPUT: 400,
    INVALID_PARTICIPANT: 401,
    COMMENT_NOT_FOUND: 404,
  };
  const status = statusMap[err.code] || 400;
  return {
    status,
    body: { error: { code: err.code, message: err.message, details: err.details } },
  };
}

/**
 * Common resolver for feedback requests verifying ownership or share link authorization.
 */
async function resolveFeedbackAccess(
  c: Context<{ Bindings: Env }>,
  projectIdOrToken: string,
  isToken = false,
  requestedDisplayName?: string | null,
) {
  let project;
  let isOwner = false;
  let authUser: { id: string; name: string; email: string } | null = null;

  if (isToken) {
    if (!validateTokenShape(projectIdOrToken)) {
      throw new FeedbackError('NOT_FOUND', 'Invalid review token');
    }
    const grantCookie = getCookie(c, 'switchroom_grant') || null;
    const shareRes = await resolveShareAccess(c.env, projectIdOrToken, grantCookie);
    project = shareRes.project;
  } else {
    project = await getProjectById(c.env.DB, projectIdOrToken);
    if (!project) {
      throw new FeedbackError('NOT_FOUND', 'Project not found');
    }
    const shareTokenHeader = c.req.header('x-share-token') || c.req.query('token');
    if (shareTokenHeader && validateTokenShape(shareTokenHeader)) {
      const grantCookie = getCookie(c, 'switchroom_grant') || null;
      await resolveShareAccess(c.env, shareTokenHeader, grantCookie);
    }
  }

  // Check project expiry
  if (project.expires_at <= Date.now()) {
    throw new FeedbackError('FORBIDDEN', 'Project has expired');
  }

  // Check if owner
  const ownerContext = await resolveProjectOwner(c, project);
  if (ownerContext) {
    isOwner = true;
  }

  // Check Better Auth user
  const user = await getAuthenticatedUser(c);
  if (user) {
    authUser = user;
  }

  const cookieName = participantCookieName(project.id);
  const guestCookie = getCookie(c, cookieName);

  const participantRes = await resolveParticipant(c.env, project, {
    isOwner,
    authUserId: authUser?.id,
    authUserName: authUser?.name,
    guestSecretCookie: guestCookie,
    displayName: requestedDisplayName,
  });

  if (participantRes.cookieToSet) {
    setCookie(c, participantRes.cookieToSet.name, participantRes.cookieToSet.value, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: participantRes.cookieToSet.maxAge,
    });
  }

  return {
    project,
    isOwner,
    participant: participantRes.participant,
    isCreator: participantRes.isCreator,
  };
}

/** Registers or resolves client participant identity */
feedbackRoute.post('/projects/:id/participant', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const displayName = typeof body?.displayName === 'string' ? body.displayName : null;

  try {
    const { project, participant, isCreator } = await resolveFeedbackAccess(
      c,
      projectId,
      false,
      displayName,
    );

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to participate in feedback',
          },
        },
        400,
      );
    }

    const vote = await getParticipantVote(c.env.DB, project.id, participant.id);

    return c.json({
      participant: {
        id: participant.id,
        displayName: participant.display_name,
        isCreator,
        currentVote: vote,
      },
    });
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Submits or updates a preferred version vote */
feedbackRoute.post('/projects/:id/vote', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const choice = body?.choice as PreferredVoteChoice;
  const displayName = typeof body?.displayName === 'string' ? body.displayName : null;

  try {
    const { project, participant } = await resolveFeedbackAccess(c, projectId, false, displayName);

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to vote',
          },
        },
        400,
      );
    }

    const result = await submitVote(c.env, project, participant, choice);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Gets current vote counts and participant vote */
feedbackRoute.get('/projects/:id/vote', async (c) => {
  const projectId = c.req.param('id');

  try {
    const { project, participant } = await resolveFeedbackAccess(c, projectId, false);
    const counts = await getVoteCounts(c.env.DB, project.id);
    const userVote = participant
      ? await getParticipantVote(c.env.DB, project.id, participant.id)
      : null;

    return c.json({ counts, userVote });
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Creates a timestamped comment */
feedbackRoute.post('/projects/:id/comments', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { timestampMs, body: commentBody, parentCommentId, displayName } = body;

  try {
    const { project, participant, isCreator } = await resolveFeedbackAccess(
      c,
      projectId,
      false,
      typeof displayName === 'string' ? displayName : null,
    );

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to comment',
          },
        },
        400,
      );
    }

    const comment = await createComment(
      c.env,
      project,
      participant,
      { timestampMs, body: commentBody, parentCommentId },
      isCreator,
    );

    return c.json({ comment }, 201);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Lists project comments */
feedbackRoute.get('/projects/:id/comments', async (c) => {
  const projectId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '100', 10);

  try {
    const { project, participant, isOwner } = await resolveFeedbackAccess(c, projectId, false);
    const result = await listComments(c.env.DB, project, participant?.id, isOwner, limit);

    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Replies to a comment */
feedbackRoute.post('/comments/:id/replies', async (c) => {
  const parentCommentId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { body: replyBody, displayName, projectId } = body;

  // Find parent comment to resolve project
  const parent = await c.env.DB.prepare('SELECT project_id FROM comments WHERE id = ?')
    .bind(parentCommentId)
    .first<{ project_id: string }>();

  if (!parent) {
    return c.json({ error: { code: 'COMMENT_NOT_FOUND', message: 'Comment not found' } }, 404);
  }

  const effectiveProjectId = projectId || parent.project_id;

  try {
    const { project, participant, isCreator } = await resolveFeedbackAccess(
      c,
      effectiveProjectId,
      false,
      typeof displayName === 'string' ? displayName : null,
    );

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to reply',
          },
        },
        400,
      );
    }

    const comment = await createComment(
      c.env,
      project,
      participant,
      { body: replyBody, parentCommentId },
      isCreator,
    );

    return c.json({ comment }, 201);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Deletes a comment (creator moderation or author self-delete) */
feedbackRoute.delete('/projects/:id/comments/:commentId', async (c) => {
  const projectId = c.req.param('id');
  const commentId = c.req.param('commentId');

  try {
    const { project, participant, isOwner } = await resolveFeedbackAccess(c, projectId, false);
    const result = await deleteComment(c.env.DB, project, commentId, participant?.id, isOwner);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Share-scoped vote endpoint */
feedbackRoute.post('/share/:token/vote', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));
  const choice = body?.choice as PreferredVoteChoice;
  const displayName = typeof body?.displayName === 'string' ? body.displayName : null;

  try {
    const { project, participant } = await resolveFeedbackAccess(c, token, true, displayName);

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to vote',
          },
        },
        400,
      );
    }

    const result = await submitVote(c.env, project, participant, choice);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Share-scoped comments endpoint */
feedbackRoute.get('/share/:token/comments', async (c) => {
  const token = c.req.param('token');
  const limit = parseInt(c.req.query('limit') || '100', 10);

  try {
    const { project, participant, isOwner } = await resolveFeedbackAccess(c, token, true);
    const result = await listComments(c.env.DB, project, participant?.id, isOwner, limit);

    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Share-scoped create comment endpoint */
feedbackRoute.post('/share/:token/comments', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));
  const { timestampMs, body: commentBody, parentCommentId, displayName } = body;

  try {
    const { project, participant, isCreator } = await resolveFeedbackAccess(
      c,
      token,
      true,
      typeof displayName === 'string' ? displayName : null,
    );

    if (!participant) {
      return c.json(
        {
          error: {
            code: 'INVALID_PARTICIPANT',
            message: 'A display name is required to comment',
          },
        },
        400,
      );
    }

    const comment = await createComment(
      c.env,
      project,
      participant,
      { timestampMs, body: commentBody, parentCommentId },
      isCreator,
    );

    return c.json({ comment }, 201);
  } catch (err: unknown) {
    if (err instanceof FeedbackError) {
      const { status, body: errBody } = mapFeedbackError(err);
      return c.json(errBody, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});
