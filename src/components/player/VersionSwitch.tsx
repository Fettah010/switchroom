import { Check, LoaderCircle } from 'lucide-react';
import type { AudioVersion } from '../../audio/audioTypes';
import { usePlayer } from '../../hooks/usePlayer';

const VERSIONS: ReadonlyArray<{ version: AudioVersion; key: string; label: string }> = [
  { version: 'original', key: 'A', label: 'Original' },
  { version: 'edited', key: 'B', label: 'Edited' },
];

export function VersionSwitch() {
  const { engine, snapshot } = usePlayer();
  const enabled = snapshot.original.ready && snapshot.edited.ready;
  const switchingTo = snapshot.switchingTo;

  return (
    <div
      className="version-switch"
      role="group"
      aria-label="Selected version"
      aria-busy={switchingTo !== null}
    >
      {VERSIONS.map(({ version, key, label }) => {
        // `activeVersion` is the selected/target deck. While a switch is
        // aligning, `switchingTo` marks the target without claiming it is
        // already audible; the status line names the audible deck separately.
        const selected = snapshot.activeVersion === version;
        const isTarget = switchingTo === version;

        return (
          <button
            key={version}
            type="button"
            className="version-tab"
            aria-pressed={selected}
            disabled={!enabled}
            data-switching={isTarget ? 'true' : undefined}
            onClick={() => {
              void engine.switchTo(version);
            }}
          >
            <span className="version-tab__key" aria-hidden="true">
              {key}
            </span>
            <span className="version-tab__label">{label}</span>
            <span className="version-tab__indicator" aria-hidden="true" data-visible={selected}>
              {isTarget ? (
                <LoaderCircle size={12} strokeWidth={2.4} className="spin" />
              ) : (
                <Check size={12} strokeWidth={2.4} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
