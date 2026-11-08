# Changelog

All notable changes to Switchroom are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] — Unreleased

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

### Known limitations

- Public Cloudflare deployment, the `v0.1.0` Git tag and GitHub release notes are pending. This changelog will move out of “Unreleased” only after the deployed site passes its smoke test.
- A human listening pass with real speakers or headphones has not been completed.
- Automated format coverage uses PCM WAV fixtures; MP3, FLAC, AAC and M4A decode behaviour still needs manual verification.
- Branded Safari, Edge, Chrome Android and Safari iOS are untested.
- Playwright WebKit on Windows cannot decode local audio in the test environment, so its audio flows are skipped.
- No waveforms, persistent library, sharing, accounts or server processing; these are deliberate v0.1 exclusions.

[0.1.0]: https://github.com/Fettah010/switchroom/releases/tag/v0.1.0
