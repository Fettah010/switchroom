import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { healthRoute } from './routes/health';
import { authRoute } from './routes/auth';
import { projectsRoute } from './routes/projects';
import { uploadsRoute } from './routes/uploads';
import { assetsRoute } from './routes/assets';
import { devMockRoute } from './routes/devMock';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware supporting credentials for Better Auth & guest cookies
app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      const parsed = new URL(origin);
      if (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname.endsWith('.workers.dev') ||
        parsed.hostname.endsWith('switchroom.app')
      ) {
        return origin;
      }
      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'PUT'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Guest-Owner-Capability', 'Range', 'Accept'],
    exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'ETag'],
  }),
);

// Mount API routes
app.route('/api', healthRoute);
app.route('/api', authRoute);
app.route('/api', projectsRoute);
app.route('/api', uploadsRoute);
app.route('/api', assetsRoute);
app.route('/api', devMockRoute);

// Global 404 handler for unknown /api/* routes
app.all('/api/*', (c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${c.req.method} ${c.req.path} not found`,
      },
    },
    404,
  );
});

// Fallback to static assets for frontend routing (Single Page App)
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not found', 404);
});

export default app;
