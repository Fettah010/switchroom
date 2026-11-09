import { useCallback, useEffect, useRef } from 'react';

/**
 * Canvas renderer for a single waveform row.
 *
 * Draws a symmetric peak envelope around a centreline on a shared time axis.
 * The playhead is NOT drawn here: it is a separate DOM overlay updated
 * imperatively from the engine's time subscription so playback does not force
 * a React render every animation frame.
 *
 * Dimensions respond to container resize via ResizeObserver (disconnected on
 * unmount). Theme changes are picked up with a MutationObserver on the root
 * `data-theme` attribute, because Canvas cannot read CSS custom properties
 * directly. Redraws only when peaks, dimensions, colour or active state change.
 */

interface WaveformCanvasProps {
  peaks: Float32Array | null;
  /** CSS pixel height of the row. */
  height: number;
  /** Theme custom property that resolves to the peak colour. */
  colorVariable: string;
  /** When true, this is the currently audible version (subtle emphasis). */
  active: boolean;
  /**
   * Fraction of the peak array that belongs to the shared common duration.
   * A longer file is clipped to the compared portion rather than squeezed.
   */
  visibleFraction?: number;
}

const FALLBACK_COLOR = '#8a8f99';

function resolveColor(canvas: HTMLCanvasElement, variable: string): string {
  if (typeof window === 'undefined') {
    return FALLBACK_COLOR;
  }

  const computed = window.getComputedStyle(canvas).getPropertyValue(variable).trim();

  if (computed && !computed.startsWith('var(')) {
    return computed;
  }

  // Some engines return the unresolved token stream for a custom property
  // that itself contains var(). Resolve it through a throwaway element whose
  // `color` is the custom property.
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.width = '0';
  probe.style.height = '0';
  canvas.parentElement?.appendChild(probe);

  const resolved = window.getComputedStyle(probe).color;
  probe.remove();

  return resolved || FALLBACK_COLOR;
}

export function WaveformCanvas({
  peaks,
  height,
  colorVariable,
  active,
  visibleFraction = 1,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => undefined);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width > 0 ? rect.width : canvas.clientWidth;
    const cssHeight = rect.height > 0 ? rect.height : height;

    if (cssWidth <= 0 || cssHeight <= 0) {
      return;
    }

    const dpr = Math.max(1, Math.min(window.devicePixelRatio ?? 1, 2));
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const color = resolveColor(canvas, colorVariable);
    const midpoint = cssHeight / 2;

    // A faint centreline keeps an empty/quiet row legible without looking like
    // a failed render.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, midpoint - 0.5, cssWidth, 1);

    if (!peaks || peaks.length === 0) {
      ctx.globalAlpha = 1;
      return;
    }

    const totalBuckets = peaks.length;
    const fraction = Number.isFinite(visibleFraction)
      ? Math.min(1, Math.max(0, visibleFraction))
      : 1;
    // Draw only the buckets inside the shared common duration, stretched to
    // the plot width. For equal-length files this is every bucket.
    const bucketCount = Math.max(1, Math.min(totalBuckets, Math.round(totalBuckets * fraction)));
    const bucketWidth = cssWidth / bucketCount;
    const barWidth = Math.max(1, bucketWidth * (bucketCount > 400 ? 1 : 0.72));
    const halfHeight = Math.max(1, midpoint - cssHeight * 0.08);

    ctx.globalAlpha = active ? 1 : 0.58;

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const raw = peaks[bucket] ?? 0;
      const value = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;

      if (value <= 0) {
        continue;
      }

      const amplitude = Math.max(0.75, value * halfHeight);
      const x = bucket * bucketWidth + (bucketWidth - barWidth) / 2;

      // Symmetric around the centreline: the same rectangle grows up and down.
      ctx.fillRect(x, midpoint - amplitude, barWidth, amplitude * 2);
    }

    ctx.globalAlpha = 1;
  }, [active, colorVariable, height, peaks, visibleFraction]);

  // Keep the latest draw closure available to observers without re-creating
  // them on every prop change.
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  // Match the canvas backing store to its CSS size at device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const redraw = (): void => drawRef.current();

    // ResizeObserver is unavailable in some environments (jsdom, older
    // browsers). Without it, the canvas keeps its initial measured size.
    if (typeof ResizeObserver === 'undefined') {
      redraw();
      window.addEventListener('resize', redraw);
      return () => window.removeEventListener('resize', redraw);
    }

    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  // Redraw when the theme changes, since Canvas needs resolved colours.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const observer = new MutationObserver(() => drawRef.current());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="waveform__canvas"
      data-ready={peaks ? 'true' : 'false'}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
