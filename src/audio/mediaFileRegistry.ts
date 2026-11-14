// In-memory registry for actively loaded File objects in the current browser session.
// Used by SaveToCloudModal to access raw bytes for direct R2 presigned PUT upload.

import type { AudioVersion } from './audioTypes';

const activeFiles: Record<AudioVersion, File | null> = {
  original: null,
  edited: null,
};

export function setLoadedFile(version: AudioVersion, file: File | null): void {
  activeFiles[version] = file;
}

export function getLoadedFile(version: AudioVersion): File | null {
  return activeFiles[version];
}

export function clearLoadedFiles(): void {
  activeFiles.original = null;
  activeFiles.edited = null;
}
