import { useEffect } from 'react';
import type { ABAudioEngine } from '../audio/ABAudioEngine';
import { ThemeProvider } from './providers/ThemeProvider';
import { PlayerProvider } from './providers/PlayerProvider';
import { PreferencesProvider } from './providers/PreferencesProvider';
import { WorkspaceProvider } from './providers/WorkspaceProvider';
import { CloudProjectProvider } from '../features/cloud/CloudProjectContext';
import { useCloudProjects } from '../features/cloud/useCloudProjects';
import { SaveToCloudModal } from '../features/cloud/SaveToCloudModal';
import { CloudDashboardModal } from '../features/cloud/CloudDashboardModal';
import { useWorkspace } from '../hooks/useWorkspace';
import { TopBar } from '../components/layout/TopBar';
import { Reveal } from '../components/motion/Reveal';
import { PageAtmosphere } from '../components/layout/PageAtmosphere';
import { Footer } from '../components/layout/Footer';
import { HomePage } from '../features/home/HomePage';
import { WorkspaceEditor } from '../features/workspace/WorkspaceEditor';
import { ClientPreview } from '../features/presentation/ClientPreview';
import { SettingsPanel } from '../features/settings/SettingsPanel';

import type { LocalWorkspaceRepository } from '../workspaces/workspaceRepository';
import type { WorkspaceRecord } from '../workspaces/workspaceTypes';
import type { AppViewMode } from './providers/workspaceContext';

function AppContent() {
  const { viewMode, isSettingsOpen, setIsSettingsOpen } = useWorkspace();
  const {
    isCloudSaveOpen,
    setIsCloudSaveOpen,
    isDashboardOpen,
    setIsDashboardOpen,
    reopenFromCapability,
  } = useCloudProjects();

  // Automatic recovery link handling: #owner=<capability>&project=<id>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/#owner=(sw_owner_[0-9a-f]+)&project=([^&]+)/);
      if (match && match[1] && match[2]) {
        const capability = match[1];
        const projectId = match[2];
        reopenFromCapability(projectId, capability).then((ok) => {
          if (ok) {
            window.history.replaceState(null, '', window.location.pathname);
            setIsDashboardOpen(true);
          }
        });
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => {
      window.removeEventListener('hashchange', checkHash);
    };
  }, [reopenFromCapability, setIsDashboardOpen]);

  return (
    <div className="page">
      <PageAtmosphere />

      <div className="page__content">
        <Reveal className="site-header-wrap" viewport={false}>
          <TopBar />
        </Reveal>

        <main id="main">
          {viewMode === 'home' && <HomePage />}
          {viewMode === 'editor' && <WorkspaceEditor />}
          {viewMode === 'preview' && <ClientPreview />}
        </main>

        <Reveal viewport duration={320}>
          <Footer />
        </Reveal>
      </div>

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <SaveToCloudModal isOpen={isCloudSaveOpen} onClose={() => setIsCloudSaveOpen(false)} />
      <CloudDashboardModal isOpen={isDashboardOpen} onClose={() => setIsDashboardOpen(false)} />
    </div>
  );
}

import { createDefaultWorkspace } from '../workspaces/workspaceDefaults';

export function App({
  engine,
  initialWorkspace,
  initialViewMode,
  customRepository,
}: {
  engine?: ABAudioEngine;
  initialWorkspace?: WorkspaceRecord | null;
  initialViewMode?: AppViewMode;
  customRepository?: LocalWorkspaceRepository;
}) {
  const resolvedViewMode = initialViewMode ?? (engine ? 'editor' : 'home');
  const resolvedWorkspace =
    initialWorkspace !== undefined
      ? initialWorkspace
      : resolvedViewMode === 'editor'
        ? createDefaultWorkspace()
        : null;

  return (
    <ThemeProvider>
      <PlayerProvider engine={engine}>
        <PreferencesProvider>
          <WorkspaceProvider
            customRepository={customRepository}
            initialWorkspace={resolvedWorkspace}
            initialViewMode={resolvedViewMode}
          >
            <CloudProjectProvider>
              <a className="skip-link" href="#main">
                Skip to comparison
              </a>
              <AppContent />
            </CloudProjectProvider>
          </WorkspaceProvider>
        </PreferencesProvider>
      </PlayerProvider>
    </ThemeProvider>
  );
}
