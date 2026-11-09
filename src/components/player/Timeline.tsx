import { formatTime, progressPercent } from '../../audio/timeFormatting';
import { usePlayer } from '../../hooks/usePlayer';
import { usePlayhead } from '../../hooks/usePlayhead';
import { RangeControl } from '../ui/RangeControl';

export function Timeline() {
  const { engine, snapshot } = usePlayer();
  const time = usePlayhead();
  const enabled = snapshot.original.ready && snapshot.edited.ready;
  const duration = snapshot.duration;
  const value = Math.min(time, duration || 0);
  const percent = progressPercent(value, duration);

  return (
    <div className="timeline">
      <RangeControl
        wrapperClassName="timeline__range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={enabled ? value : 0}
        disabled={!enabled}
        progress={percent / 100}
        aria-label="Playback position"
        aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
        onChange={(event) => engine.seek(Number(event.target.value))}
      />

      <div className="timeline__times">
        <span className="time" aria-label="Elapsed time">
          {formatTime(value)}
        </span>
        <span className="time time--total" aria-label="Total time">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
