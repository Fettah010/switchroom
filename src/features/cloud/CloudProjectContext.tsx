// Cloud Project State & Context for Switchroom v0.5.0

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AuthProvidersInfo, AuthUserInfo, CloudProject } from './cloudTypes';
import {
  claimGuestProject,
  deleteCloudProject,
  exchangeGuestCapability,
  getAuthProviders,
  getCurrentUser,
  getPlaybackInfo,
  listBatchProjects,
  listUserProjects,
} from '../../lib/api/cloudApi';
import {
  getStoredGuestProjects,
  removeStoredGuestProject,
  saveGuestProject,
} from '../../lib/guestStorage';
import { usePlayer } from '../../hooks/usePlayer';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CloudProjectContext } from './cloudProjectContextDef';

export function CloudProjectProvider({ children }: { children: ReactNode }) {
  const { engine } = usePlayer();
  const { createWorkspace, updateActiveWorkspace } = useWorkspace();

  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [authProviders, setAuthProviders] = useState<AuthProvidersInfo>({
    guest: true,
    github: false,
    google: false,
    authAvailable: false,
  });

  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCloudSaveOpen, setIsCloudSaveOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  // 1. Fetch projects (account projects or guest local index)
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      if (user) {
        const list = await listUserProjects();
        setProjects(list);
      } else {
        const stored = getStoredGuestProjects();
        if (stored.length > 0) {
          const ids = stored.map((s) => s.id);
          const list = await listBatchProjects(ids);
          setProjects(list);
        } else {
          setProjects([]);
        }
      }
    } catch (err) {
      console.warn('Failed to refresh cloud projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [user]);

  // 2. Initial auth status check and initial project fetch
  useEffect(() => {
    let active = true;
    Promise.all([getAuthProviders(), getCurrentUser()])
      .then(async ([providers, currentUser]) => {
        if (!active) return;
        setAuthProviders(providers);
        setUser(currentUser);
        setIsUserLoading(false);

        // Fetch initial projects right after resolving user
        setIsLoadingProjects(true);
        try {
          if (currentUser) {
            const list = await listUserProjects();
            if (active) setProjects(list);
          } else {
            const stored = getStoredGuestProjects();
            if (stored.length > 0) {
              const ids = stored.map((s) => s.id);
              const list = await listBatchProjects(ids);
              if (active) setProjects(list);
            }
          }
        } catch {
          // ignore initial fetch error
        } finally {
          if (active) setIsLoadingProjects(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setIsUserLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // 3. Delete cloud project
  const deleteProject = useCallback(async (id: string) => {
    await deleteCloudProject(id);
    removeStoredGuestProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 4. Claim guest project into authenticated account
  const claimProject = useCallback(
    async (id: string, capability?: string) => {
      await claimGuestProject(id, capability);
      removeStoredGuestProject(id);
      await refreshProjects();
    },
    [refreshProjects],
  );

  // 5. Open cloud project into editor and stream audio into engine
  const openCloudProjectInEditor = useCallback(
    async (project: CloudProject) => {
      const originalInfo = await getPlaybackInfo(project.id, 'original');
      const editedInfo = await getPlaybackInfo(project.id, 'edited');

      await createWorkspace();

      updateActiveWorkspace({
        title: project.title,
        preferredCrossfadeMs: project.crossfade_ms,
        presentationLayout: project.presentation_layout,
      });

      engine.setCrossfadeMs(project.crossfade_ms);

      engine.loadRemoteUrl(
        'original',
        originalInfo.playbackUrl,
        originalInfo.filename,
        originalInfo.sizeBytes,
      );
      engine.loadRemoteUrl(
        'edited',
        editedInfo.playbackUrl,
        editedInfo.filename,
        editedInfo.sizeBytes,
      );

      setIsDashboardOpen(false);
    },
    [engine, createWorkspace, updateActiveWorkspace],
  );

  // 6. Restore guest access from secret capability link (#owner=<secret>&project=<id>)
  const reopenFromCapability = useCallback(
    async (projectId: string, capability: string): Promise<boolean> => {
      try {
        const project = await exchangeGuestCapability(projectId, capability);
        saveGuestProject(project.id, project.title);
        await refreshProjects();
        return true;
      } catch (err) {
        console.error('Failed to restore owner access from capability:', err);
        return false;
      }
    },
    [refreshProjects],
  );

  return (
    <CloudProjectContext.Provider
      value={{
        user,
        isUserLoading,
        authProviders,
        projects,
        isLoadingProjects,
        isCloudSaveOpen,
        setIsCloudSaveOpen,
        isDashboardOpen,
        setIsDashboardOpen,
        refreshProjects,
        deleteProject,
        claimProject,
        openCloudProjectInEditor,
        reopenFromCapability,
      }}
    >
      {children}
    </CloudProjectContext.Provider>
  );
}
