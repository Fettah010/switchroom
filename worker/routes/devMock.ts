import { Hono } from 'hono';
import type { Env, UploadSessionRow } from '../types';

export const devMockRoute = new Hono<{ Bindings: Env }>();

function isLocalRequest(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Local development and testing mock endpoint for R2 direct upload (PUT).
 * Accepts raw audio stream from browser and stores it in the Worker's AUDIO_BUCKET binding.
 */
devMockRoute.put('/dev-r2-mock/:key', async (c) => {
  if (!isLocalRequest(c.req.url)) return c.text('Not found', 404);
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

  return new Response(null, { status: 200, headers: { ETag: '"mock-put-etag"' } });
});

/**
 * Local development and testing mock endpoint for multipart part uploads (PUT).
 * Accepts a part arrayBuffer, passes it to the R2 multipart upload, and returns an ETag.
 */
devMockRoute.put('/dev-r2-mock/multipart/:id/part/:partNumber', async (c) => {
  if (!isLocalRequest(c.req.url)) return c.text('Not found', 404);
  const uploadSessionId = decodeURIComponent(c.req.param('id'));
  const partNumber = parseInt(c.req.param('partNumber'), 10);

  if (!Number.isFinite(partNumber) || partNumber < 1) {
    return c.text('Invalid part number', 400);
  }

  const session = await c.env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ?')
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    return c.text('Upload session not found', 404);
  }

  const arrayBuffer = await c.req.raw.arrayBuffer();
  let etag = `"mock-part-${partNumber}-${arrayBuffer.byteLength}"`;

  if (
    c.env.AUDIO_BUCKET &&
    session.multipart_upload_id &&
    typeof c.env.AUDIO_BUCKET.resumeMultipartUpload === 'function'
  ) {
    try {
      const mp = c.env.AUDIO_BUCKET.resumeMultipartUpload(
        session.object_key,
        session.multipart_upload_id,
      );
      const uploaded = await mp.uploadPart(partNumber, arrayBuffer);
      if (uploaded?.etag) {
        etag = uploaded.etag.startsWith('"') ? uploaded.etag : `"${uploaded.etag}"`;
      }
    } catch (err) {
      console.warn('Dev mock multipart uploadPart fallback:', err);
    }
  }

  const headers = new Headers();
  headers.set('ETag', etag);
  headers.set('Access-Control-Expose-Headers', 'ETag');
  return new Response(null, { status: 200, headers });
});

/**
 * Local development and testing mock endpoint for R2 playback (GET).
 * Supports HTTP Range requests for seamless Web Audio / HTML5 audio playback.
 */
devMockRoute.get('/dev-r2-mock/:key', async (c) => {
  if (!isLocalRequest(c.req.url)) return c.text('Not found', 404);
  const key = decodeURIComponent(c.req.param('key'));

  if (!c.env.AUDIO_BUCKET) {
    return c.text('AUDIO_BUCKET binding not available', 503);
  }

  const rangeHeader = c.req.header('range');
  let range: R2Range | undefined;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match && match[1]) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : undefined;
      range = {
        offset: start,
        ...(end !== undefined ? { length: end - start + 1 } : {}),
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

  if (range && obj.range && 'offset' in obj.range) {
    const start = obj.range.offset ?? 0;
    const length =
      'length' in obj.range && typeof obj.range.length === 'number'
        ? obj.range.length
        : obj.size - start;
    const end = Math.min(start + length - 1, obj.size - 1);
    const contentLength = Math.max(0, end - start + 1);

    headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
    headers.set('Content-Length', contentLength.toString());

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
