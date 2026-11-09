import { AlertTriangle, Pause, Play } from 'lucide-react';
import type { ABPlayerSnapshot, AudioVersion } from '../../audio/audioTypes';
import { formatTime } from '../../audio/timeFormatting';
import { usePlayer } from '../../hooks/usePlayer';
import { CrossfadeControl } from './CrossfadeControl';
import { Timeline } from './Timeline';
import { VersionSwitch } from './VersionSwitch';
import { VolumeControl } from './VolumeControl';

function versionLabel(version: AudioVersion): string {
  return version === 'original' ? 'Original' : 'Edited';
}

function describeStatus(snapshot: ABPlayerSnapshot): string {
  if (snapshot.globalError) {
    return snapshot.globalError;
  }

  if (snapshot.original.error) {
    return 'The Original file needs attention. Replace it to continue.';
  }

  if (snapshot.edited.error) {
    return 'The Edited file needs attention. Replace it to continue.';
  }

  if (snapshot.status === 'starting') {
    return 'Starting audio…';
  }

  if (snapshot.status === 'switching' && snapshot.switchingTo) {
    return `Switching to ${versionLabel(snapshot.switchingTo)}…`;
  }

  if (snapshot.status === 'interrupted') {
    return 'Your browser interrupted audio playback. Press Play to continue.';
  }

  if (snapshot.status === 'loading') {
    const loadingVersion = snapshot.original.loading ? 'Original' : 'Edited';
    return `Reading the ${loadingVersion} file…`;
  }

  if (snapshot.status === 'empty') {
    return 'Add both recordings to enable the player.';
  }

  if (snapshot.status === 'incomplete') {
    const missing = snapshot.original.fileName ? 'Edited' : 'Original';
    return `Add the ${missing} recording to enable the player.`;
  }

  if (snapshot.status === 'ready') {
    return 'Both files are ready. Press Play to begin.';
  }

  if (snapshot.status === 'playing') {
    return `Playing ${versionLabel(snapshot.audibleVersion)}. Switch versions at any time.`;
  }

  if (snapshot.status === 'paused') {
    return `Paused on ${versionLabel(snapshot.audibleVersion)}.`;
  }

  return 'Add both recordings to enable the player.';
}

function transportKicker(snapshot: ABPlayerSnapshot): string {
  const bothReady = snapshot.original.ready && snapshot.edited.ready;

  if (snapshot.status === 'starting') {
    return 'Starting';
  }

  if (snapshot.status === 'switching') {
    return 'Switching';
  }

  if (snapshot.status === 'playing') {
    return 'Now playing';
  }

  if (snapshot.status === 'interrupted') {
    return 'Interrupted';
  }

  if (bothReady) {
    return 'Ready';
  }

  return 'Waiting for audio';
}

function transportTitle(snapshot: ABPlayerSnapshot): string {
  const bothReady = snapshot.original.ready && snapshot.edited.ready;

  if (!bothReady) {
    return 'No comparison yet';
  }

  if (snapshot.status === 'switching' && snapshot.switchingTo) {
    return `Switching to ${versionLabel(snapshot.switchingTo)}`;
  }

  if (snapshot.status === 'starting') {
    return 'Starting audio';
  }

  if (snapshot.status === 'playing') {
    return versionLabel(snapshot.audibleVersion);
  }

  return versionLabel(snapshot.activeVersion);
}

export function PlayerSurface() {
  const { engine, snapshot } = usePlayer();
  const bothReady = snapshot.original.ready && snapshot.edited.ready;
  const isStarting = snapshot.status === 'starting';
  const isPlaying = snapshot.status === 'playing' || snapshot.status === 'switching';
  const canPause = isStarting || isPlaying;
  const audibleLabel = versionLabel(snapshot.audibleVersion);
  const kicker = transportKicker(snapshot);
  const title = transportTitle(snapshot);

  return (
    <section className="player" aria-label="Comparison player" data-status={snapshot.status}>
      <div className="player__header">
        <div className="transport">
          <button
            type="button"
            className="play-button"
            disabled={!bothReady}
            aria-label={canPause ? 'Pause' : 'Play'}
            aria-describedby="player-status"
            onClick={() => {
              if (canPause) {
                engine.pause();
              } else {
                void engine.play();
              }
            }}
          >
            <span className="play-button__icon" aria-hidden="true">
              <span className="play-button__icons">
                <span
                  className="play-button__icon-motion"
                  data-active={!canPause}
                  aria-hidden="true"
                >
                  <Play size={20} strokeWidth={2} fill="currentColor" />
                </span>
                <span
                  className="play-button__icon-motion"
                  data-active={canPause}
                  aria-hidden="true"
                >
                  <Pause size={20} strokeWidth={2} fill="currentColor" />
                </span>
              </span>
            </span>
            <span className="play-button__label">
              {isStarting ? 'Starting…' : canPause ? 'Pause' : 'Play'}
            </span>
          </button>

          <div className="transport__copy">
            <p className="transport__kicker">{kicker}</p>
            <p className="transport__title">{title}</p>
          </div>
        </div>

        <div className="player__select">
          <p className="player__label" id="version-switch-label">
            Version
          </p>
          <VersionSwitch />
          <p className="player__audible">
            Audible: <strong>{audibleLabel}</strong>
          </p>
        </div>
      </div>

      <Timeline />

      <div className="player__bottom">
        <VolumeControl />
        <CrossfadeControl />
        <p className="player__status" id="player-status" role="status" aria-live="polite">
          {describeStatus(snapshot)}
        </p>
      </div>

      {snapshot.durationMismatch && bothReady && (
        <p className="player__notice" role="note">
          <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
          The versions have different lengths. Comparison stops at{' '}
          <span className="mono">{formatTime(snapshot.duration)}</span>.
        </p>
      )}
    </section>
  );
}
