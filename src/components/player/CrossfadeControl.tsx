import type { CSSProperties } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { DEFAULT_CROSSFADE_MS, MAX_CROSSFADE_MS, MIN_CROSSFADE_MS } from '../../audio/crossfade';

const CROSSFADE_ID = 'crossfade-duration';

function crossfadeProgress(milliseconds: number): number {
  const span = MAX_CROSSFADE_MS - MIN_CROSSFADE_MS;
  return ((milliseconds - MIN_CROSSFADE_MS) / span) * 100;
}

export function CrossfadeControl() {
  const { engine, snapshot } = usePlayer();
  const milliseconds = snapshot.crossfadeMs;
  const percent = crossfadeProgress(milliseconds);

  return (
    <div className="transition">
      <label className="transition__label" htmlFor={CROSSFADE_ID}>
        Crossfade
      </label>

      <div className="crossfade__scale" aria-hidden="true">
        <span>{MIN_CROSSFADE_MS}</span>
        <span data-default>{DEFAULT_CROSSFADE_MS}</span>
        <span>{MAX_CROSSFADE_MS}</span>
      </div>

      <input
        id={CROSSFADE_ID}
        className="range-control range-control--crossfade transition__range"
        type="range"
        min={MIN_CROSSFADE_MS}
        max={MAX_CROSSFADE_MS}
        step={20}
        value={milliseconds}
        aria-valuetext={`${milliseconds} milliseconds`}
        onChange={(event) => engine.setCrossfadeMs(Number(event.target.value))}
        style={{ '--range-progress': `${percent}%` } as CSSProperties}
      />
      <span className="transition__value" aria-hidden="true">
        {milliseconds} ms
      </span>
    </div>
  );
}
