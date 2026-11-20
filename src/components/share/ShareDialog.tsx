// Creator share dialog for Switchroom v0.6.0.
//
// Manages a cloud project's share links: visibility, indexing, optional
// password protection, link expiry, primary link rotation and invite links.
// All changes are authorized by the Worker; raw share tokens are never
// persisted by the UI and a URL is only shown once, at creation time.
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Lock, RefreshCw, Trash2, X } from 'lucide-react';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type ShareLinkSummary,
  type ShareLinksResponse,
  updateSharing,
} from '../../lib/api/shareApi';

interface ShareDialogProps {
  projectId: string;
  onClose: () => void;
}

type Visibility = 'public' | 'unlisted' | 'private';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function linkStatus(link: ShareLinkSummary, now: number): 'Active' | 'Expired' | 'Revoked' {
  if (link.revoked_at !== null && link.revoked_at !== 0) return 'Revoked';
  if (link.expires_at !== null && now >= link.expires_at) return 'Expired';
  return link.active ? 'Active' : 'Expired';
}

interface ShareForm {
  visibility: Visibility;
  public_indexing_enabled: boolean;
  password: string | null;
  feedback_enabled: boolean;
}

interface LinkForm {
  label: string;
  expiry: string | null; // ISO minutes string or null
}

function LinkRow({
  link,
  status,
  onRevoke,
  onCopy,
  onClose,
  url,
  copied,
  revoking,
}: {
  link: ShareLinkSummary;
  status: 'Active' | 'Expired' | 'Revoked';
  onRevoke: () => void;
  onCopy: () => void;
  onClose: () => void;
  url: string | null;
  copied: boolean;
  revoking: boolean;
}) {
  return (
    <div className={`share-link-row ${status === 'Revoked' ? 'share-link-row--revoked' : ''}`}>
      <div className="share-link__main">
        <div className="share-link__label">
          {link.label || (link.kind === 'primary' ? 'Primary link' : 'Invite link')}
        </div>
        <div className="share-link__meta">
          Listening &middot; created {formatDate(link.created_at)}
          {link.expires_at ? ` &middot; expires ${formatDate(link.expires_at)}` : ''}
        </div>
      </div>
      <div className="share-link__status">{status}</div>
      <div className="share-link__actions">
        {url ? (
          <>
            <input
              className="share-link__url-input"
              readOnly
              value={url}
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={onCopy}
              aria-label={copied ? 'Copied' : 'Copy link'}
              title={copied ? 'Copied' : 'Copy link'}
            >
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={onRevoke}
              aria-label="Revoke link"
              title="Revoke link"
              disabled={revoking}
            >
              {revoking ? (
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
  const [data, setData] = useState<ShareLinksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<'primary' | 'invite' | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copySucceededLinkId, setCopySucceededLinkId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState<ShareForm>({
    visibility: 'private',
    public_indexing_enabled: false,
    password: null,
    feedback_enabled: true,
  });
  const [linkForm, setLinkForm] = useState<LinkForm>({ label: '', expiry: null });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    void (async () => {
      setSettings({
        visibility: data.project.visibility,
        public_indexing_enabled: Boolean(data.project.public_indexing_enabled),
        password: null,
        feedback_enabled: data.project.feedback_enabled !== false,
      });
      setLinkForm({ label: '', expiry: null });
    })();
  }, [data]);

  const loadLinks = useCallback(async (): Promise<ShareLinksResponse | null> => {
    setError(null);
    try {
      const next = await listShareLinks(projectId);
      setData(next);
      return next;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load sharing settings.');
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadLinks();
    });
  }, [loadLinks]);

  const hasUnsaved = useCallback((): boolean => {
    if (!data) return false;
    const currentFeedback = data.project.feedback_enabled !== false;
    return (
      settings.visibility !== data.project.visibility ||
      settings.public_indexing_enabled !== data.project.public_indexing_enabled ||
      settings.feedback_enabled !== currentFeedback ||
      settings.password !== null
    );
  }, [data, settings]);

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  const handleSaveSettings = useCallback(async () => {
    if (!data) return;
    const updates: Record<string, unknown> = {};
    if (settings.visibility !== data.project.visibility) updates.visibility = settings.visibility;
    if (settings.public_indexing_enabled !== data.project.public_indexing_enabled) {
      updates.public_indexing_enabled = settings.public_indexing_enabled;
    }
    const currentFeedback = data.project.feedback_enabled !== false;
    if (settings.feedback_enabled !== currentFeedback) {
      updates.feedback_enabled = settings.feedback_enabled;
    }
    if (settings.password !== null) {
      updates.password = settings.password === '' ? null : settings.password;
    }

    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await updateSharing(projectId, updates as Parameters<typeof updateSharing>[1]);
      void loadLinks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save sharing settings.');
    } finally {
      setSaving(false);
    }
  }, [data, settings, projectId, loadLinks]);

  // ------------------------------------------------------------------
  // Links
  // ------------------------------------------------------------------

  const handleCreateLink = useCallback(
    async (kind: 'primary' | 'invite') => {
      if (hasUnsaved()) await handleSaveSettings();

      setCreating(kind);
      setError(null);
      try {
        const expiresAt = linkForm.expiry ? new Date(linkForm.expiry).getTime() : null;
        const created = await createShareLink(projectId, {
          kind,
          expiresAt,
          label: kind === 'invite' && linkForm.label ? linkForm.label : null,
        });
        setCopiedUrl(created.url);
        setCopiedLinkId(created.link.id);
        setCopySucceededLinkId(null);
        setCreating(null);
        setLinkForm({ label: '', expiry: null });
        void loadLinks();
      } catch (err: unknown) {
        setCreating(null);
        setError(err instanceof Error ? err.message : 'Unable to create the link.');
      }
    },
    [projectId, hasUnsaved, handleSaveSettings, linkForm, loadLinks],
  );

  const handleRevokeLink = useCallback(
    async (link: ShareLinkSummary) => {
      if (
        !window.confirm(
          `Revoke this ${link.kind} link? New access will be blocked immediately. Already-issued playback links may continue until they expire.`,
        )
      ) {
        return;
      }
      setRevokingId(link.id);
      setError(null);
      try {
        await revokeShareLink(projectId, link.id);
        void loadLinks();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to revoke the link.');
      } finally {
        setRevokingId(null);
      }
    },
    [projectId, loadLinks],
  );

  const handleCopyUrl = useCallback(async (url: string, linkId: string) => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      // Clipboard API unavailable or denied: the selectable input below is the fallback.
    }
    setCopiedUrl(url);
    setCopySucceededLinkId(copied ? linkId : null);
    setTimeout(() => setCopySucceededLinkId(null), 1800);
  }, []);

  const links = data?.links ?? [];
  const project = data?.project;
  const primaryLink = links.find((l) => l.kind === 'primary');
  const inviteLinks = links.filter((l) => l.kind === 'invite');
  const canCreatePrimary =
    project &&
    project.visibility !== 'private' &&
    (!primaryLink || linkStatus(primaryLink, now) !== 'Active');
  const expiryMax = project ? new Date(project.expires_at).toISOString().slice(0, 16) : undefined;

  return (
    <div
      className="modal-backdrop share-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className="modal-content modal-content--share">
        <div className="modal-header">
          <div className="modal-title-group">
            <Lock size={18} className="modal-icon" aria-hidden="true" />
            <h2 id="share-dialog-title">Share review link</h2>
          </div>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <div className="share-dialog__project">
            <h3 className="share-dialog__title">{project?.title ?? 'Project'}</h3>
            <p className="share-dialog__subtitle">
              Clients who reach this link can listen to Original and Edited without an account.
            </p>
          </div>

          {/* Visibility */}
          <div className="form-group">
            <span className="form-label">Visibility</span>
            <div className="settings-segment">
              {(['public', 'unlisted', 'private'] as const).map((mode) => {
                const active = settings.visibility === mode;
                return (
                  <button
                    type="button"
                    key={mode}
                    className={`settings-segment__btn${active ? ' settings-segment__btn--active' : ''}`}
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, visibility: mode }));
                    }}
                  >
                    {mode === 'public' ? 'Public' : mode === 'unlisted' ? 'Unlisted' : 'Private'}
                  </button>
                );
              })}
            </div>
            <p className="field-hint">
              Public: anyone with the link can listen. Unlisted: anyone with the link can listen,
              not indexed. Private: invite links only; there is no primary link.
            </p>
          </div>

          {settings.visibility === 'public' && (
            <div className="form-group">
              <label className="form-label">
                <input
                  type="checkbox"
                  checked={settings.public_indexing_enabled}
                  onChange={(e) => {
                    setSettings((prev) => ({ ...prev, public_indexing_enabled: e.target.checked }));
                  }}
                />{' '}
                Allow search engines to index this review
              </label>
              <p className="field-hint">
                Off by default. Indexing applies to public projects only; unlisted and private
                reviews are always noindex.
              </p>
            </div>
          )}

          {/* Feedback & Preference Voting */}
          <div className="form-group">
            <label className="form-label">
              <input
                type="checkbox"
                checked={settings.feedback_enabled}
                onChange={(e) => {
                  setSettings((prev) => ({ ...prev, feedback_enabled: e.target.checked }));
                }}
              />{' '}
              Enable client feedback and preference voting
            </label>
            <p className="field-hint">
              When enabled, clients can vote for their preferred version and leave timestamped
              comments.
            </p>
          </div>

          {/* Password protection */}
          <div className="form-group share-dialog__password">
            <label className="form-label" htmlFor="share-dialog-password">
              Require password to open this review
            </label>
            {data?.passwordAvailable ? (
              <>
                <input
                  id="share-dialog-password"
                  type="password"
                  className="form-input"
                  placeholder="At least 8 characters"
                  value={settings.password ?? ''}
                  onChange={(e) => {
                    setSettings((prev) => ({ ...prev, password: e.target.value || null }));
                  }}
                  minLength={8}
                  maxLength={128}
                />
                <p className="field-hint">
                  Adds a password gate before listening. Leave empty to remove protection. Changing
                  the password invalidates outstanding verification grants.
                </p>
              </>
            ) : (
              <p className="field-hint">
                Password protection is not available in this environment.
              </p>
            )}
          </div>

          <div className="share-dialog__actions">
            <button
              type="button"
              className="secondary-btn"
              disabled={saving || !hasUnsaved()}
              onClick={handleSaveSettings}
            >
              {saving ? 'Saving…' : hasUnsaved() ? 'Save settings' : 'Settings saved'}
            </button>
          </div>

          {/* Links */}
          <div className="share-dialog__links">
            <h3 className="share-dialog__links-title">Links</h3>

            {project?.visibility === 'private' ? (
              <>
                <p className="field-hint">
                  Private projects have no primary link. Clients join through the invite links
                  below. Each invite has its own expiry and can be revoked independently. Save each
                  URL when it is created; URLs are not stored by the server.
                </p>

                <div className="share-dialog__invite-form">
                  <div className="form-group share-dialog__inline-group">
                    <label className="form-label" htmlFor="share-dialog-invite-label">
                      Invite label
                    </label>
                    <input
                      id="share-dialog-invite-label"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Client A review"
                      value={linkForm.label}
                      onChange={(e) => {
                        setLinkForm((prev) => ({ ...prev, label: e.target.value }));
                      }}
                    />
                  </div>
                  <div className="form-group share-dialog__inline-group">
                    <label className="form-label" htmlFor="share-dialog-invite-expiry">
                      Invite expires
                    </label>
                    <input
                      id="share-dialog-invite-expiry"
                      type="datetime-local"
                      className="form-input"
                      value={linkForm.expiry ?? ''}
                      onChange={(e) => {
                        setLinkForm((prev) => ({ ...prev, expiry: e.target.value || null }));
                      }}
                      max={expiryMax}
                    />
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={creating === 'invite'}
                    onClick={() => void handleCreateLink('invite')}
                  >
                    {creating === 'invite' ? 'Creating invite…' : 'Create invite link'}
                  </button>
                </div>

                {inviteLinks.length === 0 ? (
                  <p className="field-hint">No invite links yet.</p>
                ) : (
                  inviteLinks.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      status={linkStatus(link, now)}
                      url={copiedLinkId === link.id ? copiedUrl : null}
                      copied={copySucceededLinkId === link.id}
                      onCopy={() => {
                        if (copiedUrl) void handleCopyUrl(copiedUrl, link.id);
                      }}
                      onClose={() => setCopiedUrl(null)}
                      onRevoke={() => void handleRevokeLink(link)}
                      revoking={revokingId === link.id}
                    />
                  ))
                )}
              </>
            ) : (
              <>
                <p className="field-hint">
                  A public or unlisted project has one primary link at a time. Rotating a link
                  revokes the previous one. Save the URL when it is created; URLs are not stored by
                  the server.
                </p>
                <div className="share-dialog__primary-form">
                  <div className="form-group share-dialog__inline-group">
                    <label className="form-label" htmlFor="share-dialog-primary-expiry">
                      Primary link expires
                    </label>
                    <input
                      id="share-dialog-primary-expiry"
                      type="datetime-local"
                      className="form-input"
                      value={linkForm.expiry ?? ''}
                      onChange={(e) => {
                        setLinkForm((prev) => ({ ...prev, expiry: e.target.value || null }));
                      }}
                      max={expiryMax}
                    />
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={!canCreatePrimary || creating === 'primary'}
                    onClick={() => void handleCreateLink('primary')}
                  >
                    {creating === 'primary'
                      ? 'Creating link…'
                      : canCreatePrimary
                        ? 'Create primary link'
                        : 'Rotate primary link'}
                  </button>
                </div>

                {primaryLink ? (
                  <LinkRow
                    key={primaryLink.id}
                    link={primaryLink}
                    status={linkStatus(primaryLink, now)}
                    url={copiedLinkId === primaryLink.id ? copiedUrl : null}
                    copied={copySucceededLinkId === primaryLink.id}
                    onCopy={() => {
                      if (copiedUrl) void handleCopyUrl(copiedUrl, primaryLink.id);
                    }}
                    onClose={() => setCopiedUrl(null)}
                    onRevoke={() => void handleRevokeLink(primaryLink)}
                    revoking={revokingId === primaryLink.id}
                  />
                ) : (
                  <p className="field-hint">
                    No primary link yet. Create one to share this review.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
