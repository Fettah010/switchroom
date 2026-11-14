import { FileAudio, Info } from 'lucide-react';
import type { MediaDescriptor } from '../../workspaces/workspaceTypes';
import { formatFileSize } from '../../audio/fileValidation';

export function RelinkMediaNotice({
  originalDescriptor,
  editedDescriptor,
  hasOriginalFile,
  hasEditedFile,
}: {
  originalDescriptor: MediaDescriptor | null;
  editedDescriptor: MediaDescriptor | null;
  hasOriginalFile: boolean;
  hasEditedFile: boolean;
}) {
  const needsOriginal = Boolean(originalDescriptor && !hasOriginalFile);
  const needsEdited = Boolean(editedDescriptor && !hasEditedFile);

  if (!needsOriginal && !needsEdited) {
    return null;
  }

  return (
    <div className="relink-notice" role="region" aria-label="Audio relink notice">
      <div className="relink-notice__header">
        <Info size={16} className="relink-notice__icon" aria-hidden="true" />
        <div>
          <h3 className="relink-notice__title">Audio files must be selected again</h3>
          <p className="relink-notice__desc">
            Switchroom saves metadata locally, but your audio recordings never leave your device.
            Please reselect the audio files below to resume comparison playback.
          </p>
        </div>
      </div>

      <div className="relink-notice__items">
        {needsOriginal && originalDescriptor && (
          <div className="relink-notice__item">
            <span className="relink-notice__badge">Original A</span>
            <FileAudio size={14} aria-hidden="true" />
            <span className="relink-notice__filename">{originalDescriptor.fileName}</span>
            <span className="relink-notice__filesize">
              ({formatFileSize(originalDescriptor.sizeBytes)})
            </span>
          </div>
        )}

        {needsEdited && editedDescriptor && (
          <div className="relink-notice__item">
            <span className="relink-notice__badge">Edited B</span>
            <FileAudio size={14} aria-hidden="true" />
            <span className="relink-notice__filename">{editedDescriptor.fileName}</span>
            <span className="relink-notice__filesize">
              ({formatFileSize(editedDescriptor.sizeBytes)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
