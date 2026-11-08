import { AlertTriangle, Pause, Play } from 'lucide-react';
import type { ABPlayerSnapshot } from '../../audio/audioTypes';
import { formatTime } from '../../audio/timeFormatting';
import { usePlayer } from '../../hooks/usePlayer';
import { Timeline } from './Timeline';
import { VersionSwitch } from './VersionSwitch';
import { VolumeControl } from './VolumeControl';

function versionLabel(snapshot: ABPlayerSnapshot): string {
  return snapshot.activeVersion === 'original' ? 'Original' : 'Edited';
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
    return `Playing ${versionLabel(snapshot)}. Switch versions at any time.`;
  }

  if (snapshot.status === 'paused') {
    return `Paused on ${versionLabel(snapshot)}.`;
  }

  return 'Add both recordings to enable the player.';
}

export function PlayerSurface() {
  const { engine, snapshot } = usePlayer();
  const bothReady = snapshot.original.ready && snapshot.edited.ready;
  const isPlaying = snapshot.status === 'playing';

  return (
    <section className="player" aria-label="Comparison player">
      <div className="player__top">
        <div className="transport">
          <button
            type="button"
            className="play-button"
            disabled={!bothReady}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            aria-describedby="player-status"
            onClick={() => {
              if (isPlaying) {
                engine.pause();
              } else {
                void engine.play();
              }
            }}
          >
            <span className="play-button__icon" aria-hidden="true">
              {isPlaying ? (
                <Pause size={20} strokeWidth={2} fill="currentColor" />
              ) : (
                <Play size={20} strokeWidth={2} fill="currentColor" />
              )}
            </span>
            <span className="play-button__label">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="transport__copy">
            <p className="transport__kicker">
              {isPlaying ? 'Now playing' : bothReady ? 'Ready' : 'Waiting for audio'}
            </p>
            <p className="transport__title">
              {bothReady ? versionLabel(snapshot) : 'No comparison yet'}
            </p>
          </div>
        </div>

        <div className="player__select">
          <p className="player__label" id="version-switch-label">
            Audible version
          </p>
          <VersionSwitch />
        </div>
      </div>

      <Timeline />

      <div className="player__bottom">
        <VolumeControl />
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
