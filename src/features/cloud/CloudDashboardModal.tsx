// Creator Cloud Dashboard Modal for Switchroom v0.5.0

import { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Lock,
  RefreshCw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CloudProject } from './cloudTypes';
import { useCloudProjects } from './useCloudProjects';
import { formatFileSize } from '../../audio/fileValidation';

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
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

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
              onClick={() => refreshProjects()}
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
          ) : (
            <div className="cloud-projects-list">
              {projects.map((project) => {
                const isExpired = renderedAt >= project.expires_at;
                const orig = project.assets?.original;
                const edit = project.assets?.edited;
                const isReady = orig?.status === 'ready' && edit?.status === 'ready' && !isExpired;

                return (
                  <div
                    key={project.id}
                    className={`cloud-project-card ${isExpired ? 'cloud-project-card--expired' : ''}`}
                  >
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
                            <span className="asset-size">({formatFileSize(orig.size_bytes)})</span>
                          ) : null}
                        </div>
                        <div className="asset-tag">
                          <span className="asset-role">B</span>
                          <span className="asset-name">{edit?.filename || 'Pending'}</span>
                          {edit?.size_bytes ? (
                            <span className="asset-size">({formatFileSize(edit.size_bytes)})</span>
                          ) : null}
                        </div>
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
