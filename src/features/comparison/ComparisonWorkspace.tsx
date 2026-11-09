import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LockKeyhole } from 'lucide-react';
import { AudioFileSlot } from '../../components/audio-file-slot/AudioFileSlot';
import { PlayerSurface } from '../../components/player/PlayerSurface';
import { Reveal } from '../../components/motion/Reveal';
import { ComparisonWaveform } from '../../components/waveform/ComparisonWaveform';
import { WaveformServiceImpl } from '../../waveform/waveformService';

const slotContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.11 },
  },
};

export function ComparisonWorkspace() {
  const [originalService] = useState(() => new WaveformServiceImpl({ version: 'original' }));
  const [editedService] = useState(() => new WaveformServiceImpl({ version: 'edited' }));

  // Dispose waveform services when the workspace unmounts.
  useEffect(() => {
    return () => {
      originalService.dispose();
      editedService.dispose();
    };
  }, [originalService, editedService]);

  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <Reveal className="workspace__head" viewport={false}>
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
      </Reveal>

      <motion.div
        className="slots"
        variants={slotContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <AudioFileSlot version="original" waveformService={originalService} />
        <AudioFileSlot version="edited" waveformService={editedService} />
      </motion.div>

      <Reveal className="player-and-waveform" viewport={false}>
        <PlayerSurface />
        <ComparisonWaveform original={originalService} edited={editedService} />
      </Reveal>

      <Reveal className="workspace__footnote" viewport duration={320}>
        <p>
          Comparisons are temporary: refreshing or closing the page clears the selected files. The
          transition duration lasts for this session only; nothing is saved.
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
