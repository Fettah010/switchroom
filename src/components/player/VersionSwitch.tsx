import { Check } from 'lucide-react';
import type { AudioVersion } from '../../audio/audioTypes';
import { usePlayer } from '../../hooks/usePlayer';

const VERSIONS: ReadonlyArray<{ version: AudioVersion; key: string; label: string }> = [
  { version: 'original', key: 'A', label: 'Original' },
  { version: 'edited', key: 'B', label: 'Edited' },
];

export function VersionSwitch() {
  const { engine, snapshot } = usePlayer();
  const enabled = snapshot.original.ready && snapshot.edited.ready;

  return (
    <div className="version-switch" role="group" aria-label="Audible version">
      {VERSIONS.map(({ version, key, label }) => {
        const active = snapshot.activeVersion === version;

        return (
          <button
            key={version}
            type="button"
            className="version-tab"
            aria-pressed={active}
            disabled={!enabled}
            onClick={() => {
              void engine.switchTo(version);
            }}
          >
            <span className="version-tab__key" aria-hidden="true">
              {key}
            </span>
            <span className="version-tab__label">{label}</span>
            <span className="version-tab__indicator" aria-hidden="true" data-visible={active}>
              <Check size={12} strokeWidth={2.4} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
