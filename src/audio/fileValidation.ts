/** File intake rules. Nothing here reads, converts or uploads file bytes. */

export const SUPPORTED_EXTENSIONS = ['wav', 'mp3', 'flac', 'aac', 'm4a'] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export const MIME_BY_EXTENSION: Record<SupportedExtension, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
};

const SUPPORTED_SET = new Set<string>(SUPPORTED_EXTENSIONS);

const AUDIO_MIME_PREFIX = 'audio/';

export function getFileExtension(fileName: string): string | null {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');

  if (dot <= 0 || dot === trimmed.length - 1) {
    return null;
  }

  return trimmed.slice(dot + 1).toLowerCase();
}

export function isSupportedExtension(extension: string | null): extension is SupportedExtension {
  return extension !== null && SUPPORTED_SET.has(extension);
}

export type FileValidationResult = { ok: true; file: File } | { ok: false; message: string };

/**
 * Validates the file envelope only: one file, a supported extension, a non-empty
 * body and a plausible MIME family. The real compatibility check is the browser
 * loading and decoding the media.
 */
export function validateAudioFile(file: File): FileValidationResult {
  if (file.size === 0) {
    return {
      ok: false,
      message: 'This file is empty. Choose an audio file with sound in it.',
    };
  }

  const extension = getFileExtension(file.name);

  if (!isSupportedExtension(extension)) {
    return {
      ok: false,
      message: 'Choose a WAV, MP3, FLAC, AAC or M4A file.',
    };
  }

  const mime = file.type.trim().toLowerCase();

  // File.type is frequently blank, and some browsers report container types
  // such as video/mp4 for M4A. Only reject a MIME family that clearly cannot
  // be audio; never reject a supported extension solely for a missing type.
  if (mime && !mime.startsWith(AUDIO_MIME_PREFIX) && mime !== 'video/mp4') {
    return {
      ok: false,
      message: "This doesn't look like an audio file. Try a WAV, MP3, FLAC, AAC or M4A export.",
    };
  }

  return { ok: true, file };
}

/**
 * A soft compatibility hint. An empty `canPlayType` result is not proof of
 * failure, so this produces a warning, never a rejection.
 */
export function compatibilityWarning(
  file: File,
  canPlayType: (mimeType: string) => string,
): string | null {
  const extension = getFileExtension(file.name);

  if (!isSupportedExtension(extension)) {
    return null;
  }

  if (canPlayType(MIME_BY_EXTENSION[extension])) {
    return null;
  }

  return 'Your browser did not report support for this format. Loading will still be attempted.';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
