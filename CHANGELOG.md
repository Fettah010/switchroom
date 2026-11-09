# Changelog

All notable changes to Switchroom are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.2.0
[0.1.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.1.0
