// Save to Cloud Modal with Direct R2 Upload & Progress for Switchroom v0.5.0

import { useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Copy, HardDrive, Lock, Upload, X } from 'lucide-react';
import type { RetentionDays, UploadProgressState } from './cloudTypes';
import { useCloudProjects } from './useCloudProjects';
import { useWorkspace } from '../../hooks/useWorkspace';
import { usePlayer } from '../../hooks/usePlayer';
import { getLoadedFile } from '../../audio/mediaFileRegistry';
import { formatFileSize } from '../../audio/fileValidation';
import {
  completeUploadSession,
  createCloudProject,
  initUploadSession,
  uploadFileToR2,
  cancelUploadSession,
} from '../../lib/api/cloudApi';
import { saveGuestProject } from '../../lib/guestStorage';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const RETENTION_OPTIONS: RetentionDays[] = [1, 7, 14, 30, 60, 90];

function SaveToCloudDialog({ onClose }: { onClose: () => void }) {
  const { user, refreshProjects } = useCloudProjects();
  const { activeWorkspace } = useWorkspace();
  const { snapshot } = usePlayer();

  const [title, setTitle] = useState(activeWorkspace?.title || 'Audio Comparison');
  const [retentionDays, setRetentionDays] = useState<RetentionDays>(30);
  const [isUploading, setIsUploading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [originalProgress, setOriginalProgress] = useState<UploadProgressState | null>(null);
  const [editedProgress, setEditedProgress] = useState<UploadProgressState | null>(null);

  // Completed guest project info
  const [savedProject, setSavedProject] = useState<{
    id: string;
    recoveryUrl?: string;
    isGuest: boolean;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const originalFile = getLoadedFile('original');
  const editedFile = getLoadedFile('edited');

  const originalTooLarge = Boolean(originalFile && originalFile.size > MAX_FILE_SIZE);
  const editedTooLarge = Boolean(editedFile && editedFile.size > MAX_FILE_SIZE);
  const canUpload =
    Boolean(originalFile && editedFile) &&
    !originalTooLarge &&
    !editedTooLarge &&
    !isUploading &&
    title.trim().length > 0;

  const handleCancelUpload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (activeSessionIdRef.current) {
      try {
        await cancelUploadSession(activeSessionIdRef.current);
      } catch {
        // ignore cancellation error
      }
    }
    setIsUploading(false);
    setGeneralError('Upload cancelled');
  };

  const handleStartUpload = async () => {
    if (!originalFile || !editedFile) return;

    setIsUploading(true);
    setGeneralError(null);
    setSavedProject(null);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // 1. Create cloud project record in D1
      const createRes = await createCloudProject({
        title: title.trim(),
        retentionDays,
        crossfadeMs: snapshot.crossfadeMs,
        presentationLayout: activeWorkspace?.presentationLayout || 'standard',
      });

      const projectId = createRes.project.id;
      const isGuest = Boolean(createRes.guestCapability);

      if (isGuest) {
        saveGuestProject(projectId, title.trim());
      }

      // 2. Upload Original (Slot A)
      setOriginalProgress({
        role: 'original',
        filename: originalFile.name,
        sizeBytes: originalFile.size,
        bytesUploaded: 0,
        status: 'preparing',
      });

      const origSession = await initUploadSession({
        projectId,
        role: 'original',
        filename: originalFile.name,
        sizeBytes: originalFile.size,
        mimeType: originalFile.type || 'audio/wav',
      });
      activeSessionIdRef.current = origSession.uploadSessionId;

      setOriginalProgress((prev) => (prev ? { ...prev, status: 'uploading' } : null));

      await uploadFileToR2(
        origSession.uploadUrl,
        originalFile,
        (loaded, total) => {
          setOriginalProgress((prev) =>
            prev ? { ...prev, bytesUploaded: loaded, sizeBytes: total } : null,
          );
        },
        signal,
      );

      setOriginalProgress((prev) => (prev ? { ...prev, status: 'verifying' } : null));
      await completeUploadSession(origSession.uploadSessionId);
      setOriginalProgress((prev) => (prev ? { ...prev, status: 'ready' } : null));

      // 3. Upload Edited (Slot B)
      setEditedProgress({
        role: 'edited',
        filename: editedFile.name,
        sizeBytes: editedFile.size,
        bytesUploaded: 0,
        status: 'preparing',
      });

      const editSession = await initUploadSession({
        projectId,
        role: 'edited',
        filename: editedFile.name,
        sizeBytes: editedFile.size,
        mimeType: editedFile.type || 'audio/wav',
      });
      activeSessionIdRef.current = editSession.uploadSessionId;

      setEditedProgress((prev) => (prev ? { ...prev, status: 'uploading' } : null));

      await uploadFileToR2(
        editSession.uploadUrl,
        editedFile,
        (loaded, total) => {
          setEditedProgress((prev) =>
            prev ? { ...prev, bytesUploaded: loaded, sizeBytes: total } : null,
          );
        },
        signal,
      );

      setEditedProgress((prev) => (prev ? { ...prev, status: 'verifying' } : null));
      await completeUploadSession(editSession.uploadSessionId);
      setEditedProgress((prev) => (prev ? { ...prev, status: 'ready' } : null));

      // 4. Finished successfully
      activeSessionIdRef.current = null;
      setIsUploading(false);
      setSavedProject({
        id: projectId,
        recoveryUrl: createRes.recoveryUrl,
        isGuest,
      });

      await refreshProjects();
    } catch (err: unknown) {
      if (signal.aborted) {
        setGeneralError('Upload was cancelled.');
      } else {
        setGeneralError((err as Error).message || 'Failed to complete cloud upload');
      }
      setIsUploading(false);
    }
  };

  const copyRecoveryLink = () => {
    if (savedProject?.recoveryUrl) {
      navigator.clipboard.writeText(savedProject.recoveryUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-cloud-title"
    >
      <div className="modal-content modal-content--cloud">
        <div className="modal-header">
          <div className="modal-title-group">
            <HardDrive size={18} className="modal-icon" aria-hidden="true" />
            <h2 id="save-cloud-title">Save to private cloud</h2>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={onClose}
            aria-label="Close"
            disabled={isUploading}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {savedProject ? (
            <div className="cloud-success-view">
              <div className="success-banner">
                <Check size={20} className="success-icon" />
                <div>
                  <h3>Project saved to private cloud</h3>
                  <p>Audio files are securely stored in your private R2 bucket.</p>
                </div>
              </div>

              {savedProject.isGuest && savedProject.recoveryUrl && (
                <div className="guest-recovery-card">
                  <div className="recovery-header">
                    <Lock size={16} />
                    <h4>Save your project-owner link</h4>
                  </div>
                  <p className="recovery-description">
                    Guest projects do not use a password. To reopen or manage this project later or
                    on another device, save this owner recovery link now.
                  </p>
                  <div className="recovery-link-box">
                    <input
                      type="text"
                      readOnly
                      value={savedProject.recoveryUrl}
                      aria-label="Owner recovery link"
                      className="recovery-input"
                    />
                    <button type="button" className="secondary-btn" onClick={copyRecoveryLink}>
                      {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedLink ? 'Copied!' : 'Copy link'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="primary-btn" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="cloud-explainer">
                Upload your Original and Edited tracks to private cloud storage. Local comparison
                continues to work completely offline.
              </p>

              {generalError && (
                <div className="error-banner" role="alert">
                  <AlertTriangle size={16} />
                  <span>{generalError}</span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="cloud-project-title">Project title</label>
                <input
                  id="cloud-project-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Comparison project title"
                  disabled={isUploading}
                  maxLength={120}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="cloud-retention">
                  <Clock size={14} aria-hidden="true" />
                  <span>Retention duration</span>
                </label>
                <div className="retention-picker">
                  {RETENTION_OPTIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`pill-btn ${retentionDays === days ? 'pill-btn--active' : ''}`}
                      onClick={() => setRetentionDays(days)}
                      disabled={isUploading}
                    >
                      {days} {days === 1 ? 'day' : 'days'}
                    </button>
                  ))}
                </div>
                <span className="field-hint">
                  Stored for {retentionDays} days. Expired projects will be shown with a countdown.
                </span>
              </div>

              <div className="file-review-list">
                <h4>Audio tracks to upload (100 MB max each)</h4>

                <div
                  className={`file-review-item ${originalTooLarge ? 'file-review-item--error' : ''}`}
                >
                  <div className="file-info">
                    <span className="role-badge">Track A (Original)</span>
                    <span className="file-name">
                      {originalFile?.name || 'No file selected in Slot A'}
                    </span>
                    <span className="file-size">
                      {originalFile ? formatFileSize(originalFile.size) : '—'}
                    </span>
                  </div>
                  {originalProgress && (
                    <div className="progress-info">
                      <span className="progress-status">{originalProgress.status}</span>
                      {originalProgress.status === 'uploading' && (
                        <span className="progress-percentage">
                          {Math.round(
                            (originalProgress.bytesUploaded / (originalProgress.sizeBytes || 1)) *
                              100,
                          )}
                          %
                        </span>
                      )}
                    </div>
                  )}
                  {originalTooLarge && <span className="file-error">Exceeds 100 MB limit</span>}
                </div>

                <div
                  className={`file-review-item ${editedTooLarge ? 'file-review-item--error' : ''}`}
                >
                  <div className="file-info">
                    <span className="role-badge">Track B (Edited)</span>
                    <span className="file-name">
                      {editedFile?.name || 'No file selected in Slot B'}
                    </span>
                    <span className="file-size">
                      {editedFile ? formatFileSize(editedFile.size) : '—'}
                    </span>
                  </div>
                  {editedProgress && (
                    <div className="progress-info">
                      <span className="progress-status">{editedProgress.status}</span>
                      {editedProgress.status === 'uploading' && (
                        <span className="progress-percentage">
                          {Math.round(
                            (editedProgress.bytesUploaded / (editedProgress.sizeBytes || 1)) * 100,
                          )}
                          %
                        </span>
                      )}
                    </div>
                  )}
                  {editedTooLarge && <span className="file-error">Exceeds 100 MB limit</span>}
                </div>
              </div>

              <div className="auth-ownership-status">
                {user ? (
                  <div className="auth-status-card">
                    <Check size={14} className="text-emerald-500" />
                    <span>
                      Signed in as <strong>{user.email}</strong>. This project will be linked to
                      your account.
                    </span>
                  </div>
                ) : (
                  <div className="auth-status-card">
                    <Lock size={14} />
                    <span>
                      Saving in <strong>Guest Creator</strong> mode. You will receive an owner
                      recovery link to manage this project.
                    </span>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                {isUploading ? (
                  <button type="button" className="danger-btn" onClick={handleCancelUpload}>
                    Cancel upload
                  </button>
                ) : (
                  <>
                    <button type="button" className="secondary-btn" onClick={onClose}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleStartUpload}
                      disabled={!canUpload}
                    >
                      <Upload size={15} />
                      <span>Start cloud upload</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SaveToCloudModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return <SaveToCloudDialog onClose={onClose} />;
}
