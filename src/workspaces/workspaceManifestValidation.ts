import { CURRENT_WORKSPACE_SCHEMA_VERSION, generateWorkspaceId } from './workspaceDefaults';
import type { WorkspaceManifest, WorkspaceRecord } from './workspaceTypes';
import {
  assertNoProhibitedProperties,
  validateCrossfadeMs,
  validateMediaDescriptor,
  validatePresentationLayout,
  validateWorkspaceDescription,
  validateWorkspaceLabels,
  validateWorkspaceNotes,
  validateWorkspaceTitle,
} from './workspaceValidation';

export const CURRENT_MANIFEST_VERSION = 1 as const;
export const MAX_MANIFEST_FILE_SIZE_BYTES = 1024 * 1024; // 1 MiB

export interface ManifestParseResult {
  valid: boolean;
  manifest?: WorkspaceManifest;
  workspaceRecord?: WorkspaceRecord;
  errors: string[];
}

export function validateAndParseManifest(jsonString: string): ManifestParseResult {
  if (typeof jsonString !== 'string') {
    return { valid: false, errors: ['Manifest data must be a string.'] };
  }

  if (new Blob([jsonString]).size > MAX_MANIFEST_FILE_SIZE_BYTES) {
    return {
      valid: false,
      errors: [`Manifest exceeds maximum allowed size of 1 MiB.`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid JSON format: ${(err as Error).message}`],
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, errors: ['Manifest root must be an object.'] };
  }

  try {
    assertNoProhibitedProperties(parsed, 'manifest');
  } catch (err) {
    return { valid: false, errors: [(err as Error).message] };
  }

  const root = parsed as Record<string, unknown>;
  const errors: string[] = [];

  if (root.app !== 'switchroom') {
    errors.push(`Invalid application identifier "${String(root.app)}". Expected "switchroom".`);
  }

  if (root.manifestVersion !== CURRENT_MANIFEST_VERSION) {
    errors.push(
      `Unsupported manifest version: ${String(root.manifestVersion)}. Only version 1 is supported in Switchroom v0.4.0.`,
    );
  }

  if (typeof root.workspace !== 'object' || root.workspace === null) {
    errors.push('Manifest is missing a valid "workspace" object.');
    return { valid: false, errors };
  }

  const ws = root.workspace as Record<string, unknown>;

  const titleRes = validateWorkspaceTitle(ws.title);
  if (!titleRes.valid && titleRes.error) {
    errors.push(titleRes.error);
  }

  const descRes = validateWorkspaceDescription(ws.description);
  if (!descRes.valid && descRes.error) {
    errors.push(descRes.error);
  }

  const labelsRes = validateWorkspaceLabels(ws.labels);
  if (!labelsRes.valid && labelsRes.error) {
    errors.push(labelsRes.error);
  }

  const notesRes = validateWorkspaceNotes(ws.notes);
  if (!notesRes.valid && notesRes.error) {
    errors.push(notesRes.error);
  }

  const crossfadeRes = validateCrossfadeMs(ws.preferredCrossfadeMs);
  if (!crossfadeRes.valid && crossfadeRes.error) {
    errors.push(crossfadeRes.error);
  }

  const layoutRes = validatePresentationLayout(ws.presentationLayout);
  if (!layoutRes.valid && layoutRes.error) {
    errors.push(layoutRes.error);
  }

  const origRes = validateMediaDescriptor(ws.originalMedia);
  if (!origRes.valid && origRes.error) {
    errors.push(`Original media: ${origRes.error}`);
  }

  const editRes = validateMediaDescriptor(ws.editedMedia);
  if (!editRes.valid && editRes.error) {
    errors.push(`Edited media: ${editRes.error}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const manifest: WorkspaceManifest = {
    app: 'switchroom',
    manifestVersion: CURRENT_MANIFEST_VERSION,
    exportedAt:
      typeof root.exportedAt === 'string' && !isNaN(Date.parse(root.exportedAt))
        ? root.exportedAt
        : new Date().toISOString(),
    workspace: {
      sourceWorkspaceId:
        typeof ws.sourceWorkspaceId === 'string' ? ws.sourceWorkspaceId.slice(0, 100) : undefined,
      title: titleRes.value,
      description: descRes.value,
      labels: labelsRes.value,
      notes: notesRes.value,
      preferredCrossfadeMs: crossfadeRes.value,
      presentationLayout: layoutRes.value,
      originalMedia: origRes.value,
      editedMedia: editRes.value,
    },
  };

  const now = new Date().toISOString();
  // Always assign a new local workspace ID so imported workspace never overwrites existing ID
  const workspaceRecord: WorkspaceRecord = {
    id: generateWorkspaceId(),
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    title: manifest.workspace.title,
    description: manifest.workspace.description,
    labels: manifest.workspace.labels,
    notes: manifest.workspace.notes,
    preferredCrossfadeMs: manifest.workspace.preferredCrossfadeMs,
    presentationLayout: manifest.workspace.presentationLayout,
    originalMedia: manifest.workspace.originalMedia,
    editedMedia: manifest.workspace.editedMedia,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };

  return {
    valid: true,
    manifest,
    workspaceRecord,
    errors: [],
  };
}
