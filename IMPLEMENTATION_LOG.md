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
- Vitest: **185 tests across 14 files** pass.
- Playwright: **34 Chromium**, **34 Firefox** pass. WebKit on Windows: 5 pass,
  29 audio-dependent specs skip with an explicit message.
- Production build passes; the worker emits a separate
  `waveformWorker-*.js` chunk.
- Preview smoke passes through the Workers runtime.
- Public deploy: version `e31cbcbf-6c57-4243-bab8-9141548b2b76` at
  <https://switchroom.ftallfettah.workers.dev>.
- Public smoke passes against that URL, including both waveform lanes painting.

Exclusions enforced: no accounts/cloud/persistence/sharing/analytics; no FFmpeg/WASM;
no second playhead; peaks never uploaded; waveform never blocks Play; v0.4+ features
not added.

## Post-release defect pass: full-length WAVs fell back

A user report showed 62 MB and 93 MB / 5:37 WAVs rendering as a blank plot with the
progress tint filling it. The files were valid and playable; the waveform budget
rejected them before analysis:

1. The generic 60 MB encoded ceiling rejected both files.
2. The pre-header `fileSize * 4` estimate treated a 62–93 MB WAV as 248–372 MB of
   decoded Float32, exceeding the 240 MB decoded ceiling.
3. The WAV header preflight then hit the same 60 MB ceiling again.

WAV is parsed directly by the worker and never expanded into a full Float32 copy,
so the decoded estimate does not apply to it. `selectBudget` now separates the two
paths:

- direct-read WAV: 256 MB source ceiling (128 MB on ≤ 4 GB devices), duration
  ceiling only, no decoded-PCM estimate;
- compressed/unknown formats: 32 MB encoded ceiling (12 MB low-memory), decoded-PCM
  estimate with the 2× analysis-copy factor, and the duration ceiling.

The fallback UI was also made intentional: lanes without peaks render a visible
centreline (`data-placeholder`) and the progress tint is hidden when neither lane
has peaks, so a skipped preview no longer looks like an empty plot being filled.

Verified in Chromium with generated 62 MB 16-bit and 93 MB 24-bit 5:37 WAVs: both
decks reached Ready, both canvases reported `data-ready="true"`, and each lane drew
67.8 % ink coverage with a 38 px tall column. A new E2E case uses a valid 31-minute
8 kHz WAV to exercise the duration fallback with both decks ready, asserting the
centreline, hidden progress tint and usable Play button.

Gate after the fix: `format:check`, `lint`, `typecheck`, 185 Vitest tests, 34
Chromium and 34 Firefox Playwright specs, WebKit 5 pass / 29 skip, production build,
preview smoke and public smoke all pass.

## v0.4 Implementation Log — COMPLETE

- Added local-only workspace management in IndexedDB (`idb-keyval`).
- JSON manifest export/import (`.switchroom.json`) with strict schema validation.
- Four presentation layouts (standard, player-focused, waveform-focused, compact-review).
- Client presentation preview mode with read-only controls and local privacy reminder.
- Settings modal for default preferences, layout selection, and emergency local data clear.
- Re-linking UI for local file handles on workspace reload.
- Zero network requests, zero remote persistence.
- Verified with 230 unit tests and 40 Chromium / Firefox E2E specs.

## v0.5.0 Implementation Log — COMPLETE

- Private cloud projects with direct Cloudflare R2 presigned PUT/GET uploads.
- Cloudflare Workers + Hono API routes (`/api/projects`, `/api/uploads`, `/api/assets`, `/api/auth`).
- Optional creator authentication via Better Auth (D1 / SQLite adapter, GitHub & Google OAuth).
- Anonymous guest workflows with cryptographically secure capability recovery URLs (`#owner=...&project=...`).
- Zero proxying of audio data through the Worker; bytes transfer direct from client browser to R2.
- Local storage only holds opaque project IDs and titles; raw capability secrets are never persisted in localStorage or D1.
- Strict upload quotas (100 MB max per file, 1–90 days retention, 2 assets per project).
- Local-first architecture preserved: 100% functional offline without cloud or login.
- Verified with 242 unit tests, 45 Chromium Playwright specs, 45 Firefox Playwright specs, and 0 lint/typecheck errors.

## v0.6.0 Implementation Log — COMPLETE

- Client sharing system with public, unlisted, and private invite links.
- Short-lived R2 presigned playback URLs (5-minute target) issued via authorization checks.
- Guest review page (`/review/<token>`) featuring focused synchronized player without account requirements.
- Revocation and expiry lifecycles with immediate server-side state enforcement.
- Data-preserving D1 migration `0002_client_sharing.sql`.
- Verified with 255 Vitest tests and 48 Chromium E2E specs.

## v0.7.0 Implementation Log — COMPLETE

- Client Feedback & Preferred-Version Voting:
  - Original vs Edited toggle votes with aggregated totals and participant identity cookies (`switchroom_partic_<id>`).
  - Timeline-pinned timestamped comments seeking player directly without interrupting or restarting playback.
  - Single-level threaded replies with clear `Creator` role badges.
  - Creator moderation and author soft deletion (`deleted_at`), retaining thread structure.
  - Project-level `feedback_enabled` toggle and server-side authorization enforcement.
- Creator Dashboard Metrics & Storage Display:
  - Preferred vote counts and total comments displayed on cloud project cards with expandable comments drawer.
  - Storage quota meter banner visualizing committed + reserved bytes against account (2 GB) and guest (300 MB) limits.
- Resumable Direct-to-R2 Multipart Uploads:
  - Dynamic strategy threshold ($\ge 50\text{ MB}$) for chunked multipart uploads with zero audio byte Worker proxying.
  - Bounded concurrency pool (3 chunks) with exponential backoff retry and real byte-level progress reporting.
  - In-flight storage quota reservation accounting against project/user and aggregate Switchroom R2 budget (8 GB ceiling).
  - Pause, resume, cancel, and abort lifecycle with verified server-side R2 object completion.
- Verified with 275 Vitest tests across 30 files, 53 Playwright E2E tests, clean typecheck, and clean ESLint.
