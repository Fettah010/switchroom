import {
  CURRENT_MANIFEST_VERSION,
  MAX_MANIFEST_FILE_SIZE_BYTES,
  validateAndParseManifest,
  type ManifestParseResult,
} from './workspaceManifestValidation';
import type { WorkspaceManifest, WorkspaceRecord } from './workspaceTypes';
import { assertNoProhibitedProperties } from './workspaceValidation';

export function serializeWorkspaceToManifest(workspace: WorkspaceRecord): WorkspaceManifest {
  assertNoProhibitedProperties(workspace, 'serializeManifest');

  return {
    app: 'switchroom',
    manifestVersion: CURRENT_MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: {
      sourceWorkspaceId: workspace.id,
      title: workspace.title,
      description: workspace.description,
      labels: [...workspace.labels],
      notes: workspace.notes,
      preferredCrossfadeMs: workspace.preferredCrossfadeMs,
      presentationLayout: workspace.presentationLayout,
      originalMedia: workspace.originalMedia ? { ...workspace.originalMedia } : null,
      editedMedia: workspace.editedMedia ? { ...workspace.editedMedia } : null,
    },
  };
}

export function exportWorkspaceManifestJson(workspace: WorkspaceRecord): string {
  const manifest = serializeWorkspaceToManifest(workspace);
  return JSON.stringify(manifest, null, 2);
}

export function generateManifestFilename(title: string): string {
  const sanitized = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = sanitized.length > 0 ? sanitized.slice(0, 60) : 'comparison';
  return `${base}.switchroom.json`;
}

export function downloadWorkspaceManifest(workspace: WorkspaceRecord): void {
  const json = exportWorkspaceManifestJson(workspace);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const filename = generateManifestFilename(workspace.title);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function importWorkspaceManifestFile(file: File): Promise<ManifestParseResult> {
  if (file.size > MAX_MANIFEST_FILE_SIZE_BYTES) {
    return {
      valid: false,
      errors: [
        `Selected manifest file is too large (${(file.size / 1024).toFixed(1)} KB). Maximum allowed size is 1 MiB.`,
      ],
    };
  }

  try {
    const text = await file.text();
    return validateAndParseManifest(text);
  } catch (err) {
    return {
      valid: false,
      errors: [`Could not read file: ${(err as Error).message}`],
    };
  }
}
