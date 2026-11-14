// R2 Object storage service and S3 presigning for Switchroom v0.5.0

import { AwsClient } from 'aws4fetch';
import type { Env, AssetRole } from '../types';
import { generateOpaqueId } from './crypto';
import { QUOTA_POLICY } from '../config/quotas';

/** Generates a safe, opaque object key. Never contains user-controlled filenames. */
export function generateObjectKey(projectId: string, role: AssetRole): string {
  const nonce = generateOpaqueId('asset');
  return `projects/${projectId}/${role}_${nonce}.audio`;
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
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const bucket = env.R2_BUCKET_NAME || 'switchroom-audio';
    const client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;
    const url = new URL(endpoint);
    url.searchParams.set('X-Amz-Expires', ttlSeconds.toString());

    const signed = await client.sign(url.toString(), {
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

  // Local development / test fallback: route directly through dev mock endpoint
  return `${origin}/api/dev-r2-mock/${encodeURIComponent(objectKey)}?type=${encodeURIComponent(mimeType)}`;
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
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const bucket = env.R2_BUCKET_NAME || 'switchroom-audio';
    const client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;
    const url = new URL(endpoint);
    url.searchParams.set('X-Amz-Expires', ttlSeconds.toString());

    const signed = await client.sign(url.toString(), {
      method: 'GET',
      aws: {
        signQuery: true,
      },
    });

    return signed.url;
  }

  // Local development / test fallback
  return `${origin}/api/dev-r2-mock/${encodeURIComponent(objectKey)}`;
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
