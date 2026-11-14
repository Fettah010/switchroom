import { createContext } from 'react';
import type { StorageError } from '../../workspaces/workspaceRepository';
import type { AudioVersion, WorkspaceRecord } from '../../workspaces/workspaceTypes';

export type AppViewMode = 'home' | 'editor' | 'preview';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';

export interface WorkspaceContextValue {
  activeWorkspace: WorkspaceRecord | null;
  viewMode: AppViewMode;
  saveStatus: SaveStatus;
  saveError: string | null;
  recentWorkspaces: WorkspaceRecord[];
  isSettingsOpen: boolean;
  storageError: StorageError | null;
  setIsSettingsOpen: (open: boolean) => void;
  openHome: () => void;
  createWorkspace: () => Promise<WorkspaceRecord>;
  openWorkspace: (id: string) => Promise<void>;
  updateActiveWorkspace: (patch: Partial<WorkspaceRecord>) => void;
  saveActiveWorkspaceNow: () => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  importManifest: (file: File) => Promise<{ success: boolean; errors?: string[] }>;
  exportManifest: (workspace?: WorkspaceRecord) => void;
  enterPreview: () => void;
  exitPreview: () => void;
  clearAllData: () => Promise<void>;
  updateMediaDescriptor: (
    version: AudioVersion,
    file: File | null,
    duration?: number | null,
  ) => void;
  refreshRecent: () => Promise<void>;
  inMemoryWorkspaceId: string | null;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
