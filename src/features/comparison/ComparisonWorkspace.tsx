import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { LockKeyhole } from 'lucide-react';
import { AudioFileSlot } from '../../components/audio-file-slot/AudioFileSlot';
import { PlayerSurface } from '../../components/player/PlayerSurface';
import { Reveal } from '../../components/motion/Reveal';
import { ComparisonWaveform } from '../../components/waveform/ComparisonWaveform';
import { WaveformServiceImpl } from '../../waveform/waveformService';
import type {
  AudioVersion,
  PresentationLayout,
  WorkspaceRecord,
} from '../../workspaces/workspaceTypes';

const slotContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.11 },
  },
};

export function ComparisonWorkspace({
  workspace,
  layout = 'standard',
  readOnly = false,
  onMediaChanged,
}: {
  workspace?: WorkspaceRecord | null;
  layout?: PresentationLayout;
  readOnly?: boolean;
  onMediaChanged?: (version: AudioVersion, file: File | null) => void;
}) {
  const [originalService] = useState(() => new WaveformServiceImpl({ version: 'original' }));
  const [editedService] = useState(() => new WaveformServiceImpl({ version: 'edited' }));
  const disposeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (disposeTimer.current !== null) {
      window.clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }

    return () => {
      disposeTimer.current = window.setTimeout(() => {
        disposeTimer.current = null;
        originalService.dispose();
        editedService.dispose();
      }, 0);
    };
  }, [originalService, editedService]);

  const activeLayout = layout ?? workspace?.presentationLayout ?? 'standard';

  return (
    <section
      className={`workspace workspace--${activeLayout}`}
      data-layout={activeLayout}
      aria-labelledby="workspace-title"
    >
      <Reveal className="workspace__head" viewport={false}>
        <div className="workspace__intro">
          <p className="section-kicker">01 — Compare</p>
          <h2 className="section-title" id="workspace-title">
            {workspace ? workspace.title : 'Set the comparison'}
          </h2>
          {workspace?.description && (
            <p className="workspace__description">{workspace.description}</p>
          )}
        </div>

        <p className="privacy-line">
          <LockKeyhole size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>
            <strong>Local-only listening.</strong> Your audio stays in this browser. Switchroom does
            not upload or store your files.
          </span>
        </p>
      </Reveal>

      <motion.div
        className="slots"
        variants={slotContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <AudioFileSlot
          version="original"
          waveformService={originalService}
          readOnly={readOnly}
          savedDescriptor={workspace?.originalMedia}
          onFileLoaded={(file) => onMediaChanged?.('original', file)}
          onFileRemoved={() => onMediaChanged?.('original', null)}
        />
        <AudioFileSlot
          version="edited"
          waveformService={editedService}
          readOnly={readOnly}
          savedDescriptor={workspace?.editedMedia}
          onFileLoaded={(file) => onMediaChanged?.('edited', file)}
          onFileRemoved={() => onMediaChanged?.('edited', null)}
        />
      </motion.div>

      <Reveal className="player-and-waveform" viewport={false}>
        <PlayerSurface />
        <ComparisonWaveform original={originalService} edited={editedService} />
      </Reveal>

      <Reveal className="workspace__footnote" viewport duration={320}>
        <p>
          Comparisons are local: audio files are read in this browser session only and never
          uploaded. Workspace settings and presentation preferences are saved in this browser.
        </p>
        <p>
          Actual codec support depends on your browser and on the codec stored inside the file. AAC
          and M4A support varies by platform, and a supported extension is not a guarantee that the
          file will decode.
        </p>
      </Reveal>
    </section>
  );
}
