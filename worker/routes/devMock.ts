import { Hono } from 'hono';
import type { Env } from '../types';

export const devMockRoute = new Hono<{ Bindings: Env }>();

/**
 * Local development and testing mock endpoint for R2 direct upload (PUT).
 * Accepts raw audio stream from browser and stores it in the Worker's AUDIO_BUCKET binding.
 */
devMockRoute.put('/dev-r2-mock/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const contentType =
    c.req.header('content-type') || c.req.query('type') || 'application/octet-stream';

  if (!c.env.AUDIO_BUCKET) {
    return c.text('AUDIO_BUCKET binding not available', 503);
  }

  const arrayBuffer = await c.req.raw.arrayBuffer();

  await c.env.AUDIO_BUCKET.put(key, arrayBuffer, {
    httpMetadata: {
      contentType,
    },
  });

  return new Response(null, { status: 200 });
});

/**
 * Local development and testing mock endpoint for R2 playback (GET).
 * Supports HTTP Range requests for seamless Web Audio / HTML5 audio playback.
 */
devMockRoute.get('/dev-r2-mock/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));

  if (!c.env.AUDIO_BUCKET) {
    return c.text('AUDIO_BUCKET binding not available', 503);
  }

  const rangeHeader = c.req.header('range');
  let range: { offset?: number; length?: number } | undefined;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : undefined;
      range = {
        offset: start,
        length: end !== undefined ? end - start + 1 : undefined,
      };
    }
  }

  const obj = await c.env.AUDIO_BUCKET.get(key, range ? { range } : undefined);
  if (!obj) {
    return c.text('Object not found in mock storage', 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'audio/wav');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', obj.httpEtag || 'mock-etag');

  if (range && obj.range) {
    headers.set(
      'Content-Range',
      `bytes ${obj.range.offset}-${obj.range.offset + obj.size - 1}/${obj.size}`,
    );
    return new Response(obj.body as unknown as BodyInit, {
      status: 206,
      headers,
    });
  }

  headers.set('Content-Length', obj.size.toString());
  return new Response(obj.body as unknown as BodyInit, {
    status: 200,
    headers,
  });
});
