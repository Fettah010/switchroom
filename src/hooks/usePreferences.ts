import { useContext } from 'react';
import {
  PreferencesContext,
  type PreferencesContextValue,
} from '../app/providers/preferencesContext';

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return ctx;
}
