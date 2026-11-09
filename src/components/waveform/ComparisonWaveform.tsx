import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AudioLines } from 'lucide-react';
import { usePlayer } from '../../hooks/usePlayer';
import { WaveformCanvas } from './WaveformCanvas';
import { sharedFraction } from './sharedFraction';
import type { WaveformService, WaveformSlotView } from '../../waveform/waveformTypes';

const ROW_HEIGHT = 56;
const PREPARING_MESSAGE = 'Preparing waveform…';
const FALLBACK_MESSAGE =
  'Waveform preview skipped for one or both files. Playback and seeking still work.';
const UNAVAILABLE_MESSAGE = 'Waveform preview unavailable. Playback and seeking still work.';

/**
 * The shared comparison waveform: Original and Edited rows on one time axis,
 * with a shared playhead and click/tap seeking through the canonical engine
 * seek operation.
 *
 * The playhead is a DOM overlay moved imperatively from the engine's time
 * subscription, so playback does not cause React to render at 60 Hz. The
 * overlay is confined to the plot column, so it cannot drift into the A/B
 * label gutter.
 */

interface ComparisonWaveformProps {
  original: WaveformService;
  edited: WaveformService;
}

function statusMessage(
  original: WaveformSlotView,
  edited: WaveformSlotView,
  missing: 'Original' | 'Edited' | null,
): string | null {
  if (original.state === 'preparing' || edited.state === 'preparing') {
    return PREPARING_MESSAGE;
  }

  if (original.state === 'unavailable') {
    return original.message ?? UNAVAILABLE_MESSAGE;
  }

  if (edited.state === 'unavailable') {
    return edited.message ?? UNAVAILABLE_MESSAGE;
  }

  if (original.state === 'fallback' || edited.state === 'fallback') {
    return original.message ?? edited.message ?? FALLBACK_MESSAGE;
  }

  if (missing) {
    return `Add the ${missing} recording to complete the comparison.`;
  }

  return null;
}

export function ComparisonWaveform({ original, edited }: ComparisonWaveformProps) {
  const { engine, snapshot } = usePlayer();
  const plotRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const capturedPointerRef = useRef<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  const subscribeOriginal = useCallback(
    (onChange: () => void) => original.subscribe(onChange),
    [original],
  );
  const subscribeEdited = useCallback(
    (onChange: () => void) => edited.subscribe(onChange),
    [edited],
  );
  const getOriginalView = useCallback(() => original.view, [original]);
  const getEditedView = useCallback(() => edited.view, [edited]);

  const originalView = useSyncExternalStore(subscribeOriginal, getOriginalView, getOriginalView);
  const editedView = useSyncExternalStore(subscribeEdited, getEditedView, getEditedView);

  const duration = snapshot.duration;
  const bothFiles = Boolean(originalView.fileName && editedView.fileName);
  const missing = !originalView.fileName
    ? ('Original' as const)
    : !editedView.fileName
      ? ('Edited' as const)
      : null;
  const enabled =
    snapshot.original.ready && snapshot.edited.ready && Number.isFinite(duration) && duration > 0;

  const originalPeaks = originalView.state === 'ready' ? (originalView.peaks?.peaks ?? null) : null;
  const editedPeaks = editedView.state === 'ready' ? (editedView.peaks?.peaks ?? null) : null;
  const hasAnyPeaks = Boolean(originalPeaks || editedPeaks);
  const message = statusMessage(originalView, editedView, missing);
  const originalFraction = sharedFraction(originalView, duration);
  const editedFraction = sharedFraction(editedView, duration);

  // Measure the plot column so the playhead can move in pixels without
  // re-rendering React on every animation frame.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) {
      return undefined;
    }

    if (typeof ResizeObserver === 'undefined') {
      setPlotWidth(plot.getBoundingClientRect().width);
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPlotWidth(entry.contentRect.width);
      }
    });
    observer.observe(plot);

    setPlotWidth(plot.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [bothFiles]);

  // Imperative playhead update: moves the overlay without a React render.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const playhead = playheadRef.current;
    if (!playhead) {
      return undefined;
    }

    // The progress tint is only meaningful when at least one lane has real
    // peaks; without it, it would look like an empty plot filling with colour.
    const publish = (time: number): void => {
      const fraction = Math.min(Math.max(time / duration, 0), 1);
      playhead.style.transform = `translateX(${fraction * plotWidth}px)`;
      // Read the ref on every publish: the tint mounts only once peaks exist.
      const progress = progressRef.current;
      if (progress) {
        progress.style.transform = `scaleX(${fraction})`;
      }
    };

    publish(snapshot.currentTime);

    return engine.subscribeToTime(publish);
  }, [engine, enabled, duration, plotWidth, snapshot.currentTime, hasAnyPeaks]);

  const seekFromPoint = useCallback(
    (clientX: number): void => {
      const plot = plotRef.current;
      if (!plot || !enabled) {
        return;
      }

      const rect = plot.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      engine.seek(fraction * duration);
    },
    [engine, enabled, duration],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent): void => {
      if (!enabled) {
        return;
      }

      event.preventDefault();
      isDraggingRef.current = true;
      capturedPointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromPoint(event.clientX);
    },
    [enabled, seekFromPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent): void => {
      if (
        !isDraggingRef.current ||
        !enabled ||
        capturedPointerRef.current === null ||
        capturedPointerRef.current !== event.pointerId
      ) {
        return;
      }
      seekFromPoint(event.clientX);
    },
    [enabled, seekFromPoint],
  );

  const endDrag = useCallback((event: React.PointerEvent): void => {
    if (capturedPointerRef.current !== null && capturedPointerRef.current === event.pointerId) {
      isDraggingRef.current = false;
      capturedPointerRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  return (
    <div
      className={`waveform${bothFiles ? '' : ' waveform--incomplete'}`}
      role="region"
      aria-label="Original and Edited waveform comparison"
      data-interactive={enabled ? 'true' : 'false'}
    >
      {originalView.fileName || editedView.fileName ? (
        <div className="waveform__body">
          <div className="waveform__labels" aria-hidden="true">
            <span className="waveform__label">A</span>
            <span className="waveform__label">B</span>
          </div>

          <div
            className="waveform__plot"
            ref={plotRef}
            data-interactive={enabled ? 'true' : 'false'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            <div className="waveform__lanes">
              <WaveformCanvas
                peaks={originalPeaks}
                height={ROW_HEIGHT}
                colorVariable="--waveform-fill-original"
                active={snapshot.audibleVersion === 'original'}
                visibleFraction={originalFraction}
              />
              <WaveformCanvas
                peaks={editedPeaks}
                height={ROW_HEIGHT}
                colorVariable="--waveform-fill-edited"
                active={snapshot.audibleVersion === 'edited'}
                visibleFraction={editedFraction}
              />
            </div>

            {enabled && (
              <div className="waveform__overlay" aria-hidden="true">
                {hasAnyPeaks && <div ref={progressRef} className="waveform__progress" />}
                <div ref={playheadRef} className="waveform__playhead" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="waveform__empty">
          <AudioLines size={20} strokeWidth={1.5} aria-hidden="true" />
          <p>Load both recordings to see their waveforms on one shared timeline.</p>
        </div>
      )}

      {message && (
        <p className="waveform__status" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
