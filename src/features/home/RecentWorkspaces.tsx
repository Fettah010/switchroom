import { AlertTriangle, Clock, Layers } from 'lucide-react';
import type { WorkspaceRecord } from '../../workspaces/workspaceTypes';
import { WorkspaceCard } from './WorkspaceCard';
import type { StorageError } from '../../workspaces/workspaceRepository';

export function RecentWorkspaces({
  workspaces,
  storageError,
  onOpen,
  onExport,
  onDelete,
  onCreateNew,
}: {
  workspaces: WorkspaceRecord[];
  storageError: StorageError | null;
  onOpen: (id: string) => void;
  onExport: (ws: WorkspaceRecord) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <section className="recent-workspaces" aria-labelledby="recent-workspaces-heading">
      <div className="recent-workspaces__header">
        <div className="recent-workspaces__title-wrap">
          <Clock size={16} className="recent-workspaces__icon" aria-hidden="true" />
          <h2 className="recent-workspaces__heading" id="recent-workspaces-heading">
            Recent comparisons
          </h2>
        </div>
        <span className="recent-workspaces__count">
          {workspaces.length} saved {workspaces.length === 1 ? 'setup' : 'setups'}
        </span>
      </div>

      {storageError && (
        <div className="recent-workspaces__storage-error" role="alert">
          <AlertTriangle size={18} className="recent-workspaces__error-icon" aria-hidden="true" />
          <div>
            <p className="recent-workspaces__error-title">Local storage unavailable</p>
            <p className="recent-workspaces__error-msg">
              {storageError.message} You can still compare audio in memory for this session using
              New comparison.
            </p>
          </div>
        </div>
      )}

      {workspaces.length === 0 && !storageError && (
        <div className="recent-workspaces__empty">
          <Layers size={32} className="recent-workspaces__empty-icon" aria-hidden="true" />
          <h3 className="recent-workspaces__empty-title">No saved comparisons yet</h3>
          <p className="recent-workspaces__empty-desc">
            Create a comparison to name your listening sessions, save preferred crossfade durations,
            and keep custom notes. Your audio files always remain on your device.
          </p>
          <button type="button" className="primary-btn" onClick={onCreateNew}>
            Start your first comparison
          </button>
        </div>
      )}

      {workspaces.length > 0 && (
        <div className="recent-workspaces__list" role="list">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onOpen={onOpen}
              onExport={onExport}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
