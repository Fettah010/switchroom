import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_PREFERENCES } from '../../workspaces/workspaceDefaults';
import {
  IndexedDbConnection,
  IndexedDbPreferencesRepository,
} from '../../workspaces/indexedDbWorkspaceRepository';
import { InMemoryPreferencesRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import type { LocalPreferencesRepository } from '../../workspaces/workspaceRepository';
import type { LocalPreferences } from '../../workspaces/workspaceTypes';
import { PreferencesContext } from './preferencesContext';

export function PreferencesProvider({
  children,
  customRepository,
}: {
  children: ReactNode;
  customRepository?: LocalPreferencesRepository;
}) {
  const [repository] = useState<LocalPreferencesRepository>(() => {
    if (customRepository) {
      return customRepository;
    }
    const connection = IndexedDbConnection.getDefault();
    if (connection.isSupported()) {
      return new IndexedDbPreferencesRepository(connection);
    }
    return new InMemoryPreferencesRepository();
  });

  const [preferences, setPreferences] = useState<LocalPreferences>({ ...DEFAULT_PREFERENCES });

  useEffect(() => {
    let active = true;
    repository
      .get()
      .then((loaded) => {
        if (active) {
          setPreferences(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setPreferences({ ...DEFAULT_PREFERENCES });
        }
      });

    return () => {
      active = false;
    };
  }, [repository]);

  const updatePreferences = useCallback(
    async (patch: Partial<LocalPreferences>): Promise<LocalPreferences> => {
      const updated = await repository.update(patch);
      setPreferences(updated);
      return updated;
    },
    [repository],
  );

  const resetPreferences = useCallback(async (): Promise<void> => {
    await repository.reset();
    setPreferences({ ...DEFAULT_PREFERENCES });
  }, [repository]);

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        loading: false,
        updatePreferences,
        resetPreferences,
        repository,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
