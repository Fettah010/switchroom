# Changelog

All notable changes to Switchroom are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-11-14

### Added

- **Local workspaces:** persistent comparison metadata in IndexedDB (`switchroom-local`, version 1) across browser sessions.
- **Home view & launchpad:** start new comparisons, import portable manifests, and view recent saved comparisons with card actions (open, export manifest, delete).
- **Metadata editor:** inline comparison title editing, collapsible drawer for client review descriptions and engineering notes, and chip-based categorization labels.
- **Truthful relink workflow:** privacy-preserving session resumption without storing audio blobs. On reopening or page reload, metadata and settings are remembered, accompanied by a clear notice displaying expected file descriptors.
- **Portable JSON manifest (`.switchroom.json`) import and export:** single-file export and import for sharing session configurations and notes across machines without passing audio files or using cloud accounts.
- **4 Presentation layouts:** `standard` (balanced player and waveforms), `player-focused` (dominant transport and switch controls), `waveform-focused` (deep multi-lane waveform timeline), and `compact-review` (dense review layout).
- **Local client preview mode:** distraction-free read-only presentation view featuring a clear "Local presentation preview — audio stays on this device" banner and a single-click exit button.
- **Settings modal:** manage theme mode, interface motion preferences, default crossfade duration, default presentation layout, and clear local data with explicit confirmation.
- **Safe data isolation:** in-memory fallback adapter (`InMemoryWorkspaceRepository`) when IndexedDB is blocked or unavailable in private browsing containers.

### Improved

- App structure evolved to support multi-view SPA navigation (`home`, `editor`, `preview`) with instant client transitions.
- Responsive toolbar and metadata editor adapt seamlessly down to 360 px viewport width without horizontal overflow.
- File slots communicate saved descriptors and alert users when re-selected files do not match original recording names.
- Accessible dialog implementation for settings with Escape-key dismiss, backdrop click, and focus trapping.

### Fixed

- Resolved layout shifting and overflow on mobile devices by adding responsive icon-only controls and wrapped metadata actions.
- Dialog and modal backdrop stacking context properly isolated with relative positioning.
- Safe transactional IndexedDB lifecycle handling with version change and blocking listeners.

### Verified

- 223 Vitest unit/component tests passing across 21 test files.
- 40 Chromium Playwright specs passing; 40 Firefox Playwright specs passing.
- WebKit 27.2 on Windows: 5 specs pass, 35 audio-dependent specs skip with an explicit message.
- Full formatting, lint, strict type-check, production build, preview smoke check, and live production deployment smoke check pass.
- Verified zero network requests or audio data leakage during playback and session management.

### Known limitations

- Audio files must be reselected upon reload by design for local privacy. Switchroom never persists audio bytes in browser databases.
- The crossfade setting can be customized per workspace or set as default in settings, but loudness normalization remains outside scope.

## [0.3.0] — 2026-11-09

### Added

- Original and Edited waveform previews drawn on one shared time axis, with visible A/B labels and a shared playhead.
- Click/tap either waveform row to seek both decks through the existing canonical engine operation; the timeline slider seeks to the same canonical position.
- Downsampled, bounded peak generation (max 2400 buckets) in a Dedicated Worker where available; WAV parsed directly in the worker, other codecs decoded on the main thread then reduced.
- Bounded resource policy (256 MB direct-read WAV / 32 MB compressed-input / ~240 MB decoded-PCM ceilings on desktop, lower on ≤ 4 GB devices) with a designed fallback state for large or unsupported analysis files.
- Waveform lifecycle states: waiting, preparing, ready, fallback and unavailable; playback remains available throughout.
- Full-page entrance/reveal motion: header, workspace heading, both file slots (staggered), player and waveform, and footnote/footer; dropzone hover/focus/press/drag feedback.
- A shared custom range-control system for the timeline, master volume and crossfade sliders, replacing browser-default range styling.
- Stable Play/Pause button geometry and an intentional player grid so Play / Starting… / Pause and status-label changes do not move adjacent controls.

### Improved

- Player surface converted from unconstrained flex-wrap to an intentional responsive grid (transport left, version selector right, timeline full-width, bottom controls in stable columns).
- Volume, crossfade and timeline sliders share one visual language with visible progress, focus rings and theme-appropriate rail/thumb/fill.
- Crossfade slider gained min/default/max scale markers (80 / 180 / 600 ms) and an `aria-valuetext` in milliseconds.
- Dropzones reveal with a short stagger and show hover, focus, press and drag-over states.
- Waveform peaks reveal smoothly once real data is ready; the playhead advances during playback without redrawing every peak.

### Fixed

- Waveform analysis no longer stalls in "Preparing waveform…": the worker's reply `MessagePort` is now explicitly started, so results are delivered.
- Full-length WAVs no longer fall back to a blank timeline: direct-read WAV now uses its own 256 MB source ceiling and is not charged the decoded-Float32 estimate, so ordinary 60–100 MB songs render real waves.
- A skipped waveform now shows a visible centreline and no misleading progress tint, so a fallback lane reads as intentionally flat rather than broken.
- Play button and surrounding controls no longer jitter or shift when the transport label changes between Play / Starting… / Pause / switching.
- Status text no longer pushes sliders around; the status area has a reserved height.
- Timeline, volume and crossfade fills now terminate exactly at the thumb centre at 0 %, 50 % and 100 %, verified by DOM measurement in Chromium and Firefox.
- Entrance reveals now trigger when their section enters the viewport instead of staying hidden.

### Verified

- 185 Vitest unit/component tests pass across 14 files, including WAV parser, worker client, resource budget, service lifecycle, shared-fraction and waveform-UI coverage.
- 34 Chromium Playwright specs pass; 34 Firefox Playwright specs pass.
- WebKit 27.2 on Windows: 5 specs pass, 29 audio-dependent specs skip with an explicit message.
- Formatting, lint, strict type-check, production build, Workers-runtime preview and preview smoke check pass.
- The development diagnostic hook remains absent from the production build; no audio, peaks or metadata leave the browser.
- Public deployment at <https://switchroom.ftallfettah.workers.dev> (version `e31cbcbf-6c57-4243-bab8-9141548b2b76`), smoke-tested against that URL on 2026-11-09, including both waveform lanes painting real ink and the footer reporting `v0.3.0`.

### Known limitations

- Waveform analysis supports common PCM WAV directly in the worker; other formats depend on the browser's decoder and may fall back to a plain timeline while playback still works.
- No human listening pass has been performed on the v0.3.0 build; the recorded listening session is from v0.1.0. MP3, FLAC, AAC and M4A decode/listening behaviour remains manually unverified; automated fixtures are PCM WAV.
- Branded Chrome, branded Safari, Chrome Android and Safari iOS remain manually unverified.
- The crossfade setting is session-only and is not persisted.
- No accounts, cloud storage, sharing, comments, persistent library or server processing; these remain deliberate exclusions.

## [0.2.0] — 2026-11-09

### Added

- Adjustable crossfade duration from 80 to 600 ms, with 180 ms as the default and a visible `n ms` readout.
- Truthful `starting`, `switching` and `interrupted` player states, an audible-version label, and a switching indicator on the target version.
- Operation generation tokens and cancellation so Pause, Replace, Remove and Dispose supersede stale asynchronous play/switch work.
- Bounded, cancellable metadata loading with a 15 s default timeout.
- Recovery path for AudioContext suspension/interruption: the interface stops claiming playback, says the browser interrupted audio, and resumes only on an explicit Play.
- Regression coverage for paused seeking, end-of-media pause events, rapid A/B reversals, seeks during alignment, fade interruption, generic MIME acceptance, repeated replace/remove cycles and crossfade duration changes.

### Improved

- Generic and blank MIME types are tolerated when the file extension is supported; `canPlayType` remains a warning hint rather than a decode guarantee.
- Paused seeking and post-seek `canplay` events no longer reset the playhead.
- End-of-media pause events are treated as a normal finish rather than a false interruption.
- A failed or removed active deck moves the selected/audible version to the surviving deck.
- Crossfade duration changes apply to the next switch while a fade in progress completes unchanged.
- Responsive transition-control layout and accessible error/status association remain usable at 360 px.

### Fixed

- Paused seeks no longer appear in the UI while the media elements stayed at zero.
- Firefox no longer reports a device interruption when playback reaches the common end.
- Late-resolving `play()` promises cannot leave media running after the user paused or replaced a file.
- Stale load and duration events cannot affect a replacement file.

### Verified

- 116 Vitest unit/component tests pass.
- 24 Chromium Playwright specs pass.
- 24 Firefox Playwright specs pass.
- WebKit 27.2 on Windows: 4 specs pass and 20 audio-dependent specs skip with an explicit message.
- Formatting, lint, strict type-check, production build, Workers-runtime preview and preview smoke check pass.
- The development diagnostic hook remains absent from the production build.
- Public deployment at <https://switchroom.ftallfettah.workers.dev>, smoke-tested on 2026-11-09.

### Known limitations

- No human listening pass has been performed on the v0.2.0 build or the new crossfade range; the recorded listening session is from v0.1.0.
- MP3, FLAC, AAC and M4A decode/listening behaviour remains manually unverified; automated fixtures are PCM WAV.
- Branded Chrome, branded Safari, Chrome Android and Safari iOS remain manually unverified.
- The crossfade setting is session-only and is not persisted.
- No waveforms, persistent library, sharing, accounts or server processing; these remain deliberate exclusions.

## [0.1.0] — 2026-11-08

### Added

- Local-first A/B comparison player with independent Original and Edited file slots.
- WAV, MP3, FLAC, AAC and M4A extension support for local playback, with browser-codec caveats surfaced in the interface.
- One shared transport and timeline across both decks, using the shorter common duration.
- Real 180 ms linear-amplitude Web Audio crossfade with ramp rebasing for interrupted switches.
- Deck synchronization before a switch, drift correction, end-of-playback handling and replay from the start.
- Master volume and mute, independent of the selected version.
- File name, size, format and duration metadata, plus loading, ready, error, incomplete and mismatch states.
- Replace, remove and drag-and-drop file handling with object URL cleanup and stale-load protection.
- System, Dark and Light themes with pre-paint application and theme-only persistence.
- Responsive 360–1440 px layouts, keyboard-operable controls, visible focus, a skip link, polite live status and reduced-motion support.
- A visible local-only privacy statement and a production build with no upload, storage, analytics or third-party audio SDK.
- Vitest unit/component suite, Playwright browser flows with generated fixtures, strict TypeScript, ESLint, Prettier and GitHub Actions CI.
- Documentation for the audio engine, decisions, local development, deployment, browser support and security.

### Deployment and verification

- Public deployment: <https://switchroom.ftallfettah.workers.dev>, smoke-tested on 2026-11-08.
- Manual listening pass completed in Microsoft Edge on Windows 11 with WAV files; no clicks, pops, gaps, loudness jumps or dropouts were reported.

### Known limitations

- MP3, FLAC, AAC and M4A decode and listening behaviour still need manual verification. Automated listening coverage uses PCM WAV.
- Branded Chrome, branded Safari, Chrome Android and Safari iOS remain untested.
- Playwright WebKit on Windows cannot decode local audio in the test environment, so its audio flows are skipped.
- No waveforms, persistent library, sharing, accounts or server processing; these are deliberate v0.1 exclusions.

[0.3.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.3.0
[0.2.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.2.0
[0.1.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.1.0
