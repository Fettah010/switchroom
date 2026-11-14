import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { usePreferences } from '../../hooks/usePreferences';
import { createDefaultWorkspace } from '../../workspaces/workspaceDefaults';
import {
  IndexedDbConnection,
  IndexedDbWorkspaceRepository,
} from '../../workspaces/indexedDbWorkspaceRepository';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import {
  downloadWorkspaceManifest,
  importWorkspaceManifestFile,
} from '../../workspaces/workspaceManifest';
import { StorageError, type LocalWorkspaceRepository } from '../../workspaces/workspaceRepository';
import type { AudioVersion, WorkspaceRecord } from '../../workspaces/workspaceTypes';
import { createMediaDescriptor } from '../../workspaces/workspaceValidation';
import { WorkspaceContext, type AppViewMode, type SaveStatus } from './workspaceContext';

export function WorkspaceProvider({
  children,
  customRepository,
  initialWorkspace = null,
  initialViewMode = 'home',
}: {
  children: ReactNode;
  customRepository?: LocalWorkspaceRepository;
  initialWorkspace?: WorkspaceRecord | null;
  initialViewMode?: AppViewMode;
}) {
  const { engine } = usePlayer();
  const { preferences, resetPreferences } = usePreferences();

  const [repository] = useState<LocalWorkspaceRepository>(() => {
    if (customRepository) {
      return customRepository;
    }
    const connection = IndexedDbConnection.getDefault();
    if (connection.isSupported()) {
      return new IndexedDbWorkspaceRepository(connection);
    }
    return new InMemoryWorkspaceRepository();
  });

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceRecord | null>(initialWorkspace);
  const [viewMode, setViewMode] = useState<AppViewMode>(initialViewMode);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialWorkspace ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [storageError, setStorageError] = useState<StorageError | null>(null);
  const [inMemoryWorkspaceId, setInMemoryWorkspaceId] = useState<string | null>(
    initialWorkspace?.id ?? null,
  );

  const saveTimer = useRef<number | null>(null);
  const latestWorkspaceRef = useRef<WorkspaceRecord | null>(null);

  useEffect(() => {
    latestWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  const refreshRecent = useCallback(async () => {
    try {
      const list = await repository.listRecent();
      setRecentWorkspaces(list);
      setStorageError(null);
    } catch (err) {
      if (err instanceof StorageError) {
        setStorageError(err);
      } else {
        setStorageError(new StorageError('read', (err as Error).message));
      }
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    repository
      .listRecent()
      .then((list) => {
        if (active) {
          setRecentWorkspaces(list);
          setStorageError(null);
        }
      })
      .catch((err) => {
        if (active) {
          if (err instanceof StorageError) {
            setStorageError(err);
          } else {
            setStorageError(new StorageError('read', (err as Error).message));
          }
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

  const detachMediaFromEngine = useCallback(() => {
    try {
      engine.removeFile('original');
      engine.removeFile('edited');
    } catch {
      // ignore
    }
  }, [engine]);

  const saveToRepo = useCallback(
    async (recordToSave: WorkspaceRecord): Promise<void> => {
      setSaveStatus('saving');
      setSaveError(null);
      try {
        const toSave = {
          ...recordToSave,
          updatedAt: new Date().toISOString(),
        };
        await repository.update(toSave);
        setActiveWorkspace((curr) => (curr?.id === toSave.id ? toSave : curr));
        setSaveStatus('saved');
        await refreshRecent();
      } catch (err) {
        setSaveStatus('error');
        const msg = err instanceof StorageError ? err.message : (err as Error).message;
        setSaveError(msg);
      }
    },
    [repository, refreshRecent],
  );

  const updateActiveWorkspace = useCallback(
    (patch: Partial<WorkspaceRecord>) => {
      setActiveWorkspace((prev) => {
        if (!prev) {
          return null;
        }
        const updated: WorkspaceRecord = {
          ...prev,
          ...patch,
        };

        if (
          typeof patch.preferredCrossfadeMs === 'number' &&
          patch.preferredCrossfadeMs !== prev.preferredCrossfadeMs
        ) {
          engine.setCrossfadeMs(patch.preferredCrossfadeMs);
        }

        setSaveStatus('unsaved');
        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current);
        }
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          saveToRepo(updated);
        }, 500);

        return updated;
      });
    },
    [engine, saveToRepo],
  );

  const saveActiveWorkspaceNow = useCallback(async (): Promise<void> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const current = latestWorkspaceRef.current;
    if (current) {
      await saveToRepo(current);
    }
  }, [saveToRepo]);

  const openHome = useCallback(async () => {
    if (saveTimer.current !== null) {
      await saveActiveWorkspaceNow();
    }
    setViewMode('home');
  }, [saveActiveWorkspaceNow]);

  const createWorkspace = useCallback(async (): Promise<WorkspaceRecord> => {
    detachMediaFromEngine();

    const newWs = createDefaultWorkspace(undefined, {
      defaultCrossfadeMs: preferences.defaultCrossfadeMs,
      defaultPresentationLayout: preferences.defaultPresentationLayout,
    });

    try {
      await repository.create(newWs);
      setStorageError(null);
    } catch (err) {
      if (err instanceof StorageError) {
        setStorageError(err);
      }
    }

    engine.setCrossfadeMs(newWs.preferredCrossfadeMs);
    setActiveWorkspace(newWs);
    setInMemoryWorkspaceId(newWs.id);
    setViewMode('editor');
    setSaveStatus('saved');
    await refreshRecent();
    return newWs;
  }, [detachMediaFromEngine, preferences, repository, engine, refreshRecent]);

  const openWorkspace = useCallback(
    async (id: string): Promise<void> => {
      if (saveTimer.current !== null) {
        await saveActiveWorkspaceNow();
      }

      const found = await repository.getById(id);
      if (!found) {
        return;
      }

      if (inMemoryWorkspaceId !== id) {
        detachMediaFromEngine();
        setInMemoryWorkspaceId(id);
      }

      const opened: WorkspaceRecord = {
        ...found,
        lastOpenedAt: new Date().toISOString(),
      };

      try {
        await repository.update(opened);
      } catch {
        // non-blocking
      }

      engine.setCrossfadeMs(opened.preferredCrossfadeMs);
      setActiveWorkspace(opened);
      setViewMode('editor');
      setSaveStatus('saved');
      setSaveError(null);
      await refreshRecent();
    },
    [
      saveActiveWorkspaceNow,
      repository,
      inMemoryWorkspaceId,
      detachMediaFromEngine,
      engine,
      refreshRecent,
    ],
  );

  const deleteWorkspace = useCallback(
    async (id: string): Promise<void> => {
      await repository.deleteById(id);
      if (activeWorkspace?.id === id) {
        detachMediaFromEngine();
        setActiveWorkspace(null);
        setInMemoryWorkspaceId(null);
        setViewMode('home');
      }
      await refreshRecent();
    },
    [repository, activeWorkspace, detachMediaFromEngine, refreshRecent],
  );

  const importManifest = useCallback(
    async (file: File): Promise<{ success: boolean; errors?: string[] }> => {
      const parsed = await importWorkspaceManifestFile(file);
      if (!parsed.valid || !parsed.workspaceRecord) {
        return { success: false, errors: parsed.errors };
      }

      detachMediaFromEngine();

      const newRecord = parsed.workspaceRecord;
      try {
        await repository.create(newRecord);
        setActiveWorkspace(newRecord);
        setInMemoryWorkspaceId(newRecord.id);
        engine.setCrossfadeMs(newRecord.preferredCrossfadeMs);
        setViewMode('editor');
        setSaveStatus('saved');
        setSaveError(null);
        await refreshRecent();
        return { success: true };
      } catch (err) {
        const msg = err instanceof StorageError ? err.message : (err as Error).message;
        return { success: false, errors: [msg] };
      }
    },
    [detachMediaFromEngine, repository, engine, refreshRecent],
  );

  const exportManifest = useCallback(
    (workspaceToExport?: WorkspaceRecord) => {
      const target = workspaceToExport ?? activeWorkspace;
      if (target) {
        downloadWorkspaceManifest(target);
      }
    },
    [activeWorkspace],
  );

  const enterPreview = useCallback(() => {
    if (activeWorkspace) {
      setViewMode('preview');
    }
  }, [activeWorkspace]);

  const exitPreview = useCallback(() => {
    setViewMode('editor');
  }, []);

  const updateMediaDescriptor = useCallback(
    (version: AudioVersion, file: File | null, duration?: number | null) => {
      setActiveWorkspace((prev) => {
        if (!prev) {
          return null;
        }

        const descriptor = file ? createMediaDescriptor(file, duration) : null;
        const updated: WorkspaceRecord = {
          ...prev,
          originalMedia: version === 'original' ? descriptor : prev.originalMedia,
          editedMedia: version === 'edited' ? descriptor : prev.editedMedia,
        };

        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current);
        }
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          saveToRepo(updated);
        }, 500);

        return updated;
      });
    },
    [saveToRepo],
  );

  const clearAllData = useCallback(async (): Promise<void> => {
    detachMediaFromEngine();
    try {
      await repository.clearAll();
      await resetPreferences();
    } catch {
      // non-blocking
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('switchroom.theme', 'system');
      } catch {
        // ignore
      }
    }

    setActiveWorkspace(null);
    setInMemoryWorkspaceId(null);
    setViewMode('home');
    setSaveStatus('idle');
    setSaveError(null);
    await refreshRecent();
  }, [detachMediaFromEngine, repository, resetPreferences, refreshRecent]);

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        viewMode,
        saveStatus,
        saveError,
        recentWorkspaces,
        isSettingsOpen,
        storageError,
        setIsSettingsOpen,
        openHome,
        createWorkspace,
        openWorkspace,
        updateActiveWorkspace,
        saveActiveWorkspaceNow,
        deleteWorkspace,
        importManifest,
        exportManifest,
        enterPreview,
        exitPreview,
        clearAllData,
        updateMediaDescriptor,
        refreshRecent,
        inMemoryWorkspaceId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
