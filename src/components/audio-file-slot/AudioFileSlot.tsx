import { useEffect, useRef, useState, type DragEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, FileAudio, LoaderCircle, Upload, X } from 'lucide-react';
import type { AudioVersion } from '../../audio/audioTypes';
import { formatFileSize, ACCEPT_ATTRIBUTE } from '../../audio/fileValidation';
import { formatTime } from '../../audio/timeFormatting';
import { usePlayer } from '../../hooks/usePlayer';
import type { WaveformService } from '../../waveform/waveformTypes';
import type { MediaDescriptor } from '../../workspaces/workspaceTypes';

const SLOT_COPY: Record<
  AudioVersion,
  { letter: string; title: string; subtitle: string; description: string }
> = {
  original: {
    letter: 'A',
    title: 'Original',
    subtitle: 'The starting recording',
    description: 'Choose the original mix or master.',
  },
  edited: {
    letter: 'B',
    title: 'Edited',
    subtitle: 'The adjusted recording',
    description: 'Choose the version you want to compare.',
  },
};

export function AudioFileSlot({
  version,
  waveformService,
  readOnly = false,
  savedDescriptor = null,
  onFileLoaded,
  onFileRemoved,
}: {
  version: AudioVersion;
  waveformService?: WaveformService;
  readOnly?: boolean;
  savedDescriptor?: MediaDescriptor | null;
  onFileLoaded?: (file: File) => void;
  onFileRemoved?: () => void;
}) {
  const { engine, snapshot } = usePlayer();
  const info = snapshot[version];
  const copy = SLOT_COPY[version];
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const hadFile = useRef(Boolean(info.fileName));
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);

  const inputId = `audio-file-${version}`;
  const errorId = `audio-file-${version}-error`;
  const statusId = `audio-file-${version}-status`;
  const errorMessage = selectionError ?? info.error;

  useEffect(() => {
    const hasFile = Boolean(info.fileName);

    if (!hadFile.current && hasFile) {
      const handle = window.setTimeout(() => replaceRef.current?.focus(), 0);
      hadFile.current = hasFile;
      return () => window.clearTimeout(handle);
    }

    hadFile.current = hasFile;
  }, [info.fileName]);

  function chooseFiles(files: FileList | null): void {
    if (readOnly) return;
    if (!files || files.length === 0) {
      return;
    }

    if (files.length > 1) {
      setSelectionError(`Choose one audio file for the ${copy.title} slot.`);
      return;
    }

    const file = files[0];
    if (!file) {
      return;
    }

    // Non-blocking warning if selected file differs from saved descriptor
    if (savedDescriptor) {
      const nameDiffers = file.name !== savedDescriptor.fileName;
      const sizeDiffers = Math.abs(file.size - savedDescriptor.sizeBytes) > 1024;
      if (nameDiffers || sizeDiffers) {
        setMismatchWarning(
          `Selected file differs from saved setup (${savedDescriptor.fileName}, ${formatFileSize(savedDescriptor.sizeBytes)}). Playing newly selected audio.`,
        );
      } else {
        setMismatchWarning(null);
      }
    } else {
      setMismatchWarning(null);
    }

    const result = engine.loadFile(version, file);
    setSelectionError(result.ok ? null : result.message);

    if (waveformService) {
      waveformService.loadFile(result.ok ? file : null);
    }

    if (result.ok && onFileLoaded) {
      onFileLoaded(file);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>): void {
    if (readOnly) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (readOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    if (readOnly) return;
    event.preventDefault();
    dragDepth.current = Math.max(dragDepth.current - 1, 0);

    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    if (readOnly) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    chooseFiles(event.dataTransfer.files);
  }

  function openPicker(): void {
    if (readOnly) return;
    inputRef.current?.click();
  }

  function handleRemove(): void {
    if (readOnly) return;
    setSelectionError(null);
    setMismatchWarning(null);
    engine.removeFile(version);

    if (waveformService) {
      waveformService.loadFile(null);
    }

    if (onFileRemoved) {
      onFileRemoved();
    }
  }

  const reduceMotion = useReducedMotion();

  const slotVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0 : 0.4,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  return (
    <motion.article
      className={`slot slot--${version}${isDragging ? ' slot--dragging' : ''}${readOnly ? ' slot--readonly' : ''}`}
      aria-labelledby={`slot-${version}-title`}
      aria-busy={info.loading}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion ? 'visible' : 'visible'}
      variants={slotVariants}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="slot__head">
        <span className="slot__letter" aria-hidden="true">
          {copy.letter}
        </span>
        <div className="slot__heading">
          <h3 className="slot__title" id={`slot-${version}-title`}>
            {copy.title}
          </h3>
          <p className="slot__subtitle">{copy.subtitle}</p>
        </div>
        <span
          className={`slot__status${
            errorMessage
              ? ' slot__status--error'
              : info.loading
                ? ' slot__status--loading'
                : info.ready
                  ? ' slot__status--ready'
                  : ''
          }`}
          id={statusId}
        >
          <span className="slot__status-dot" aria-hidden="true" />
          {errorMessage
            ? 'Needs attention'
            : info.loading
              ? 'Loading'
              : info.ready
                ? 'Ready'
                : 'Waiting'}
        </span>
      </header>

      {!readOnly && (
        <input
          ref={inputRef}
          id={inputId}
          className="sr-only"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          tabIndex={-1}
          aria-label={`Choose ${copy.title} audio file`}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? errorId : statusId}
          onChange={(event) => {
            chooseFiles(event.target.files);
            event.target.value = '';
          }}
        />
      )}

      {!info.fileName ? (
        readOnly ? (
          <div className="dropzone dropzone--readonly">
            <span className="dropzone__icon" aria-hidden="true">
              <FileAudio size={17} strokeWidth={1.75} />
            </span>
            <span className="dropzone__title">
              {savedDescriptor ? savedDescriptor.fileName : 'Audio not loaded'}
            </span>
            <span className="dropzone__hint">
              {savedDescriptor
                ? `Saved setup: ${formatFileSize(savedDescriptor.sizeBytes)}`
                : 'Audio file must be selected in editor.'}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="dropzone"
            aria-describedby={errorMessage ? errorId : undefined}
            onClick={openPicker}
          >
            <span className="dropzone__icon" aria-hidden="true">
              <Upload size={17} strokeWidth={1.75} />
            </span>
            <span className="dropzone__title">
              {savedDescriptor
                ? `Select ${savedDescriptor.fileName} again`
                : 'Choose or drop a file'}
            </span>
            <span className="dropzone__hint">
              {savedDescriptor
                ? `Expected: ${formatFileSize(savedDescriptor.sizeBytes)} · Click to select`
                : copy.description}
            </span>
            <span className="dropzone__formats">WAV · MP3 · FLAC · AAC · M4A</span>
          </button>
        )
      ) : (
        <div className="slot__file">
          <div className="file-head">
            <span className="file-head__icon" aria-hidden="true">
              <FileAudio size={17} strokeWidth={1.75} />
            </span>
            <span className="file-head__name" title={info.fileName}>
              {info.fileName}
            </span>
          </div>

          <dl className="file-meta">
            <div>
              <dt>Format</dt>
              <dd>{info.extension ? info.extension.toUpperCase() : '—'}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatFileSize(info.fileSize)}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{info.duration ? formatTime(info.duration) : info.loading ? 'Reading…' : '—'}</dd>
            </div>
          </dl>

          {info.loading && (
            <p className="slot__loading" role="status">
              <LoaderCircle size={14} className="spin" aria-hidden="true" />
              Reading audio metadata. Large local files can take a moment.
            </p>
          )}

          {errorMessage && (
            <p className="slot__error" id={errorId} role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {errorMessage}
            </p>
          )}

          {!errorMessage && mismatchWarning && (
            <p className="slot__warning">
              <AlertTriangle size={14} aria-hidden="true" />
              {mismatchWarning}
            </p>
          )}

          {!errorMessage && !mismatchWarning && info.warning && (
            <p className="slot__warning">
              <AlertTriangle size={14} aria-hidden="true" />
              {info.warning}
            </p>
          )}

          {!errorMessage && info.ready && (
            <p className="slot__ready">
              <Check size={14} aria-hidden="true" />
              Loaded locally. Nothing was uploaded.
            </p>
          )}

          {!readOnly && (
            <div className="slot__actions">
              <button
                ref={replaceRef}
                type="button"
                className="text-button"
                aria-describedby={errorMessage ? errorId : undefined}
                onClick={openPicker}
              >
                Replace
              </button>
              <button
                type="button"
                className="text-button text-button--quiet"
                onClick={handleRemove}
              >
                <X size={13} aria-hidden="true" />
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      {!info.fileName && errorMessage && (
        <p className="slot__error" id={errorId} role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          {errorMessage}
        </p>
      )}

      <p className="slot__privacy">Read in this tab only. Never uploaded.</p>
    </motion.article>
  );
}
