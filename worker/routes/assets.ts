import { Hono } from 'hono';
import type { AssetRole, AudioAssetRow, Env } from '../types';
import { getProjectById } from '../services/projects';
import { resolveProjectOwner } from '../services/auth';
import { createPresignedGetUrl } from '../services/r2';
import { QUOTA_POLICY } from '../config/quotas';

export const assetsRoute = new Hono<{ Bindings: Env }>();

/**
 * Owner-authorized temporary playback URL generator.
 * Allows the creator to reopen and play back their own cloud assets.
 * Note: This is strictly creator owner-preview, not public client sharing (v0.6+).
 */
assetsRoute.get('/projects/:id/assets/:role/playback', async (c) => {
  const projectId = c.req.param('id');
  const role = c.req.param('role') as AssetRole;

  if (role !== 'original' && role !== 'edited') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Role must be original or edited' } },
      400,
    );
  }

  // 1. Verify project exists
  const project = await getProjectById(c.env.DB, projectId);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const now = Date.now();
  if (project.expires_at <= now) {
    return c.json({ error: { code: 'PROJECT_EXPIRED', message: 'This project has expired' } }, 410);
  }

  // 2. Authorize owner
  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Owner access required for asset playback' } },
      403,
    );
  }

  // 3. Find asset
  const asset = await c.env.DB.prepare(
    'SELECT * FROM audio_assets WHERE project_id = ? AND role = ?',
  )
    .bind(projectId, role)
    .first<AudioAssetRow>();

  if (!asset || asset.status !== 'ready') {
    return c.json(
      { error: { code: 'PROJECT_NOT_READY', message: `Audio asset for ${role} is not ready` } },
      404,
    );
  }

  const origin = new URL(c.req.url).origin;
  const playbackUrl = await createPresignedGetUrl(
    c.env,
    origin,
    asset.object_key,
    QUOTA_POLICY.playbackUrlTtlSeconds,
  );

  const shouldRedirect =
    c.req.query('redirect') === 'true' || c.req.header('Accept')?.includes('audio/');
  if (shouldRedirect) {
    return c.redirect(playbackUrl, 302);
  }

  return c.json({
    playbackUrl,
    role,
    filename: asset.filename,
    mimeType: asset.mime_type,
    sizeBytes: asset.size_bytes,
    expiresAt: now + QUOTA_POLICY.playbackUrlTtlSeconds * 1000,
  });
});
