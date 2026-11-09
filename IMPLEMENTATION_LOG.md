# v0.3 Implementation Log — COMPLETE

Baseline (v0.2.0, commit b6d2663): format:check, lint, typecheck, 116 Vitest tests and
build all passed.

All phases complete:

- Phase 0: baseline audit (DONE)
- Phase 1: PlayerSurface grid layout, fixed play-button geometry, stable copy (DONE)
- Phase 2: shared range-control system applied to timeline/volume/crossfade; crossfade scale markers (DONE)
- Phase 3: src/waveform/ — waveformTypes, peakExtraction, waveformBudget, wavParser,
  waveformWorker, waveformWorkerClient, waveformService (DONE)
- Phase 4: WaveformCanvas, ComparisonWaveform, wired WaveformService into
  ComparisonWorkspace + AudioFileSlot, waveform CSS (DONE)
- Phase 5: Reveal motion component, TopBar/footer/workspace/slot entrance reveals, slot stagger (DONE)
- Phase 6: responsive/visual cohesion, theme tokens for waveform + range controls (DONE)
- Phase 7: tests (DONE)
- Phase 8: README, CHANGELOG, docs, screenshots, preview smoke, deploy, tag (DONE)

## Post-review defect pass

A browser review of the built app found two real defects that unit tests had not
caught. Both are fixed and now covered by a strengthened E2E pixel assertion and
a new unit test:

1. **Waveform replies were dropped.** `waveformWorkerClient` registered
   `addEventListener('message')` on the reply `MessagePort` without calling
   `start()`. A port with only an event listener never begins delivering queued
   messages, so every analysis stayed in "Preparing waveform…". Fixed with an
   explicit `port.start()`; guarded by `waveformWorkerClient.test.ts`.
2. **Peaks arrived as an `ArrayBuffer`, not a `Float32Array`.** The worker posted
   `peaks.buffer` while the client treated the value as a typed array. The
   renderer therefore saw `undefined` lengths and drew only the faint
   centreline. The worker now posts the typed array and transfers its buffer.
   The E2E test was too weak (any non-zero alpha counted as ink); it now requires
   > 20 % canvas coverage and a >12 px tall column, which fails on a centreline.

Also fixed during the pass:

- Slider fill/thumb alignment is now asserted by DOM measurement at 0/50/100 %.
- E2E-17 polls briefly for deck convergence instead of asserting on one frame
  (Firefox-only flake in the release gate).
- Stale `.playwright-mcp/` and baseline screenshot artifacts were removed and
  ignored; `.gitignore` gained `.playwright-mcp`.
- The smoke check now verifies the footer version and real waveform ink.

## Verification (final)

- `format:check`, `lint`, `typecheck`: pass.
- Vitest: **179 tests across 14 files** pass.
- Playwright: **34 Chromium**, **34 Firefox** pass. WebKit on Windows: 5 pass,
  29 audio-dependent specs skip with an explicit message.
- Production build passes; the worker emits a separate
  `waveformWorker-*.js` chunk.
- Preview smoke passes through the Workers runtime.
- Public deploy: version `eaaca848-40a7-4e07-9ee9-90fabb62b7b9` at
  <https://switchroom.ftallfettah.workers.dev>.
- Public smoke passes against that URL, including both waveform lanes painting.

Exclusions enforced: no accounts/cloud/persistence/sharing/analytics; no FFmpeg/WASM;
no second playhead; peaks never uploaded; waveform never blocks Play; v0.4+ features
not added.
