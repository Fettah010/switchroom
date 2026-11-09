import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { WaveformCanvas } from './WaveformCanvas';
import type { WaveformService } from '../../waveform/waveformTypes';

const ROW_HEIGHT = 48;

/**
 * The shared comparison waveform: Original and Edited rows on one time axis,
 * with a shared playhead and click/tap seeking through the canonical engine
 * seek operation.
 *
 * The playhead is a DOM overlay moved imperatively from the engine's time
 * subscription, so playback does not cause React to render at 60 Hz.
 */

interface ComparisonWaveformProps {
  original: WaveformService;
  edited: WaveformService;
}

export function ComparisonWaveform({ original, edited }: ComparisonWaveformProps) {
  const { engine, snapshot } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const capturedPointerRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  const duration = snapshot.duration;
  const enabled = snapshot.original.ready && snapshot.edited.ready;

  const originalView = original.view;
  const editedView = edited.view;

  const originalPeaks = originalView.state === 'ready' ? originalView.peaks : null;
  const editedPeaks = editedView.state === 'ready' ? editedView.peaks : null;

  // Measure the container so peak requests match the display resolution.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // ResizeObserver is unavailable in some environments (jsdom, older
    // browsers). Without it, the bucket count uses the initial width.
    if (typeof ResizeObserver === 'undefined') {
      setCanvasWidth(container.getBoundingClientRect().width);
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);

    // Seed an initial measurement.
    setCanvasWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const bucketCount =
    canvasWidth > 0
      ? original.requestedBucketCount(canvasWidth, window.devicePixelRatio ?? 1)
      : original.requestedBucketCount(400, 1);

  // Time-to-percent mapping against the shared/common duration.
  const timeToPercent = useCallback(
    (time: number): number => {
      if (!enabled || !Number.isFinite(duration) || duration <= 0) {
        return 0;
      }
      return Math.min(Math.max(time / duration, 0), 1);
    },
    [enabled, duration],
  );

  // Imperative playhead update: moves the overlay without a React render.
  useEffect(() => {
    const playhead = playheadRef.current;
    const progress = progressRef.current;
    if (!playhead || !progress) {
      return undefined;
    }

    const publish = (time: number): void => {
      const pct = timeToPercent(time);
      playhead.style.transform = `translateX(${pct * 100}%)`;
      progress.style.transform = `scalex(${pct})`;
    };

    publish(snapshot.currentTime);

    const unsubscribe = engine.subscribeToTime(publish);
    return unsubscribe;
  }, [engine, timeToPercent, snapshot.currentTime]);

  const seekFromPoint = useCallback(
    (clientX: number): void => {
      const container = containerRef.current;
      if (!container || !enabled || !Number.isFinite(duration) || duration <= 0) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(fraction, 0), 1);
      const targetTime = clamped * duration;

      engine.seek(targetTime);
    },
    [engine, enabled, duration],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent): void => {
      if (!enabled) {
        return;
      }
      isDraggingRef.current = true;
      capturedPointerRef.current = event.pointerId;
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
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

  const handlePointerUp = useCallback((event: React.PointerEvent): void => {
    if (capturedPointerRef.current !== null && capturedPointerRef.current === event.pointerId) {
      isDraggingRef.current = false;
      capturedPointerRef.current = null;
      const container = containerRef.current;
      if (container) {
        container.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  const handlePointerLeave = useCallback((): void => {
    isDraggingRef.current = false;
    capturedPointerRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="waveform"
      role="region"
      aria-label="Original and Edited waveform comparison"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onTouchStart={(event) => {
        if (!enabled) {
          return;
        }
        const touch = event.touches[0];
        if (touch) {
          seekFromPoint(touch.clientX);
        }
      }}
    >
      <div className="waveform__track" style={{ width: '100%' }}>
        {/* Original row (A) */}
        <div className="waveform__row">
          <span className="waveform__label" aria-hidden="true">
            A
          </span>
          <WaveformCanvas
            peaks={originalPeaks?.peaks ?? null}
            width={bucketCount}
            height={ROW_HEIGHT}
            color="var(--waveform-fill-original)"
            active={snapshot.audibleVersion === 'original'}
          />
        </div>

        {/* Edited row (B) */}
        <div className="waveform__row">
          <span className="waveform__label" aria-hidden="true">
            B
          </span>
          <WaveformCanvas
            peaks={editedPeaks?.peaks ?? null}
            width={bucketCount}
            height={ROW_HEIGHT}
            color="var(--waveform-fill-edited)"
            active={snapshot.audibleVersion === 'edited'}
          />
        </div>
      </div>

      {/* Progress fill (elapsed portion) and playhead overlay, absolutely
          positioned over the track so they scale with the timeline width. */}
      <div className="waveform__overlay" style={{ width: '100%', height: ROW_HEIGHT * 2 + 24 }}>
        <div ref={progressRef} className="waveform__progress" />
        <div ref={playheadRef} className="waveform__playhead" />
      </div>

      {originalView.state === 'preparing' || editedView.state === 'preparing' ? (
        <p className="waveform__status" role="status">
          Preparing waveform…
        </p>
      ) : originalView.state === 'fallback' || editedView.state === 'fallback' ? (
        <p className="waveform__status" role="status">
          Waveform preview skipped for one or both files. Playback and seeking still work.
        </p>
      ) : originalView.state === 'unavailable' || editedView.state === 'unavailable' ? (
        <p className="waveform__status" role="status">
          {originalView.message || editedView.message || 'Waveform preview unavailable.'}
        </p>
      ) : null}
    </div>
  );
}
