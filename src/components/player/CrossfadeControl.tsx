import { usePlayer } from '../../hooks/usePlayer';
import { MAX_CROSSFADE_MS, MIN_CROSSFADE_MS } from '../../audio/crossfade';

const CROSSFADE_ID = 'crossfade-duration';

export function CrossfadeControl() {
  const { engine, snapshot } = usePlayer();
  const milliseconds = snapshot.crossfadeMs;

  return (
    <div className="transition">
      <label className="transition__label" htmlFor={CROSSFADE_ID}>
        Crossfade
      </label>
      <input
        id={CROSSFADE_ID}
        className="transition__range"
        type="range"
        min={MIN_CROSSFADE_MS}
        max={MAX_CROSSFADE_MS}
        step={20}
        value={milliseconds}
        aria-valuetext={`${milliseconds} milliseconds`}
        onChange={(event) => engine.setCrossfadeMs(Number(event.target.value))}
      />
      <span className="transition__value" aria-hidden="true">
        {milliseconds} ms
      </span>
    </div>
  );
}
