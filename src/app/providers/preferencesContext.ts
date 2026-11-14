import { createContext } from 'react';
import type { LocalPreferencesRepository } from '../../workspaces/workspaceRepository';
import type { LocalPreferences } from '../../workspaces/workspaceTypes';

export interface PreferencesContextValue {
  preferences: LocalPreferences;
  loading: boolean;
  updatePreferences: (patch: Partial<LocalPreferences>) => Promise<LocalPreferences>;
  resetPreferences: () => Promise<void>;
  repository: LocalPreferencesRepository;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);
