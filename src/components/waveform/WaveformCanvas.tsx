import { useEffect, useRef, useCallback } from 'react';

/**
 * Canvas renderer for a single waveform row.
 *
 * Draws downsampled peak magnitudes as vertical bars on a shared time axis.
 * The playhead is NOT drawn here: it is a separate DOM overlay updated
 * imperatively from the engine's time subscription so playback does not force
 * a React render every animation frame.
 *
 * Dimensions respond to container resize via ResizeObserver (disconnected on
 * unmount). Redraws only when peaks, dimensions, color or active state change.
 */

interface WaveformCanvasProps {
  peaks: Float32Array | null;
  width: number;
  height: number;
  /** CSS color for the peaks. */
  color: string;
  /** When true, this is the currently audible version (subtle emphasis). */
  active: boolean;
}

export function WaveformCanvas({ peaks, width, height, color, active }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const dimsRef = useRef({ width: 0, height: 0, dpr: 1 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const { width: cssWidth, height: cssHeight, dpr } = dimsRef.current;

    // Cap canvas size to keep memory bounded.
    const maxCanvasWidth = 2400;
    const drawWidth = Math.min(Math.max(cssWidth, 1), maxCanvasWidth) * dpr;
    const drawHeight = Math.max(cssHeight, 1) * dpr;

    if (drawWidth !== canvas.width || drawHeight !== canvas.height) {
      canvas.width = drawWidth;
      canvas.height = drawHeight;
    } else {
      ctx.clearRect(0, 0, drawWidth, drawHeight);
    }

    if (!peaks || peaks.length === 0) {
      return;
    }

    ctx.fillStyle = color;
    ctx.globalAlpha = active ? 1 : 0.55;

    const bucketCount = peaks.length;
    const barWidth = Math.max(1, drawWidth / bucketCount);
    const topGap = drawHeight * 0.08;
    const bottomGap = drawHeight * 0.08;
    const usableHeight = drawHeight - topGap - bottomGap;

    // Draw peaks from the bottom up so the waveform sits in the lower half,
    // leaving room above for the playhead/progress overlay.
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const raw = peaks[bucket];
      const value = raw ?? 0;
      const peak = Number.isFinite(value) ? value : 0;
      const heightPx = Math.max(1, peak * usableHeight);
      const x = bucket * barWidth;
      const y = drawHeight - bottomGap - heightPx;

      ctx.fillRect(x, y, Math.max(0.5, barWidth - 0.5), heightPx);
    }

    ctx.globalAlpha = 1;
  }, [peaks, color, active]);

  // Redraw whenever the inputs change.
  useEffect(() => {
    draw();
  }, [draw, peaks, width, height, color, active]);

  // Resize the canvas surface to the container's CSS size at device pixel
  // ratio, then redraw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // ResizeObserver is unavailable in some environments (jsdom, older
    // browsers). Without it, the canvas keeps its initial measured size.
    if (typeof ResizeObserver === 'undefined') {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio ?? 1, 2));
      dimsRef.current = { width: rect.width, height: rect.height, dpr };
      draw();
      return;
    }

    const update = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio ?? 1, 2));
      dimsRef.current = {
        width: rect.width,
        height: rect.height,
        dpr,
      };
      draw();
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height,
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
}
