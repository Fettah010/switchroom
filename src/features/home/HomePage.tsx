import { useRef, useState } from 'react';
import { AlertCircle, Cloud, FileUp, Plus } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useCloudProjects } from '../cloud/useCloudProjects';
import { Hero } from '../../components/layout/Hero';
import { RecentWorkspaces } from './RecentWorkspaces';

export function HomePage() {
  const {
    recentWorkspaces,
    storageError,
    createWorkspace,
    openWorkspace,
    exportManifest,
    deleteWorkspace,
    importManifest,
  } = useWorkspace();
  const { setIsDashboardOpen } = useCloudProjects();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const result = await importManifest(file);
    if (!result.success && result.errors) {
      setImportError(result.errors.join(' '));
    }
    e.target.value = '';
  }

  return (
    <div className="home-page">
      <Hero />

      <div className="home-page__actions-bar">
        <div className="home-page__primary-actions">
          <button type="button" className="primary-btn" onClick={createWorkspace}>
            <Plus size={16} aria-hidden="true" />
            <span>New comparison</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} aria-hidden="true" />
            <span>Import manifest</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => setIsDashboardOpen(true)}
            title="Open private cloud projects dashboard"
          >
            <Cloud size={16} aria-hidden="true" />
            <span>Cloud projects</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".json,application/json"
            aria-label="Import comparison manifest (.switchroom.json)"
            onChange={handleFileSelected}
          />
        </div>
      </div>

      {importError && (
        <div className="home-page__import-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{importError}</span>
        </div>
      )}

      <RecentWorkspaces
        workspaces={recentWorkspaces}
        storageError={storageError}
        onOpen={openWorkspace}
        onExport={exportManifest}
        onDelete={deleteWorkspace}
        onCreateNew={createWorkspace}
      />
    </div>
  );
}
