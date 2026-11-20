// R2 Object storage service and S3 presigning for Switchroom v0.7.0

import { AwsClient } from 'aws4fetch';
import type { Env, AssetRole } from '../types';
import { generateOpaqueId } from './crypto';
import { QUOTA_POLICY } from '../config/quotas';

export function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Generates a safe, opaque object key. Never contains user-controlled filenames. */
export function generateObjectKey(projectId: string, role: AssetRole): string {
  const nonce = generateOpaqueId('asset');
  return `projects/${projectId}/${role}_${nonce}.audio`;
}

function getS3Client(env: Env): { client: AwsClient; bucket: string } | null {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const bucket = env.R2_BUCKET_NAME || 'switchroom-audio';
    const client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
    return { client, bucket };
  }
  return null;
}

/**
 * Creates a short-lived presigned PUT URL for browser-to-R2 direct upload.
 * Uses real S3 presigning when R2 credentials are configured, or falls back to
 * a local mock endpoint in local development/test environments.
 */
export async function createPresignedPutUrl(
  env: Env,
  origin: string,
  objectKey: string,
  mimeType: string,
  ttlSeconds = QUOTA_POLICY.uploadUrlTtlSeconds,
): Promise<string> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}`;
    const url = new URL(endpoint);
    url.searchParams.set('X-Amz-Expires', ttlSeconds.toString());

    const signed = await s3.client.sign(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      aws: {
        signQuery: true,
      },
    });

    return signed.url;
  }

  if (isLocalDevelopmentOrigin(origin)) {
    return `${origin}/api/dev-r2-mock/${encodeURIComponent(objectKey)}?type=${encodeURIComponent(mimeType)}`;
  }
  throw new Error('Private R2 upload signing is not configured');
}

/**
 * Initiates an R2/S3 multipart upload session and returns the provider uploadId.
 */
export async function createR2MultipartUpload(
  env: Env,
  objectKey: string,
  mimeType: string,
): Promise<string> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}?uploads`;
    const res = await s3.client.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to initiate S3 multipart upload: ${err}`);
    }
    const xml = await res.text();
    const match = xml.match(/<UploadId>(.+?)<\/UploadId>/);
    if (!match || !match[1]) {
      throw new Error(`Invalid S3 CreateMultipartUpload response XML: ${xml}`);
    }
    return match[1];
  }

  // Local development / Worker binding
  if (env.AUDIO_BUCKET && typeof env.AUDIO_BUCKET.createMultipartUpload === 'function') {
    const mp = await env.AUDIO_BUCKET.createMultipartUpload(objectKey, {
      httpMetadata: { contentType: mimeType },
    });
    return mp.uploadId;
  }

  // Fallback dev mock identifier
  return generateOpaqueId('mock_mp');
}

/**
 * Creates a short-lived presigned URL for uploading a specific part directly to R2.
 */
export async function createPresignedPartUrl(
  env: Env,
  origin: string,
  uploadSessionId: string,
  objectKey: string,
  uploadId: string,
  partNumber: number,
  ttlSeconds = QUOTA_POLICY.uploadUrlTtlSeconds,
): Promise<string> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}`;
    const url = new URL(endpoint);
    url.searchParams.set('partNumber', String(partNumber));
    url.searchParams.set('uploadId', uploadId);
    url.searchParams.set('X-Amz-Expires', ttlSeconds.toString());

    const signed = await s3.client.sign(url.toString(), {
      method: 'PUT',
      aws: {
        signQuery: true,
      },
    });

    return signed.url;
  }

  if (isLocalDevelopmentOrigin(origin)) {
    return `${origin}/api/dev-r2-mock/multipart/${encodeURIComponent(uploadSessionId)}/part/${partNumber}`;
  }
  throw new Error('Private R2 multipart upload signing is not configured');
}

export interface MultipartPartInput {
  partNumber: number;
  etag: string;
}

/**
 * Completes a multipart upload directly on R2/S3.
 */
export async function completeR2MultipartUpload(
  env: Env,
  objectKey: string,
  uploadId: string,
  parts: MultipartPartInput[],
): Promise<void> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}?uploadId=${encodeURIComponent(uploadId)}`;
    const xml = [
      '<CompleteMultipartUpload>',
      ...parts.map(
        (p) =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.startsWith('"') ? p.etag : `"${p.etag}"`}</ETag></Part>`,
      ),
      '</CompleteMultipartUpload>',
    ].join('');

    const res = await s3.client.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
      },
      body: xml,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to complete S3 multipart upload: ${err}`);
    }
    return;
  }

  // Local development / Worker binding
  if (env.AUDIO_BUCKET && typeof env.AUDIO_BUCKET.resumeMultipartUpload === 'function') {
    const mp = env.AUDIO_BUCKET.resumeMultipartUpload(objectKey, uploadId);
    await mp.complete(
      parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag.replace(/^"|"$/g, ''),
      })),
    );
  }
}

/**
 * Aborts a multipart upload directly on R2/S3 and reclaims staged parts.
 */
export async function abortR2MultipartUpload(
  env: Env,
  objectKey: string,
  uploadId: string,
): Promise<void> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}?uploadId=${encodeURIComponent(uploadId)}`;
    await s3.client.fetch(endpoint, {
      method: 'DELETE',
    });
    return;
  }

  if (env.AUDIO_BUCKET && typeof env.AUDIO_BUCKET.resumeMultipartUpload === 'function') {
    try {
      const mp = env.AUDIO_BUCKET.resumeMultipartUpload(objectKey, uploadId);
      await mp.abort();
    } catch (err) {
      console.warn(`R2 abortMultipartUpload warning for ${objectKey} (${uploadId}):`, err);
    }
  }
}

/**
 * Creates a short-lived presigned GET URL for owner-authorized temporary playback.
 */
export async function createPresignedGetUrl(
  env: Env,
  origin: string,
  objectKey: string,
  ttlSeconds = QUOTA_POLICY.playbackUrlTtlSeconds,
): Promise<string> {
  const s3 = getS3Client(env);
  if (s3) {
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3.bucket}/${objectKey}`;
    const url = new URL(endpoint);
    url.searchParams.set('X-Amz-Expires', ttlSeconds.toString());

    const signed = await s3.client.sign(url.toString(), {
      method: 'GET',
      aws: {
        signQuery: true,
      },
    });

    return signed.url;
  }

  if (isLocalDevelopmentOrigin(origin)) {
    return `${origin}/api/dev-r2-mock/${encodeURIComponent(objectKey)}`;
  }
  throw new Error('Private R2 playback signing is not configured');
}

export interface VerifiedHeadResult {
  exists: boolean;
  sizeBytes: number;
  contentType: string;
}

/**
 * Checks R2 object metadata directly via the Worker R2 binding.
 * Used for server-side upload completion verification.
 */
export async function verifyObjectHead(env: Env, objectKey: string): Promise<VerifiedHeadResult> {
  if (!env.AUDIO_BUCKET) {
    throw new Error('R2 AUDIO_BUCKET binding is not available');
  }

  const obj = await env.AUDIO_BUCKET.head(objectKey);
  if (!obj) {
    return { exists: false, sizeBytes: 0, contentType: '' };
  }

  return {
    exists: true,
    sizeBytes: obj.size,
    contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
  };
}

/**
 * Deletes an R2 object idempotently. A non-existent object counts as success.
 */
export async function deleteObject(env: Env, objectKey: string): Promise<void> {
  if (!env.AUDIO_BUCKET) return;
  try {
    await env.AUDIO_BUCKET.delete(objectKey);
  } catch (err) {
    // If not found or already deleted, treat as success
    console.warn(`R2 delete warning for ${objectKey}:`, err);
  }
}
