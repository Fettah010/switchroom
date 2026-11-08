import { LockKeyhole } from 'lucide-react';
import { AudioFileSlot } from '../../components/audio-file-slot/AudioFileSlot';
import { PlayerSurface } from '../../components/player/PlayerSurface';

export function ComparisonWorkspace() {
  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <header className="workspace__head">
        <div className="workspace__intro">
          <p className="section-kicker">01 — Compare</p>
          <h2 className="section-title" id="workspace-title">
            Set the comparison
          </h2>
        </div>

        <p className="privacy-line">
          <LockKeyhole size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <strong>Local-only listening.</strong> Your audio stays in this browser. Switchroom does
            not upload or store your files.
          </span>
        </p>
      </header>

      <div className="slots">
        <AudioFileSlot version="original" />
        <AudioFileSlot version="edited" />
      </div>

      <PlayerSurface />

      <div className="workspace__footnote">
        <p>
          Comparisons are temporary: refreshing or closing the page clears the selected files.
          Nothing is saved.
        </p>
        <p>
          Actual codec support depends on your browser and on the codec stored inside the file. AAC
          and M4A support varies by platform.
        </p>
      </div>
    </section>
  );
}
