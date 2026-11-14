import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, UploadSessionRow } from '../types';
import {
  cancelUploadSession,
  completeUploadSession,
  createUploadSession,
  UploadError,
} from '../services/uploads';
import { getProjectById } from '../services/projects';
import { resolveProjectOwner } from '../services/auth';

export const uploadsRoute = new Hono<{ Bindings: Env }>();

/** Initializes an upload session and provides a short-lived presigned PUT URL */
uploadsRoute.post('/uploads/init', async (c) => {
  const origin = new URL(c.req.url).origin;
  const body = await c.req.json().catch(() => ({}));

  const { projectId, role, filename, sizeBytes, mimeType, durationMs } = body;
  if (!projectId || !role || !filename || !sizeBytes) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required upload parameters (projectId, role, filename, sizeBytes)',
        },
      },
      400,
    );
  }

  // 1. Verify project exists
  const project = await getProjectById(c.env.DB, projectId);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  // 2. Authorize owner
  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Owner access required to upload audio' } },
      403,
    );
  }

  try {
    const result = await createUploadSession(c.env, {
      projectId,
      role,
      filename,
      sizeBytes,
      mimeType: mimeType || 'audio/wav',
      durationMs,
      origin,
    });

    return c.json(result, 201);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, ContentfulStatusCode> = {
        NOT_FOUND: 404,
        INVALID_INPUT: 400,
        FILE_TOO_LARGE: 413,
        UNSUPPORTED_MEDIA: 415,
        CONFLICT: 409,
        STORAGE_UNAVAILABLE: 503,
      };
      const status = statusMap[err.code] || 400;
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        status,
      );
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Finalizes an upload after browser finishes PUT by verifying R2 object metadata */
uploadsRoute.post('/uploads/:id/complete', async (c) => {
  const uploadSessionId = c.req.param('id');

  // Verify session belongs to an owned project
  const session = await c.env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ?')
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Upload session not found' } }, 404);
  }

  const project = await getProjectById(c.env.DB, session.project_id);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Owner access required' } }, 403);
  }

  try {
    const result = await completeUploadSession(c.env, uploadSessionId);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const statusMap: Record<string, ContentfulStatusCode> = {
        NOT_FOUND: 404,
        UPLOAD_SESSION_EXPIRED: 410,
        UPLOAD_VERIFICATION_FAILED: 422,
        STORAGE_UNAVAILABLE: 503,
        CONFLICT: 409,
      };
      const status = statusMap[err.code] || 400;
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        status,
      );
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Cancels an active or pending upload session */
uploadsRoute.post('/uploads/:id/cancel', async (c) => {
  const uploadSessionId = c.req.param('id');

  const session = await c.env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ?')
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    return c.json({ success: true });
  }

  const project = await getProjectById(c.env.DB, session.project_id);
  if (project) {
    const owner = await resolveProjectOwner(c, project);
    if (!owner) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Owner access required' } }, 403);
    }
  }

  try {
    const result = await cancelUploadSession(c.env, uploadSessionId);
    return c.json(result);
  } catch (err: unknown) {
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});
