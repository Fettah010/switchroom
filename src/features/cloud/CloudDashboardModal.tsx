// Creator Cloud Dashboard Modal for Switchroom v0.7.0

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Lock,
  MessageSquare,
  RefreshCw,
  Share2,
  ThumbsUp,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CloudProject } from './cloudTypes';
import { useCloudProjects } from './useCloudProjects';
import { formatFileSize } from '../../audio/fileValidation';
import { ShareDialog } from '../../components/share/ShareDialog';
import { listProjectComments, type CommentItem } from '../../lib/api/feedbackApi';
import { getUserStorageSummary, type StorageUsageSummary } from '../../lib/api/cloudApi';

function formatExpiryTime(expiresAt: number, currentTime: number): string {
  const remainingMs = expiresAt - currentTime;
  if (remainingMs <= 0) {
    return 'Expired';
  }
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }
  return `${hours}h remaining`;
}

function formatCommentTime(timestampMs: number | null): string {
  if (timestampMs === null || timestampMs === undefined) return 'General';
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function CloudDashboardModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const {
    user,
    projects,
    isLoadingProjects,
    refreshProjects,
    deleteProject,
    claimProject,
    openCloudProjectInEditor,
  } = useCloudProjects();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [sharingProjectId, setSharingProjectId] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  // v0.7.0 additions: Storage summary & Comments drawer
  const [userStorage, setUserStorage] = useState<StorageUsageSummary | null>(null);
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentItem[]>>({});
  const [loadingCommentsId, setLoadingCommentsId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (user) {
      getUserStorageSummary()
        .then(setUserStorage)
        .catch(() => setUserStorage(null));
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleOpen = async (project: CloudProject) => {
    setOpeningId(project.id);
    setDashboardError(null);
    try {
      await openCloudProjectInEditor(project);
      onClose();
    } catch (err: unknown) {
      setDashboardError((err as Error).message || 'Failed to open cloud project');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (
      !window.confirm(
        'Delete this cloud project and all its audio files from private storage? This cannot be undone.',
      )
    ) {
      return;
    }
    setDeletingId(projectId);
    setDashboardError(null);
    try {
      await deleteProject(projectId);
      if (user) {
        getUserStorageSummary()
          .then(setUserStorage)
          .catch(() => {});
      }
    } catch (err: unknown) {
      setDashboardError((err as Error).message || 'Failed to delete cloud project');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClaim = async (projectId: string) => {
    setClaimingId(projectId);
    setDashboardError(null);
    try {
      await claimProject(projectId);
    } catch (err: unknown) {
      setDashboardError((err as Error).message || 'Failed to claim project');
    } finally {
      setClaimingId(null);
    }
  };

  const toggleComments = async (projectId: string) => {
    if (expandedCommentsId === projectId) {
      setExpandedCommentsId(null);
      return;
    }
    setExpandedCommentsId(projectId);
    if (!commentsMap[projectId]) {
      setLoadingCommentsId(projectId);
      try {
        const res = await listProjectComments(projectId);
        setCommentsMap((prev) => ({ ...prev, [projectId]: res.comments }));
      } catch {
        setCommentsMap((prev) => ({ ...prev, [projectId]: [] }));
      } finally {
        setLoadingCommentsId(null);
      }
    }
  };

  // Compute storage info for display
  const totalGuestCommitted = projects.reduce(
    (acc, p) => acc + (p.assets?.original?.size_bytes || 0) + (p.assets?.edited?.size_bytes || 0),
    0,
  );
  const displayStorageUsed = user
    ? (userStorage?.totalUsageBytes ?? totalGuestCommitted)
    : totalGuestCommitted;
  const displayStorageLimit = user
    ? (userStorage?.limitBytes ?? 2 * 1024 * 1024 * 1024)
    : 300 * 1024 * 1024;
  const storagePercent = Math.min(
    100,
    Math.round((displayStorageUsed / (displayStorageLimit || 1)) * 100),
  );

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-title"
    >
      <div className="modal-content modal-content--dashboard">
        <div className="modal-header">
          <div className="modal-title-group">
            <HardDrive size={18} className="modal-icon" aria-hidden="true" />
            <h2 id="dashboard-title">Private Cloud Projects</h2>
          </div>
          <div className="modal-header-actions">
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              onClick={() => {
                refreshProjects();
                if (user)
                  getUserStorageSummary()
                    .then(setUserStorage)
                    .catch(() => {});
              }}
              disabled={isLoadingProjects}
              aria-label="Refresh projects"
              title="Refresh"
            >
              <RefreshCw size={15} className={isLoadingProjects ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="dashboard-account-banner">
            {user ? (
              <div className="account-tag">
                <User size={14} />
                <span>
                  Account: <strong>{user.email}</strong>
                </span>
              </div>
            ) : (
              <div className="account-tag">
                <Lock size={14} />
                <span>Guest mode: Viewing projects indexed in this browser</span>
              </div>
            )}
          </div>

          {/* Storage Quota Indicator */}
          <div className="dashboard-storage-banner">
            <div className="storage-info">
              <HardDrive size={14} />
              <span>Storage Quota:</span>
              <strong>
                {formatFileSize(displayStorageUsed)} / {formatFileSize(displayStorageLimit)} (
                {storagePercent}%)
              </strong>
            </div>
            <div
              className="storage-meter-track"
              role="progressbar"
              aria-valuenow={storagePercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="storage-meter-fill" style={{ width: `${storagePercent}%` }} />
            </div>
          </div>

          {dashboardError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={15} />
              <span>{dashboardError}</span>
            </div>
          )}

          {isLoadingProjects && projects.length === 0 ? (
            <div className="dashboard-loading">
              <LoaderCircle size={24} className="animate-spin" />
              <span>Loading cloud projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="dashboard-empty-state">
              <HardDrive size={36} className="empty-icon" />
              <h3>No cloud projects found</h3>
              <p>
                Open an audio comparison and select <strong>Save to cloud</strong> to store your
                comparison in private cloud storage.
              </p>
            </div>
          ) : sharingProjectId ? (
            <ShareDialog projectId={sharingProjectId} onClose={() => setSharingProjectId(null)} />
          ) : (
            <div className="cloud-projects-list">
              {projects.map((project) => {
                const isExpired = renderedAt >= project.expires_at;
                const orig = project.assets?.original;
                const edit = project.assets?.edited;
                const isReady = orig?.status === 'ready' && edit?.status === 'ready' && !isExpired;
                const isCommentsExpanded = expandedCommentsId === project.id;
                const projectComments = commentsMap[project.id] || [];
                const isLoadingComments = loadingCommentsId === project.id;

                return (
                  <div
                    key={project.id}
                    className={`cloud-project-card ${isExpired ? 'cloud-project-card--expired' : ''}`}
                  >
                    <div className="cloud-project-card-header">
                      <div className="card-main">
                        <div className="card-header">
                          <h4 className="project-title">{project.title}</h4>
                          <span className={`status-pill status-pill--${project.status}`}>
                            {project.status}
                          </span>
                        </div>

                        <div className="project-meta-row">
                          <div className="meta-item">
                            <Clock size={13} />
                            <span>{formatExpiryTime(project.expires_at, renderedAt)}</span>
                          </div>
                          {project.isGuestOwned && user && (
                            <button
                              type="button"
                              className="claim-btn text-xs text-indigo-400 hover:text-indigo-300"
                              onClick={() => handleClaim(project.id)}
                              disabled={claimingId === project.id}
                            >
                              Claim to account
                            </button>
                          )}
                        </div>

                        <div className="assets-summary">
                          <div className="asset-tag">
                            <span className="asset-role">A</span>
                            <span className="asset-name">{orig?.filename || 'Pending'}</span>
                            {orig?.size_bytes ? (
                              <span className="asset-size">
                                ({formatFileSize(orig.size_bytes)})
                              </span>
                            ) : null}
                          </div>
                          <div className="asset-tag">
                            <span className="asset-role">B</span>
                            <span className="asset-name">{edit?.filename || 'Pending'}</span>
                            {edit?.size_bytes ? (
                              <span className="asset-size">
                                ({formatFileSize(edit.size_bytes)})
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Preferred Version Votes & Comments Row */}
                        <div className="project-feedback-row">
                          <div className="feedback-vote-counts" title="Preferred version votes">
                            <ThumbsUp size={13} className="vote-icon" />
                            <span className="vote-label">Preferred:</span>
                            <span className="vote-item">
                              Orig: <strong>{project.votes?.original ?? 0}</strong>
                            </span>
                            <span className="vote-divider">·</span>
                            <span className="vote-item">
                              Edit: <strong>{project.votes?.edited ?? 0}</strong>
                            </span>
                            <span className="vote-divider">·</span>
                            <span className="vote-total">
                              Total: <strong>{project.votes?.total ?? 0}</strong>
                            </span>
                          </div>

                          <button
                            type="button"
                            className="comments-toggle-btn"
                            onClick={() => toggleComments(project.id)}
                            aria-expanded={isCommentsExpanded}
                            aria-label={`Toggle comments for ${project.title}`}
                          >
                            <MessageSquare size={13} />
                            <span>{project.comments_count ?? 0} comments</span>
                            {isCommentsExpanded ? (
                              <ChevronUp size={13} />
                            ) : (
                              <ChevronDown size={13} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="card-actions">
                        <button
                          type="button"
                          className="secondary-btn secondary-btn--sm"
                          onClick={() => handleOpen(project)}
                          disabled={!isReady || openingId === project.id}
                          title={
                            isReady
                              ? 'Open in Switchroom editor'
                              : 'Both tracks must be ready to open'
                          }
                        >
                          {openingId === project.id ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <FolderOpen size={14} />
                          )}
                          <span>Open</span>
                        </button>

                        {isReady && !isExpired && (
                          <button
                            type="button"
                            className="secondary-btn secondary-btn--sm"
                            onClick={() => {
                              setSharingProjectId(project.id);
                            }}
                            disabled={sharingProjectId !== null}
                            aria-label="Share project"
                            title="Share review link"
                          >
                            <Share2 size={14} aria-hidden="true" />
                            <span>Share</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="icon-btn icon-btn--danger icon-btn--sm"
                          onClick={() => handleDelete(project.id)}
                          disabled={deletingId === project.id}
                          aria-label="Delete project"
                          title="Delete project"
                        >
                          {deletingId === project.id ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Comments Drawer */}
                    {isCommentsExpanded && (
                      <div
                        className="project-comments-drawer"
                        data-testid={`comments-drawer-${project.id}`}
                      >
                        {isLoadingComments ? (
                          <div className="comments-loading">
                            <LoaderCircle size={14} className="animate-spin" />
                            <span>Loading comments...</span>
                          </div>
                        ) : projectComments.length === 0 ? (
                          <div className="comments-empty">No comments posted yet.</div>
                        ) : (
                          <div className="comments-list-compact">
                            {projectComments.map((comment) => (
                              <div key={comment.id} className="comment-compact-item">
                                <div className="comment-compact-header">
                                  <span className="comment-author-name">
                                    {comment.author.displayName}
                                  </span>
                                  {comment.author.isCreator && (
                                    <span className="badge badge--creator">Creator</span>
                                  )}
                                  <span className="comment-timestamp">
                                    {formatCommentTime(comment.timestampMs)}
                                  </span>
                                </div>
                                <p className="comment-compact-body">{comment.body}</p>
                                {comment.replies && comment.replies.length > 0 && (
                                  <div className="comment-compact-replies">
                                    {comment.replies.map((reply) => (
                                      <div key={reply.id} className="comment-compact-reply">
                                        <span className="reply-author">
                                          {reply.author.displayName}
                                        </span>
                                        {reply.author.isCreator && (
                                          <span className="badge badge--creator">Creator</span>
                                        )}
                                        <span className="reply-body">: {reply.body}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
