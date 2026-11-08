# Changelog

All notable changes to Switchroom are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.1.0
