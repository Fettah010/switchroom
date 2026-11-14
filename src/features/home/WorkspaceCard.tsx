import { useState } from 'react';
import { Download, FileAudio, FolderOpen, Tag, Trash2 } from 'lucide-react';
import type { WorkspaceRecord } from '../../workspaces/workspaceTypes';

export function WorkspaceCard({
  workspace,
  onOpen,
  onExport,
  onDelete,
}: {
  workspace: WorkspaceRecord;
  onOpen: (id: string) => void;
  onExport: (ws: WorkspaceRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const formattedDate = new Date(workspace.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const hasOriginalDesc = Boolean(workspace.originalMedia);
  const hasEditedDesc = Boolean(workspace.editedMedia);

  return (
    <article className="workspace-card" aria-labelledby={`workspace-card-title-${workspace.id}`}>
      <div className="workspace-card__main">
        <div className="workspace-card__header">
          <button
            type="button"
            className="workspace-card__title-btn"
            id={`workspace-card-title-${workspace.id}`}
            onClick={() => onOpen(workspace.id)}
          >
            {workspace.title}
          </button>
          <span className="workspace-card__date">{formattedDate}</span>
        </div>

        {workspace.description && <p className="workspace-card__desc">{workspace.description}</p>}

        {workspace.labels.length > 0 && (
          <div className="workspace-card__labels" aria-label="Labels">
            {workspace.labels.map((l) => (
              <span key={l} className="workspace-card__chip">
                <Tag size={10} aria-hidden="true" />
                {l}
              </span>
            ))}
          </div>
        )}

        <div className="workspace-card__meta">
          <span className="workspace-card__crossfade">
            {workspace.preferredCrossfadeMs} ms crossfade
          </span>

          <span className="workspace-card__layout">{workspace.presentationLayout} layout</span>

          <span className="workspace-card__media-hint">
            <FileAudio size={12} aria-hidden="true" />
            {hasOriginalDesc && hasEditedDesc
              ? `${workspace.originalMedia?.fileName} vs ${workspace.editedMedia?.fileName}`
              : hasOriginalDesc
                ? `${workspace.originalMedia?.fileName} (waiting for Edited)`
                : 'Needs audio selection'}
          </span>
        </div>
      </div>

      <div className="workspace-card__actions">
        <button
          type="button"
          className="workspace-card__btn workspace-card__btn--primary"
          onClick={() => onOpen(workspace.id)}
          aria-label={`Open comparison ${workspace.title}`}
        >
          <FolderOpen size={14} aria-hidden="true" />
          <span>Open</span>
        </button>

        <button
          type="button"
          className="workspace-card__btn"
          onClick={() => onExport(workspace)}
          aria-label={`Export manifest for ${workspace.title}`}
          title="Export manifest (.switchroom.json)"
        >
          <Download size={14} aria-hidden="true" />
          <span>Export</span>
        </button>

        {!confirmingDelete ? (
          <button
            type="button"
            className="workspace-card__btn workspace-card__btn--danger"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete comparison ${workspace.title}`}
            title="Delete local workspace"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete</span>
          </button>
        ) : (
          <div className="workspace-card__confirm-delete" role="alert">
            <span className="workspace-card__confirm-text">Delete metadata?</span>
            <button
              type="button"
              className="workspace-card__confirm-btn workspace-card__confirm-btn--danger"
              onClick={() => onDelete(workspace.id)}
              aria-label={`Confirm delete of ${workspace.title}`}
            >
              Confirm
            </button>
            <button
              type="button"
              className="workspace-card__confirm-btn"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
