import { usePlayer } from '../../hooks/usePlayer';
import { DEFAULT_CROSSFADE_MS, MAX_CROSSFADE_MS, MIN_CROSSFADE_MS } from '../../audio/crossfade';
import { RangeControl } from '../ui/RangeControl';

const CROSSFADE_ID = 'crossfade-duration';

function crossfadeProgress(milliseconds: number): number {
  const span = MAX_CROSSFADE_MS - MIN_CROSSFADE_MS;
  return (milliseconds - MIN_CROSSFADE_MS) / span;
}

function crossfadePercent(milliseconds: number): string {
  return `${crossfadeProgress(milliseconds) * 100}%`;
}

export function CrossfadeControl() {
  const { engine, snapshot } = usePlayer();
  const milliseconds = snapshot.crossfadeMs;
  const progress = crossfadeProgress(milliseconds);

  return (
    <div className="control control--crossfade">
      <div className="control__head">
        <label className="control__label" htmlFor={CROSSFADE_ID}>
          Crossfade
        </label>
        <span className="transition__value" aria-hidden="true">
          {milliseconds} ms
        </span>
      </div>

      <RangeControl
        wrapperClassName="transition__range"
        id={CROSSFADE_ID}
        min={MIN_CROSSFADE_MS}
        max={MAX_CROSSFADE_MS}
        step={20}
        value={milliseconds}
        progress={progress}
        aria-valuetext={`${milliseconds} milliseconds`}
        onChange={(event) => engine.setCrossfadeMs(Number(event.target.value))}
      >
        <div className="crossfade__scale" aria-hidden="true">
          <span className="crossfade__scale-end">{MIN_CROSSFADE_MS}</span>
          <span
            className="crossfade__scale-default"
            style={{ left: crossfadePercent(DEFAULT_CROSSFADE_MS) }}
          >
            {DEFAULT_CROSSFADE_MS}
          </span>
          <span className="crossfade__scale-end crossfade__scale-end--max">{MAX_CROSSFADE_MS}</span>
        </div>
      </RangeControl>
    </div>
  );
}
