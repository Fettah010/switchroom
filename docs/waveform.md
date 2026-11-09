# Waveform

Waveform previews are a local, client-side enhancement on top of the v0.2
playback engine. They show the Original (A) and Edited (B) amplitude envelopes
on one shared time axis, with a shared playhead and click/tap seek. They never
block playback and never leave the browser.

## Data model

A waveform is compact, downsampled peak data:

```ts
interface WaveformPeaks {
  version: 'original' | 'edited';
  durationSeconds: number;
  bucketCount: number;
  peaks: Float32Array;
  sourceGeneration: number;
}
```

- `peaks` holds one magnitude per time bucket, normalized to `[0, 1]` using the
  maximum absolute channel amplitude (mono envelope).
- Buckets are equal-width slices of the file's duration so each bucket maps to a
  fraction of the shared/common timeline.
- Values are finite and clamped to `[0, 1]`. Raw decoded PCM is discarded after
  analysis; only the compact peaks are retained.

## Pipeline

The waveform subsystem is independent of `ABAudioEngine`. The engine owns the
playhead, the media decks and the Web Audio graph; the waveform service only
derives peaks from a local `File`.

Recommended flow:

```
Local File
   │
   ▼
File/metadata preflight
   │
   ├── over resource budget ──► waveform fallback (plain timeline, audio OK)
   │
   ▼
Waveform decode/analysis strategy selection
   │
   ├── Dedicated Worker available ──► WAV parse in worker / peak reduction
   │                                   │ (transferable ArrayBuffer result)
   │                                   ▼
   │                            Compact peaks
   │
   └── Main-thread AudioContext.decodeAudioData
                                 (non-WAV codecs, size-bounded) ──►
                                                                 channels to worker
                                                                 for reduction
```

Invariants:

1. Playback readiness is independent from waveform readiness.
2. Pressing Play never waits for waveform decode or peak extraction.
3. Waveform work is cancellable when a file is replaced, removed or disposed.
4. Every result carries a `requestId` and the slot's `fileGeneration`; stale results are ignored.
5. Memory and time limits are explicit and bounded.
6. Waveform failure never marks a playable deck as failed.
7. Large-file fallback is a designed state, not an application error.

## Resource policy (`src/waveform/waveformBudget.ts`)

Before decoding, the service estimates risk from file size and available
metadata and picks a conservative budget:

- default encoded-input ceiling: 60 MB (20 MB on ≤ 4 GB devices);
- tighter encoded ceiling for compressed formats whose duration is unknown
  until decode;
- default decoded-PCM ceiling: 240 MB (60 MB on ≤ 4 GB devices), with a 2×
  analysis-copy factor so transient channel copies are counted;
- duration ceiling for very long files;
- max buckets: 2400 (1200 on ≤ 4 GB devices).

A WAV header preflight reads only the first 64 KB, so an oversized or
over-long WAV is rejected before the whole file is read into memory.
`navigator.deviceMemory` is feature-detected and only informs the budget; it
is never required. Unknown duration uses a conservative per-MB heuristic.

## Worker (`src/waveform/waveformWorker.ts`)

A Dedicated Worker owns CPU-heavy work:

- parses PCM WAV (RIFF/WAVE, 8/16/24/32-bit PCM, 32-bit IEEE float,
  WAVE_FORMAT_EXTENSIBLE, up to 8 channels) directly from an ArrayBuffer — no
  browser decoder required;
- walks the `data` chunk bucket by bucket without materialising a full Float32
  copy of the file;
- downsamples decoded PCM into bounded peak buckets (mono max-envelope);
- returns compact, transferable peak data; never returns raw PCM.

Non-WAV codecs are decoded on the main thread with
`AudioContext.decodeAudioData()` (size/memory bounded), then the decoded
channels are shipped to the worker for peak reduction.

`src/waveform/waveformWorkerClient.ts` creates one short-lived Worker per
request. Cancelling terminates that worker, so CPU-bound work stops instead of
waiting for a message a busy worker cannot process, and one slot can never
strand the other. The reply `MessagePort` is explicitly started before the
request is posted; without that, queued replies are silently dropped.

WebCodecs/`AudioDecoder` is optional and not assumed available; the subsystem
feature-detects and falls back. No FFmpeg/WASM is used.

## Cancellation and stale results

Each slot has a `fileGeneration` counter that increments on replace/remove.
Every analysis request carries `requestId` + `fileGeneration`. On worker
result, the service compares generation before committing peaks; stale results
are silently discarded. `dispose()` cancels active work and releases references.

## States (`src/waveform/waveformService.ts`)

| State       | Meaning                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- |
| waiting     | No file selected.                                                                                   |
| preparing   | File loaded for playback; analysis pending.                                                         |
| ready       | Real peaks generated and drawn.                                                                     |
| fallback    | Analysis intentionally skipped (size/memory/capability); normal timeline seeking remains available. |
| unavailable | Analysis failed; playback may still work.                                                           |

The UI never displays fabricated or decorative peaks when analysis is
unavailable. Playback remains available throughout.

## Privacy

- Waveform peaks are derived from local files only.
- Nothing is uploaded, persisted to browser storage, or sent to a server.
- Object URLs and waveform buffers are released on replace/remove/dispose.
- Theme remains the only persisted application setting.

## Renderer (`src/components/waveform/WaveformCanvas.tsx`)

- Canvas (not thousands of DOM nodes), drawn from downsampled peaks only.
  Redraws happen when peaks, dimensions, colour or active state change — not
  on every animation frame.
- `WaveformCanvas` draws a symmetric peak envelope (mirrored around the lane
  centre) on Canvas 2D at device-pixel resolution.
- `devicePixelRatio` is used for crisp output; canvas dimensions are capped.
- The playhead is a separate DOM overlay moved imperatively from the engine's
  time subscription, so playback does not force a React render at 60 Hz.
- A/B are identified with visible labels, not colour alone.
- Theme colours are resolved from CSS custom properties through a probe
  element, so both themes redraw with the correct ink.
- A `ResizeObserver` handles container changes and a `MutationObserver` on the
  root `data-theme` attribute handles theme changes.
- Each lane clips to the shared common duration (`sharedFraction`), so a longer
  recording is stretched to the same window instead of showing a mismatched
  axis.
- `data-ready="true"` is set only when real peaks are present; E2E asserts on it.

## Tests

- Unit: `src/waveform/wavParser.test.ts` — RIFF chunk scanning, 8/16/24/32-bit
  PCM and float decoding, EXTENSIBLE unwrap, truncation, header preflight.
- Unit: `src/waveform/peakExtraction.test.ts` — downsampling edge cases.
- Unit: `src/waveform/waveformBudget.test.ts` — resource policy.
- Unit: `src/waveform/waveformService.test.ts` — lifecycle, cancellation, stale results, fallback.
- Unit: `src/waveform/waveformWorkerClient.test.ts` — reply-port start,
  termination, cancellation and worker errors.
- Unit: `src/components/waveform/sharedFraction.test.ts` — common-duration clipping.
- Component: `src/components/waveform/ComparisonWaveform.test.tsx` — ready/fallback/preparing/unavailable rendering.
- E2E: A/B labels, real non-empty canvas pixels, 50 %/25 %/70 % shared-axis
  seek, mismatch clipping to the common duration, playhead sync, fallback with
  audio still usable, and reduced motion.
