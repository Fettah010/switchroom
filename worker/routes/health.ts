import { Hono } from 'hono';
import type { Env } from '../types';

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: __APP_VERSION__,
    timestamp: Date.now(),
    r2Configured: Boolean(c.env.AUDIO_BUCKET),
    authConfigured: Boolean(c.env.DB),
  });
});
