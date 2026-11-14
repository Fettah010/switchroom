// Cryptographic utilities for Switchroom v0.5.0 using standard Web Crypto

/** Generates a cryptographically random, high-entropy guest owner capability secret. */
export function generateGuestOwnerCapability(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sw_owner_${token}`;
}

/** Computes the SHA-256 hexadecimal hash of an input string. */
export async function hashCapability(capability: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(capability);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generates an opaque random UUID/identifier. */
export function generateOpaqueId(prefix = 'proj'): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${uuid}`;
}

/** Sanitizes user-provided filenames to prevent injection or invalid characters. */
export function sanitizeFilename(filename: string): string {
  // Strip path traversal and control characters
  const base = filename.replace(/^.*[/\\]/, '');
  const clean = base.replace(/[^\w.\-\s]/g, '_').trim();
  return clean.slice(0, 180) || 'unnamed-audio';
}
