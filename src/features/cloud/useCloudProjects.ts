// Hook for using Cloud Projects context

import { useContext } from 'react';
import { CloudProjectContext, type CloudProjectContextValue } from './cloudProjectContextDef';

export function useCloudProjects(): CloudProjectContextValue {
  const context = useContext(CloudProjectContext);
  if (!context) {
    throw new Error('useCloudProjects must be used within a CloudProjectProvider');
  }
  return context;
}
