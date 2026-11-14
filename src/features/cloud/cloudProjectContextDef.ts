import { createContext } from 'react';
import type { AuthProvidersInfo, AuthUserInfo, CloudProject } from './cloudTypes';

export interface CloudProjectContextValue {
  user: AuthUserInfo | null;
  isUserLoading: boolean;
  authProviders: AuthProvidersInfo;
  projects: CloudProject[];
  isLoadingProjects: boolean;
  isCloudSaveOpen: boolean;
  setIsCloudSaveOpen: (open: boolean) => void;
  isDashboardOpen: boolean;
  setIsDashboardOpen: (open: boolean) => void;
  refreshProjects: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  claimProject: (id: string) => Promise<void>;
  openCloudProjectInEditor: (project: CloudProject) => Promise<void>;
  reopenFromCapability: (projectId: string, capability: string) => Promise<boolean>;
}

export const CloudProjectContext = createContext<CloudProjectContextValue | null>(null);
