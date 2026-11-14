import { DEFAULT_CROSSFADE_MS } from '../audio/crossfade';
import type { LocalPreferences, WorkspaceRecord } from './workspaceTypes';

export const CURRENT_WORKSPACE_SCHEMA_VERSION = 1 as const;

export const DEFAULT_PREFERENCES: LocalPreferences = {
  motionPreference: 'system',
  defaultCrossfadeMs: DEFAULT_CROSSFADE_MS,
  defaultPresentationLayout: 'standard',
};

export function generateWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Safe fallback if crypto.randomUUID is somehow unavailable
  return 'ws_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function createDefaultWorkspace(
  id?: string,
  defaults?: Partial<LocalPreferences>,
): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id: id ?? generateWorkspaceId(),
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    title: 'Untitled comparison',
    description: '',
    labels: [],
    notes: '',
    preferredCrossfadeMs: defaults?.defaultCrossfadeMs ?? DEFAULT_PREFERENCES.defaultCrossfadeMs,
    presentationLayout:
      defaults?.defaultPresentationLayout ?? DEFAULT_PREFERENCES.defaultPresentationLayout,
    originalMedia: null,
    editedMedia: null,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
}
