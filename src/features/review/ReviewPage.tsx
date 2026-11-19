// Client review page for Switchroom v0.6.0.
//
// A client opens `/review/:token` with no account. Every access decision is
// made by the Worker; this page only presents safe metadata and plays the
// short-lived playback URLs the Worker issues after each authorization check.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Play, Pause, RefreshCw, Volume2, VolumeX, X } from 'lucide-react';
import { usePlayer } from '../../hooks/usePlayer';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  getShareAccess,
  getSharePlayback,
  sharePassword,
  ShareApiError,
  type ShareAccessResponse,
} from '../../lib/api/shareApi';

type ReviewView = 'resolving' | 'password' | 'ready' | 'unavailable';
type AssetRole = 'original' | 'edited';

const REFRESH_POLL_MS = 20_000;
// Refresh a playback URL once it expires within this window. Playback URLs are
// short-lived bearer credentials (5 minutes target); refreshing ahead of expiry
// keeps long sessions playing without exposing permanent storage URLs.
const URL_REFRESH_WINDOW_MS = 45_000;
const DECK_READY_TIMEOUT_MS = 15_000;

function formatTime(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabel(role: AssetRole): string {
  return role === 'original' ? 'Original' : 'Edited';
}

function unavailableForError(err: unknown): {
  title: string;
  message: string;
} {
  if (err instanceof ShareApiError) {
    switch (err.code) {
      case 'LINK_UNAVAILABLE':
        return {
          title: 'This review link is no longer available',
          message: 'The link is invalid, has been revoked, or has expired.',
        };
      case 'PROJECT_EXPIRED':
        return {
          title: 'This review project has expired',
          message: 'The creator-set retention period for this review has ended.',
        };
      case 'PROJECT_NOT_READY':
        return {
          title: 'The review is not ready yet',
          message: "The comparison's audio files are still being uploaded. Check back soon.",
        };
      case 'TOO_MANY_ATTEMPTS':
        return {
          title: 'Too many attempts',
          message: 'Please try again later.',
        };
      default:
        return {
          title: 'Something went wrong',
          message: 'Please try opening the link again.',
        };
    }
  }
  return {
    title: 'Something went wrong',
    message: 'Please try opening the link again.',
  };
}

export function ReviewPage({ token }: { token: string }) {
  const { engine } = usePlayer()!;
  const { openHome } = useWorkspace();

  const [view, setView] = useState<ReviewView>('resolving');
  const [access, setAccess] = useState<ShareAccessResponse | null>(null);
  const [playback, setPlayback] = useState<
    Record<AssetRole, { url: string; expiresAt: number } | null>
  >({
    original: null,
    edited: null,
  });
  const [deckLoading, setDeckLoading] = useState<Record<AssetRole, boolean>>({
    original: false,
    edited: false,
  });
  const [deckError, setDeckError] = useState<Record<AssetRole, string | null>>({
    original: null,
    edited: null,
  });
  const [snapshot, setSnapshot] = useState(engine.getSnapshot());
  const [playhead, setPlayhead] = useState(engine.getSnapshot().currentTime);
  const [unavailable, setUnavailable] = useState<{ title: string; message: string } | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const refreshing = useRef<Record<AssetRole, boolean>>({ original: false, edited: false });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvingRef = useRef(false);

  // Mirror engine transport state without rerendering on every time tick.
  useEffect(
    () =>
      engine.subscribe(() => {
        const next = engine.getSnapshot();
        setSnapshot((prev) =>
          prev.isPlaying === next.isPlaying &&
          prev.status === next.status &&
          prev.currentTime === next.currentTime &&
          prev.duration === next.duration &&
          prev.activeVersion === next.activeVersion &&
          prev.original.ready === next.original.ready &&
          prev.edited.ready === next.edited.ready &&
          prev.original.error === next.original.error &&
          prev.edited.error === next.edited.error
            ? prev
            : next,
        );
      }),
    [engine],
  );

  useEffect(() => engine.subscribeToTime(setPlayhead), [engine]);

  const readyDecks =
    playback.original !== null &&
    playback.edited !== null &&
    snapshot.original.ready &&
    snapshot.edited.ready;
  const anyDeckError =
    snapshot.original.error || snapshot.edited.error || deckError.original || deckError.edited;

  const resolveAccess = useCallback(async (): Promise<ShareAccessResponse | null> => {
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    setUnavailable(null);
    try {
      const resolved = await getShareAccess(token);
      setAccess(resolved);
      setView('ready');
      return resolved;
    } catch (err: unknown) {
      if (err instanceof ShareApiError && err.code === 'PASSWORD_REQUIRED') {
        setView('password');
        return null;
      }
      setUnavailable(unavailableForError(err));
      setView('unavailable');
      return null;
    } finally {
      resolvingRef.current = false;
    }
  }, [token]);

  const waitForDeckReady = useCallback(
    (role: AssetRole): Promise<void> =>
      new Promise((resolve, reject) => {
        const deadline = Date.now() + DECK_READY_TIMEOUT_MS;
        const unsubscribe = engine.subscribe(() => {
          const deck = engine.getSnapshot()[role];
          if (deck.ready) {
            unsubscribe();
            resolve();
            return;
          }
          if (deck.error) {
            unsubscribe();
            reject(new Error(deck.error || 'This track could not be loaded.'));
            return;
          }
          if (Date.now() > deadline) {
            unsubscribe();
            reject(new Error('The track took too long to load.'));
            return;
          }
        });
        // Check immediately in case the deck was already ready.
        if (engine.getSnapshot()[role].ready) {
          unsubscribe();
          resolve();
        }
      }),
    [engine],
  );

  const loadDeck = useCallback(
    async (role: AssetRole): Promise<void> => {
      setDeckLoading((prev) => ({ ...prev, [role]: true }));
      setDeckError((prev) => ({ ...prev, [role]: null }));
      try {
        const next = await getSharePlayback(token, role);
        setPlayback((prev) => ({ ...prev, [role]: { url: next.url, expiresAt: next.expiresAt } }));
        engine.loadRemoteUrl(role, next.url, roleLabel(role), next.sizeBytes);
        await waitForDeckReady(role);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'This track could not be loaded.';
        setDeckError((prev) => ({ ...prev, [role]: message }));
      } finally {
        setDeckLoading((prev) => ({ ...prev, [role]: false }));
      }
    },
    [token, engine, waitForDeckReady],
  );
  const loadPlayback = useCallback(async () => {
    if (!access) return;
    await Promise.all([loadDeck('original'), loadDeck('edited')]);
  }, [access, loadDeck]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void resolveAccess();
    });
  }, [resolveAccess]);

  useEffect(() => {
    if (!access) return;
    void Promise.resolve().then(() => {
      void loadPlayback();
    });
  }, [access, loadPlayback]);

  const handlePasswordSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setPasswordError(null);
      if (!passwordValue.trim()) {
        setPasswordError('Please enter a password.');
        return;
      }
      try {
        await sharePassword(token, passwordValue);
        setPasswordValue('');
        await resolveAccess();
      } catch (err: unknown) {
        if (err instanceof ShareApiError) {
          if (err.code === 'PASSWORD_INVALID') {
            setPasswordError('Invalid password. Try again.');
            return;
          }
          if (err.code === 'TOO_MANY_ATTEMPTS') {
            setPasswordError('Too many attempts. Please try again later.');
            return;
          }
          if (err.code === 'LINK_UNAVAILABLE') {
            setUnavailable(unavailableForError(err));
            setView('unavailable');
            return;
          }
        }
        setUnavailable(unavailableForError(err));
        setView('unavailable');
      }
    },
    [token, passwordValue, resolveAccess],
  );

  // ------------------------------------------------------------------
  // Playback
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Playback URL refresh (short-lived signed URLs)
  // ------------------------------------------------------------------

  const refreshPlaybackUrl = useCallback(
    async (role: AssetRole): Promise<void> => {
      if (refreshing.current[role]) return;
      refreshing.current[role] = true;
      try {
        const prev = engine.getSnapshot();
        const wasPlaying = prev.isPlaying;
        const time = prev.currentTime;
        engine.pause();

        const next = await getSharePlayback(token, role);
        setPlayback((prevState) => ({
          ...prevState,
          [role]: { url: next.url, expiresAt: next.expiresAt },
        }));
        engine.loadRemoteUrl(role, next.url, roleLabel(role), next.sizeBytes);
        await waitForDeckReady(role);

        engine.seek(time);
        if (wasPlaying) {
          try {
            await engine.play();
          } catch {
            // Autoplay restrictions may block resuming; the client presses Play.
          }
        }
      } catch {
        // Surface a recoverable error; the client can retry from the notice.
        const deck = engine.getSnapshot()[role];
        if (!deck.error)
          setDeckError((prev) => ({ ...prev, [role]: 'Playback expired. Press Play to refresh.' }));
      } finally {
        refreshing.current[role] = false;
      }
    },
    [token, engine, waitForDeckReady],
  );

  const maybeRefreshUrls = useCallback(() => {
    const now = Date.now();
    for (const role of ['original', 'edited'] as AssetRole[]) {
      const url = playback[role];
      if (url && !refreshing.current[role] && url.expiresAt - now <= URL_REFRESH_WINDOW_MS) {
        void refreshPlaybackUrl(role);
      }
    }
  }, [playback, refreshPlaybackUrl]);

  useEffect(() => {
    refreshTimer.current = setInterval(maybeRefreshUrls, REFRESH_POLL_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [maybeRefreshUrls]);

  // ------------------------------------------------------------------
  // Transport
  // ------------------------------------------------------------------

  const handlePlay = useCallback(async () => {
    try {
      await engine.play();
    } catch {
      setUnavailable({
        title: 'Playback could not start',
        message: 'The browser blocked autoplay. Press Play again.',
      });
    }
  }, [engine]);

  const handlePause = useCallback(() => {
    engine.pause();
  }, [engine]);

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      engine.seek(value);
    },
    [engine],
  );

  const handleSwitch = useCallback(
    (role: AssetRole) => {
      void engine.switchTo(role);
    },
    [engine],
  );

  const handleCrossfade = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      engine.setCrossfadeMs(Number(event.target.value));
    },
    [engine],
  );

  const handleVolume = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      engine.setVolume(Number(event.target.value));
    },
    [engine],
  );

  const handleMuteToggle = useCallback(() => {
    engine.setMuted(!snapshot.muted);
  }, [engine, snapshot.muted]);

  const handleRetryAll = useCallback(() => {
    setUnavailable(null);
    setView('resolving');
    void resolveAccess();
  }, [resolveAccess]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const audible = snapshot.activeVersion;
  const isPlaying = snapshot.isPlaying;
  const duration = snapshot.duration;
  const currentTime = playhead;
  const timelineMax = duration && Number.isFinite(duration) ? duration : 0;
  const timelinePct = timelineMax > 0 ? Math.min(100, (currentTime / timelineMax) * 100) : 0;

  const title = access?.project.title ?? '';
  const description = access?.project.description ?? '';
  const linkExpiresAt = access?.access.linkExpiresAt ?? null;
  const projectExpiresAt = access?.project.expiresAt ?? null;

  if (view === 'resolving') {
    return (
      <div className="review-page">
        <div className="review-shell">
          <div className="review-resolving">
            <p>Resolving review link…</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'password') {
    return (
      <div className="review-page">
        <div className="review-shell review-shell--narrow">
          <div className="review-header">
            <button
              type="button"
              className="review-back-btn"
              onClick={() => openHome()}
              aria-label="All comparisons"
            >
              <X size={16} aria-hidden="true" />
              <span>All comparisons</span>
            </button>
          </div>
          <div className="review-password">
            <div className="review-password__icon">
              <Lock size={24} aria-hidden="true" />
            </div>
            <h2 className="review-title">A password is required</h2>
            <p className="review-desc">
              This review link is password protected. Enter the password the creator shared with
              you.
            </p>
            {passwordError && (
              <div className="error-banner" role="alert">
                {passwordError}
              </div>
            )}
            <form onSubmit={handlePasswordSubmit} className="form-group">
              <label className="form-label" htmlFor="share-review-password">
                Password
              </label>
              <input
                id="share-review-password"
                type="password"
                className="form-input"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={128}
              />
              <button type="submit" className="primary-btn" disabled={!passwordValue.trim()}>
                Unlock review
              </button>
            </form>
            <button type="button" className="secondary-btn" onClick={handleRetryAll}>
              Another link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'unavailable') {
    return (
      <div className="review-page">
        <div className="review-shell review-shell--narrow">
          <div className="review-header">
            <button
              type="button"
              className="review-back-btn"
              onClick={() => openHome()}
              aria-label="All comparisons"
            >
              <X size={16} aria-hidden="true" />
              <span>All comparisons</span>
            </button>
          </div>
          <div className="review-unavailable">
            <h2 className="review-title">
              {unavailable?.title ?? 'This review link is no longer available'}
            </h2>
            <p className="review-desc">{unavailable?.message ?? ''}</p>
            <button type="button" className="secondary-btn" onClick={handleRetryAll}>
              Try again
            </button>
            <button type="button" className="review-back-btn" onClick={() => openHome()}>
              All comparisons
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-page">
      <div className="review-shell">
        <div className="review-header">
          <div className="review-header__brand">
            <span className="review-kicker">Switchroom review</span>
          </div>
          <button
            type="button"
            className="review-back-btn"
            onClick={() => openHome()}
            aria-label="All comparisons"
          >
            <X size={16} aria-hidden="true" />
            <span>All comparisons</span>
          </button>
        </div>

        <div className="review-project">
          <h1 className="review-title">{title}</h1>
          {description && <p className="review-description">{description}</p>}
          <div className="review-meta">
            {linkExpiresAt && (
              <span className="review-notice review-notice--link">
                <RefreshCw size={14} aria-hidden="true" />
                Link expires {formatExpiry(linkExpiresAt)}
              </span>
            )}
            {projectExpiresAt && !linkExpiresAt && (
              <span className="review-notice review-notice--project">
                <RefreshCw size={14} aria-hidden="true" />
                Project expires {formatExpiry(projectExpiresAt)}
              </span>
            )}
          </div>
        </div>

        <div className="review-player-wrap">
          <div className="player" data-status={snapshot.status}>
            <div className="player__header">
              <div className="transport">
                <button
                  type="button"
                  className="play-button"
                  disabled={!readyDecks || !!anyDeckError}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  onClick={isPlaying ? handlePause : handlePlay}
                >
                  <span className="play-button__icon">
                    <span className="play-button__icons">
                      <span className="play-button__icon-motion" data-active={isPlaying}>
                        <Pause size={22} aria-hidden="true" />
                      </span>
                      <span className="play-button__icon-motion" data-active={!isPlaying}>
                        <Play size={22} aria-hidden="true" />
                      </span>
                    </span>
                  </span>
                  <span className="play-button__label">
                    {isPlaying ? 'Pausing…' : readyDecks ? 'Play' : 'Loading…'}
                  </span>
                </button>
                <div className="transport__copy">
                  <div className="transport__kicker">
                    {audible === 'original' ? 'Original' : 'Edited'}
                  </div>
                  <div className="transport__title" title={title}>
                    {title}
                  </div>
                </div>
              </div>
              <div className="player__select">
                <div className="player__label">Version</div>
                <div className="version-switch">
                  <button
                    type="button"
                    className="version-tab"
                    aria-pressed={audible === 'original'}
                    disabled={!snapshot.original.ready}
                    onClick={() => handleSwitch('original')}
                  >
                    <span className="version-tab__label">Original</span>
                  </button>
                  <button
                    type="button"
                    className="version-tab"
                    aria-pressed={audible === 'edited'}
                    disabled={!snapshot.edited.ready}
                    onClick={() => handleSwitch('edited')}
                  >
                    <span className="version-tab__label">Edited</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="timeline">
              <div className="range-control timeline__range">
                <div className="range-control__surface">
                  <div className="range-control__rail" />
                  <div className="range-control__fill" style={{ width: `${timelinePct}%` }} />
                  <div className="range-control__thumb" style={{ left: `${timelinePct}%` }} />
                  <input
                    className="range-control__input"
                    type="range"
                    min="0"
                    max={timelineMax || 1}
                    value={Math.min(currentTime, timelineMax || 0)}
                    disabled={!readyDecks || !!anyDeckError}
                    onChange={handleSeek}
                    aria-label="Timeline"
                    aria-valuenow={currentTime}
                    aria-valuemin={0}
                    aria-valuemax={timelineMax || 0}
                  />
                </div>
              </div>
              <div className="timeline__times">
                <span className="time">{formatTime(currentTime)}</span>
                <span className="time time--total">{formatTime(timelineMax || 0)}</span>
              </div>
            </div>

            <div className="player__bottom">
              <div className="control transition">
                <div className="control__head">
                  <span className="control__label">Crossfade</span>
                  <span className="transition__value">{snapshot.crossfadeMs} ms</span>
                </div>
                <input
                  className="range-control transition__range"
                  type="range"
                  min="80"
                  max="600"
                  step="10"
                  value={snapshot.crossfadeMs}
                  onChange={handleCrossfade}
                  aria-label="Crossfade duration"
                />
                <div className="crossfade__scale">
                  <span className="crossfade__scale-end">80 ms</span>
                  <span className="crossfade__scale-end crossfade__scale-end--max">600 ms</span>
                  <span className="crossfade__scale-default">180 ms</span>
                </div>
              </div>
              <div className="control volume">
                <div className="control__head">
                  <span className="control__label">Volume</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={snapshot.muted ? 'Unmute' : 'Mute'}
                    onClick={handleMuteToggle}
                  >
                    {snapshot.muted ? (
                      <VolumeX size={16} aria-hidden="true" />
                    ) : (
                      <Volume2 size={16} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <input
                  className="range-control volume__range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={snapshot.volume}
                  onChange={handleVolume}
                  aria-label="Volume"
                />
                <span className="volume__value">{Math.round(snapshot.volume * 100)}%</span>
              </div>
            </div>

            {deckLoading.original || deckLoading.edited ? (
              <div className="player__notice">
                <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                <span>
                  {deckLoading.original && deckLoading.edited
                    ? 'Loading both tracks…'
                    : `Loading ${roleLabel(deckLoading.original ? 'original' : 'edited')}…`}
                </span>
              </div>
            ) : null}

            {anyDeckError ? (
              <div
                className="player__notice"
                style={{
                  borderColor: 'var(--error)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#fca5a5',
                }}
              >
                {snapshot.original.error ||
                  snapshot.edited.error ||
                  deckError.original ||
                  deckError.edited}
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    if (snapshot.original.error || deckError.original) void loadDeck('original');
                    if (snapshot.edited.error || deckError.edited) void loadDeck('edited');
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {linkExpiresAt || projectExpiresAt ? (
              <div className="review-notice review-notice--expiry">
                {linkExpiresAt
                  ? `This review link expires ${formatExpiry(linkExpiresAt)}.`
                  : `This review project expires ${formatExpiry(projectExpiresAt!)}.`}
                <span className="review-notice__hint">
                  Already-issued playback links remain usable for a few minutes.
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
