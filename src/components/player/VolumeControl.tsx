import { Volume2, VolumeX } from 'lucide-react';
import { usePlayer } from '../../hooks/usePlayer';
import { RangeControl } from '../ui/RangeControl';

export function VolumeControl() {
  const { engine, snapshot } = usePlayer();
  const percent = Math.round(snapshot.volume * 100);

  return (
    <div className="control control--volume">
      <div className="control__head">
        <span className="control__label">Volume</span>
        <span className="volume__value" aria-hidden="true">
          {snapshot.muted ? 'Muted' : `${percent}%`}
        </span>
      </div>

      <div className="control__row">
        <button
          type="button"
          className="icon-button"
          aria-label={snapshot.muted ? 'Unmute' : 'Mute'}
          aria-pressed={snapshot.muted}
          onClick={() => engine.setMuted(!snapshot.muted)}
        >
          {snapshot.muted ? (
            <VolumeX size={17} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Volume2 size={17} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        <RangeControl
          wrapperClassName="volume__range"
          min={0}
          max={1}
          step={0.01}
          value={snapshot.volume}
          progress={snapshot.volume}
          aria-label="Master volume"
          aria-valuetext={snapshot.muted ? 'Muted' : `${percent}%`}
          onChange={(event) => engine.setVolume(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
