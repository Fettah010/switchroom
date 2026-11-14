import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, Tag, X } from 'lucide-react';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_LABELS_COUNT,
  MAX_LABEL_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_TITLE_LENGTH,
} from '../../workspaces/workspaceValidation';
import type { WorkspaceRecord } from '../../workspaces/workspaceTypes';
import { useWorkspace } from '../../hooks/useWorkspace';
import { WorkspaceSaveStatus } from './WorkspaceSaveStatus';
import { PresentationLayoutSelector } from '../presentation/PresentationLayoutSelector';
import { RangeControl } from '../../components/ui/RangeControl';
import { MIN_CROSSFADE_MS, MAX_CROSSFADE_MS } from '../../audio/crossfade';

export function WorkspaceMetadataEditor({ workspace }: { workspace: WorkspaceRecord }) {
  const { updateActiveWorkspace, saveStatus, saveError, saveActiveWorkspaceNow } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState('');

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.slice(0, MAX_TITLE_LENGTH);
    updateActiveWorkspace({ title: val });
  }

  function handleDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value.slice(0, MAX_DESCRIPTION_LENGTH);
    updateActiveWorkspace({ description: val });
  }

  function handleNotesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value.slice(0, MAX_NOTES_LENGTH);
    updateActiveWorkspace({ notes: val });
  }

  function handleAddLabel() {
    const trimmed = newLabelInput.trim();
    if (!trimmed) return;
    if (workspace.labels.length >= MAX_LABELS_COUNT) return;

    const lower = trimmed.toLowerCase();
    if (workspace.labels.some((l) => l.toLowerCase() === lower)) {
      setNewLabelInput('');
      return;
    }

    const nextLabels = [...workspace.labels, trimmed.slice(0, MAX_LABEL_LENGTH)];
    updateActiveWorkspace({ labels: nextLabels });
    setNewLabelInput('');
  }

  function handleRemoveLabel(labelToRemove: string) {
    const nextLabels = workspace.labels.filter((l) => l !== labelToRemove);
    updateActiveWorkspace({ labels: nextLabels });
  }

  function handleLabelKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddLabel();
    }
  }

  return (
    <section className="metadata-editor" aria-label="Comparison workspace details">
      <div className="metadata-editor__primary">
        <div className="metadata-editor__title-wrap">
          <label htmlFor="workspace-title-input" className="sr-only">
            Comparison title
          </label>
          <input
            id="workspace-title-input"
            type="text"
            className="metadata-editor__title-input"
            value={workspace.title}
            placeholder="Untitled comparison"
            maxLength={MAX_TITLE_LENGTH}
            onChange={handleTitleChange}
            onBlur={() => {
              if (!workspace.title.trim()) {
                updateActiveWorkspace({ title: 'Untitled comparison' });
              }
            }}
          />
        </div>

        <div className="metadata-editor__actions">
          <WorkspaceSaveStatus
            status={saveStatus}
            error={saveError}
            onRetry={saveActiveWorkspaceNow}
          />

          <PresentationLayoutSelector
            value={workspace.presentationLayout}
            onChange={(layout) => updateActiveWorkspace({ presentationLayout: layout })}
          />

          <button
            type="button"
            className="metadata-editor__toggle-btn"
            aria-expanded={isExpanded}
            aria-controls="metadata-editor-details"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>{isExpanded ? 'Hide details' : 'Edit details'}</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id="metadata-editor-details" className="metadata-editor__details">
          <div className="metadata-editor__grid">
            <div className="metadata-editor__field">
              <label htmlFor="workspace-desc" className="metadata-editor__label">
                Description
              </label>
              <textarea
                id="workspace-desc"
                className="metadata-editor__textarea"
                rows={2}
                placeholder="Notes for client or review context…"
                value={workspace.description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                onChange={handleDescriptionChange}
              />
              <span className="metadata-editor__char-count">
                {workspace.description.length} / {MAX_DESCRIPTION_LENGTH}
              </span>
            </div>

            <div className="metadata-editor__field">
              <label htmlFor="workspace-notes" className="metadata-editor__label">
                Internal notes
              </label>
              <textarea
                id="workspace-notes"
                className="metadata-editor__textarea"
                rows={2}
                placeholder="Checklist, mixing decisions or private notes…"
                value={workspace.notes}
                maxLength={MAX_NOTES_LENGTH}
                onChange={handleNotesChange}
              />
              <span className="metadata-editor__char-count">
                {workspace.notes.length} / {MAX_NOTES_LENGTH}
              </span>
            </div>
          </div>

          <div className="metadata-editor__bottom-row">
            <div className="metadata-editor__labels-field">
              <label htmlFor="new-label-input" className="metadata-editor__label">
                <Tag size={13} aria-hidden="true" />
                <span>
                  Labels ({workspace.labels.length}/{MAX_LABELS_COUNT})
                </span>
              </label>

              <div className="metadata-editor__labels-list">
                {workspace.labels.map((label) => (
                  <span key={label} className="metadata-editor__chip">
                    <span>{label}</span>
                    <button
                      type="button"
                      className="metadata-editor__chip-remove"
                      aria-label={`Remove label ${label}`}
                      onClick={() => handleRemoveLabel(label)}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}

                {workspace.labels.length < MAX_LABELS_COUNT && (
                  <div className="metadata-editor__add-label-wrap">
                    <input
                      id="new-label-input"
                      type="text"
                      className="metadata-editor__label-input"
                      placeholder="Add label…"
                      value={newLabelInput}
                      maxLength={MAX_LABEL_LENGTH}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      onKeyDown={handleLabelKeyDown}
                    />
                    <button
                      type="button"
                      className="metadata-editor__add-label-btn"
                      onClick={handleAddLabel}
                      disabled={!newLabelInput.trim()}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="metadata-editor__crossfade-field">
              <span className="metadata-editor__label">
                Workspace crossfade: {workspace.preferredCrossfadeMs} ms
              </span>
              <RangeControl
                value={workspace.preferredCrossfadeMs}
                progress={
                  (workspace.preferredCrossfadeMs - MIN_CROSSFADE_MS) /
                  (MAX_CROSSFADE_MS - MIN_CROSSFADE_MS)
                }
                min={MIN_CROSSFADE_MS}
                max={MAX_CROSSFADE_MS}
                step={20}
                aria-label="Preferred crossfade duration for this workspace"
                onChange={(e) =>
                  updateActiveWorkspace({ preferredCrossfadeMs: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
