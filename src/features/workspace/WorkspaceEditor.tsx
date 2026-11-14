import { ArrowLeft, Download, Eye, Settings as SettingsIcon } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { usePlayer } from '../../hooks/usePlayer';
import { ComparisonWorkspace } from '../comparison/ComparisonWorkspace';
import { RelinkMediaNotice } from './RelinkMediaNotice';
import { WorkspaceMetadataEditor } from './WorkspaceMetadataEditor';

export function WorkspaceEditor() {
  const {
    activeWorkspace,
    openHome,
    enterPreview,
    exportManifest,
    setIsSettingsOpen,
    updateMediaDescriptor,
  } = useWorkspace();
  const { snapshot } = usePlayer();

  if (!activeWorkspace) {
    return null;
  }

  const hasOriginal = Boolean(snapshot.original.fileName);
  const hasEdited = Boolean(snapshot.edited.fileName);

  return (
    <div className="workspace-editor">
      <div className="workspace-editor__toolbar">
        <button
          type="button"
          className="workspace-editor__back-btn"
          onClick={openHome}
          aria-label="Back to all comparisons"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>All comparisons</span>
        </button>

        <div className="workspace-editor__toolbar-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={enterPreview}
            title="Open local presentation preview for client review"
          >
            <Eye size={15} aria-hidden="true" />
            <span>Client preview</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => exportManifest(activeWorkspace)}
            title="Download portable .switchroom.json manifest"
          >
            <Download size={15} aria-hidden="true" />
            <span>Export manifest</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            <SettingsIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <RelinkMediaNotice
        originalDescriptor={activeWorkspace.originalMedia}
        editedDescriptor={activeWorkspace.editedMedia}
        hasOriginalFile={hasOriginal}
        hasEditedFile={hasEdited}
      />

      <WorkspaceMetadataEditor workspace={activeWorkspace} />

      <ComparisonWorkspace
        workspace={activeWorkspace}
        layout={activeWorkspace.presentationLayout}
        onMediaChanged={updateMediaDescriptor}
      />
    </div>
  );
}
