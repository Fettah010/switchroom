import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, UploadSessionRow } from '../types';
import {
  cancelUploadSession,
  completeUploadSession,
  createUploadSession,
  getMultipartPartUrl,
  recordCompletedPart,
  listCompletedParts,
  UploadError,
} from '../services/uploads';
import { getProjectById } from '../services/projects';
import { resolveProjectOwner, getAuthenticatedUser } from '../services/auth';
import { getStorageUsageSummary } from '../services/storageQuota';

export const uploadsRoute = new Hono<{ Bindings: Env }>();

function mapUploadError(err: UploadError): {
  status: ContentfulStatusCode;
  body: { error: { code: string; message: string; details?: unknown } };
} {
  const statusMap: Record<string, ContentfulStatusCode> = {
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
    INVALID_PART: 400,
    FILE_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA: 415,
    CONFLICT: 409,
    UPLOAD_SESSION_EXPIRED: 410,
    UPLOAD_VERIFICATION_FAILED: 422,
    QUOTA_EXCEEDED: 403,
    STORAGE_BUDGET_EXCEEDED: 507,
    STORAGE_UNAVAILABLE: 503,
  };
  const status = statusMap[err.code] || 400;
  return {
    status,
    body: { error: { code: err.code, message: err.message, details: err.details } },
  };
}

/** Initializes an upload session (single-PUT or multipart) and reserves quota */
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
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Issues a short-lived presigned URL for a specific part number */
uploadsRoute.get('/uploads/multipart/:id/part-url', async (c) => {
  const uploadSessionId = c.req.param('id');
  const partNumberParam = c.req.query('partNumber');
  const partNumber = parseInt(partNumberParam || '0', 10);
  const origin = new URL(c.req.url).origin;

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
    const result = await getMultipartPartUrl(c.env, uploadSessionId, partNumber, origin);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Records a completed part in D1 for resumption and verification */
uploadsRoute.post('/uploads/multipart/:id/part-complete', async (c) => {
  const uploadSessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { partNumber, etag, sizeBytes } = body;

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
    await recordCompletedPart(c.env, uploadSessionId, partNumber, etag, sizeBytes);
    return c.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Lists verified completed parts for safe resumption */
uploadsRoute.get('/uploads/multipart/:id/parts', async (c) => {
  const uploadSessionId = c.req.param('id');

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
    const result = await listCompletedParts(c.env, uploadSessionId);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Completes a multipart upload */
uploadsRoute.post('/uploads/multipart/:id/complete', async (c) => {
  const uploadSessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const proposedParts = Array.isArray(body?.parts) ? body.parts : undefined;

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
    const result = await completeUploadSession(c.env, uploadSessionId, proposedParts);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Aborts an active multipart upload and reclaims staged parts */
uploadsRoute.post('/uploads/multipart/:id/abort', async (c) => {
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
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Finalizes an upload (single-PUT or multipart) */
uploadsRoute.post('/uploads/:id/complete', async (c) => {
  const uploadSessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const proposedParts = Array.isArray(body?.parts) ? body.parts : undefined;

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
    const result = await completeUploadSession(c.env, uploadSessionId, proposedParts);
    return c.json(result);
  } catch (err: unknown) {
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
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
    if (err instanceof UploadError) {
      const { status, body } = mapUploadError(err);
      return c.json(body, status);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } }, 500);
  }
});

/** Returns storage quota and committed/reserved usage summary for owner */
uploadsRoute.get('/projects/:id/storage-summary', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Owner access required' } }, 403);
  }

  const summary = await getStorageUsageSummary(c.env.DB, project);
  return c.json({ storage: summary });
});

/** Returns storage quota and usage summary for the currently authenticated user */
uploadsRoute.get('/storage-summary', async (c) => {
  const user = await getAuthenticatedUser(c);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }, 401);
  }

  // Create a minimal synthetic ProjectRow to satisfy getStorageUsageSummary
  const syntheticProject = {
    id: '',
    owner_user_id: user.id,
  } as unknown as import('../types').ProjectRow;

  const summary = await getStorageUsageSummary(c.env.DB, syntheticProject);
  return c.json({ storage: summary });
});
