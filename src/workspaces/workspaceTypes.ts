import type { AudioVersion } from '../audio/audioTypes';

export type { AudioVersion };

export type PresentationLayout =
  'standard' | 'player-focused' | 'waveform-focused' | 'compact-review';

export const PRESENTATION_LAYOUTS: readonly PresentationLayout[] = [
  'standard',
  'player-focused',
  'waveform-focused',
  'compact-review',
] as const;

export interface MediaDescriptor {
  fileName: string;
  extension: string | null;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  durationSeconds: number | null;
}

export interface WorkspaceRecord {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  labels: string[];
  notes: string;
  preferredCrossfadeMs: number;
  presentationLayout: PresentationLayout;
  originalMedia: MediaDescriptor | null;
  editedMedia: MediaDescriptor | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export type MotionPreference = 'system' | 'reduced';

export interface LocalPreferences {
  motionPreference: MotionPreference;
  defaultCrossfadeMs: number;
  defaultPresentationLayout: PresentationLayout;
}

export interface WorkspaceManifestWorkspace {
  sourceWorkspaceId?: string;
  title: string;
  description: string;
  labels: string[];
  notes: string;
  preferredCrossfadeMs: number;
  presentationLayout: PresentationLayout;
  originalMedia: MediaDescriptor | null;
  editedMedia: MediaDescriptor | null;
}

export interface WorkspaceManifest {
  app: 'switchroom';
  manifestVersion: 1;
  exportedAt: string;
  workspace: WorkspaceManifestWorkspace;
}

export type MediaRelinkStatus = 'matched' | 'unlinked' | 'mismatch' | 'ready';

export interface MediaSlotDescriptorState {
  version: AudioVersion;
  descriptor: MediaDescriptor | null;
  status: MediaRelinkStatus;
  mismatchReason?: string;
}
