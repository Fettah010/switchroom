import { Hono, type Context } from 'hono';
import type { Env, RetentionDays } from '../types';
import {
  createProject,
  deleteProject,
  getProjectAssets,
  getProjectById,
  listProjectsByIds,
  listProjectsForUser,
  reconcileProjectStatus,
  updateProject,
} from '../services/projects';
import { getAuthenticatedUser, resolveProjectOwner } from '../services/auth';
import { hashCapability } from '../services/crypto';

export const projectsRoute = new Hono<{ Bindings: Env }>();

/** Helper to set the owner session cookie for guest projects */
function setGuestOwnerCookie(
  c: Context<{ Bindings: Env }>,
  projectId: string,
  capability: string,
  maxAgeSeconds: number,
) {
  const isSecure = c.req.url.startsWith('https://');
  const secureFlag = isSecure ? '; Secure' : '';
  const cookieValue = `sw_owner_${projectId}=${encodeURIComponent(capability)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secureFlag}`;
  c.header('Set-Cookie', cookieValue, { append: true });
}

/** Lists all cloud projects owned by the currently authenticated user */
projectsRoute.get('/projects', async (c) => {
  const user = await getAuthenticatedUser(c);
  if (!user) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to view account projects' } },
      401,
    );
  }

  const projects = await listProjectsForUser(c.env.DB, user.id);

  // Attach assets and status reconciliation to each project
  const detailed = await Promise.all(
    projects.map(async (project) => {
      const assets = await getProjectAssets(c.env.DB, project.id);
      return {
        ...project,
        owner_capability_hash: undefined, // Redact
        assets,
      };
    }),
  );

  return c.json({ projects: detailed });
});

/** Batch lookup of projects by ID for guest browser dashboard index */
projectsRoute.post('/projects/batch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const projectIds = Array.isArray(body.projectIds) ? body.projectIds : [];
  if (projectIds.length === 0) {
    return c.json({ projects: [] });
  }

  const rawProjects = await listProjectsByIds(c.env.DB, projectIds);

  const projects = await Promise.all(
    rawProjects.map(async (p) => {
      const assets = await getProjectAssets(c.env.DB, p.id);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        retention_days: p.retention_days,
        created_at: p.created_at,
        updated_at: p.updated_at,
        expires_at: p.expires_at,
        crossfade_ms: p.crossfade_ms,
        presentation_layout: p.presentation_layout,
        isGuestOwned: Boolean(p.owner_capability_hash),
        assets: {
          original: assets.original
            ? {
                status: assets.original.status,
                filename: assets.original.filename,
                size_bytes: assets.original.size_bytes,
              }
            : null,
          edited: assets.edited
            ? {
                status: assets.edited.status,
                filename: assets.edited.filename,
                size_bytes: assets.edited.size_bytes,
              }
            : null,
        },
      };
    }),
  );

  return c.json({ projects });
});

/** Creates a new project (signed-in user or guest) */
projectsRoute.post('/projects', async (c) => {
  const origin = new URL(c.req.url).origin;
  const body = await c.req.json().catch(() => ({}));

  const user = await getAuthenticatedUser(c);
  const ownerUserId = user ? user.id : null;

  try {
    const result = await createProject(c.env.DB, origin, {
      title: body.title,
      description: body.description,
      retentionDays: body.retentionDays as RetentionDays,
      crossfadeMs: body.crossfadeMs,
      presentationLayout: body.presentationLayout,
      ownerUserId,
    });

    // If guest mode, set the project-scoped owner cookie
    if (result.guestCapability) {
      const maxAge = Math.floor((result.project.expires_at - Date.now()) / 1000);
      setGuestOwnerCookie(c, result.project.id, result.guestCapability, Math.max(maxAge, 3600));
    }

    const assets = await getProjectAssets(c.env.DB, result.project.id);

    return c.json(
      {
        project: {
          ...result.project,
          owner_capability_hash: undefined,
          assets,
        },
        guestCapability: result.guestCapability,
        recoveryUrl: result.recoveryUrl,
      },
      201,
    );
  } catch (err: unknown) {
    const message = (err as Error).message;
    const code = message.includes('Quota') ? 'QUOTA_EXCEEDED' : 'INVALID_INPUT';
    return c.json({ error: { code, message } }, 400);
  }
});

/** Retrieves a single project and its assets */
projectsRoute.get('/projects/:id', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  // Check owner authorization
  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have owner access to this private project',
        },
      },
      403,
    );
  }

  // Ensure status reflects current state
  await reconcileProjectStatus(c.env.DB, projectId);
  const updatedProject = (await getProjectById(c.env.DB, projectId)) || project;
  const assets = await getProjectAssets(c.env.DB, projectId);

  return c.json({
    project: {
      ...updatedProject,
      owner_capability_hash: undefined,
      assets,
    },
    isOwner: true,
  });
});

/** Updates project metadata or retention */
projectsRoute.patch('/projects/:id', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Owner access required' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  try {
    const updated = await updateProject(c.env.DB, projectId, {
      title: body.title,
      description: body.description,
      retentionDays: body.retentionDays,
      crossfadeMs: body.crossfadeMs,
      presentationLayout: body.presentationLayout,
    });

    const assets = await getProjectAssets(c.env.DB, projectId);

    return c.json({
      project: {
        ...updated,
        owner_capability_hash: undefined,
        assets,
      },
    });
  } catch (err: unknown) {
    return c.json({ error: { code: 'INVALID_INPUT', message: (err as Error).message } }, 400);
  }
});

/** Safely deletes a project and all associated R2 audio assets */
projectsRoute.delete('/projects/:id', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ success: true });
  }

  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Owner access required' } }, 403);
  }

  await deleteProject(c.env, projectId);
  return c.json({ success: true });
});

/** Exchanges a guest owner capability secret for an owner session cookie */
projectsRoute.post('/projects/:id/owner-access', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  if (!project.owner_capability_hash) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'This project is managed by an account, not guest capabilities',
        },
      },
      403,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const rawCapability = (body.capability || '').trim();

  if (!rawCapability.startsWith('sw_owner_')) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Invalid owner capability format' } },
      403,
    );
  }

  const hashed = await hashCapability(rawCapability);
  if (hashed !== project.owner_capability_hash) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid owner capability' } }, 403);
  }

  const maxAge = Math.floor((project.expires_at - Date.now()) / 1000);
  setGuestOwnerCookie(c, project.id, rawCapability, Math.max(maxAge, 3600));

  const assets = await getProjectAssets(c.env.DB, project.id);

  return c.json({
    success: true,
    project: {
      ...project,
      owner_capability_hash: undefined,
      assets,
    },
  });
});

/** Claims a guest project into an authenticated creator account */
projectsRoute.post('/projects/:id/claim', async (c) => {
  const projectId = c.req.param('id');
  const project = await getProjectById(c.env.DB, projectId);

  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const user = await getAuthenticatedUser(c);
  if (!user) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to claim a project' } },
      401,
    );
  }

  if (project.owner_user_id === user.id) {
    return c.json({ success: true, message: 'Project is already owned by your account' });
  }

  if (project.owner_user_id && project.owner_user_id !== user.id) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Project is already owned by another account' } },
      403,
    );
  }

  // Verify guest capability provided in body or cookie
  const body = await c.req.json().catch(() => ({}));
  let rawCapability = (body.capability || '').trim();
  if (!rawCapability) {
    const cookieHeader = c.req.header('cookie');
    const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)sw_owner_${projectId}=([^;]+)`));
    if (match?.[1]) {
      rawCapability = decodeURIComponent(match[1]);
    }
  }

  if (!rawCapability || !project.owner_capability_hash) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Valid guest capability required to claim this project',
        },
      },
      403,
    );
  }

  const hashed = await hashCapability(rawCapability);
  if (hashed !== project.owner_capability_hash) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid owner capability' } }, 403);
  }

  // Claim: set owner_user_id, remove owner_capability_hash
  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE projects SET owner_user_id = ?, owner_capability_hash = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(user.id, now, projectId)
    .run();

  const updatedProject = await getProjectById(c.env.DB, projectId);
  const assets = await getProjectAssets(c.env.DB, projectId);

  return c.json({
    success: true,
    project: {
      ...updatedProject,
      owner_capability_hash: undefined,
      assets,
    },
  });
});
