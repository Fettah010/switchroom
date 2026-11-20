import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { healthRoute } from './routes/health';
import { authRoute } from './routes/auth';
import { projectsRoute } from './routes/projects';
import { uploadsRoute } from './routes/uploads';
import { assetsRoute } from './routes/assets';
import { sharingRoute } from './routes/sharing';
import { feedbackRoute } from './routes/feedback';
import { devMockRoute } from './routes/devMock';
import { resolveShareAccess, validateTokenShape } from './services/sharing';

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
app.route('/api', sharingRoute);
app.route('/api', feedbackRoute);
app.route('/api', devMockRoute);

// Review documents are noindex by default. An owner may explicitly opt an
// eligible public project into indexing; never rely on client-side metadata.
app.get('/review/:token', async (c) => {
  let indexable = false;
  const token = c.req.param('token');
  if (validateTokenShape(token)) {
    try {
      const access = await resolveShareAccess(c.env, token, null);
      indexable =
        access.project.sharing_visibility === 'public' &&
        access.project.public_indexing_enabled === 1;
    } catch {
      // Invalid, expired, revoked, password-gated or not-ready links stay noindex.
    }
  }

  if (!c.env.ASSETS) return c.text('Not found', 404);
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(response.headers);
  if (indexable) {
    headers.delete('X-Robots-Tag');
  } else {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

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
