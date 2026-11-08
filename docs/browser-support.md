# Browser support and verification

Last updated: 2026-11-08.

This page records what was actually tested. It does not label an untested browser, device or codec as supported.

## Test environment

| Item               | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Host OS            | Windows 11 Pro, build 10.0.26300                                     |
| Node.js            | 26.13.0 used for local verification; CI targets Node 24 via `.nvmrc` |
| npm                | 11.20.0                                                              |
| Playwright         | 1.65.0                                                               |
| Chromium build     | Chrome for Testing 158.0.8127.18                                     |
| Firefox build      | Firefox 159.0                                                        |
| WebKit build       | WebKit 27.2                                                          |
| Automated fixtures | Generated PCM WAV tones and failure fixtures, 44.1 kHz mono 16-bit   |

Playwright's Chromium and WebKit are test builds, not branded Chrome/Edge or Safari. Results below describe those engine builds on this Windows host.

## Automated end-to-end results

`npm run test:e2e` (Chromium gate): **15 passed**.

`npx playwright test --project=firefox --workers=4`: **15 passed**.

`npx playwright test --project=webkit --workers=3`: **4 passed, 11 skipped**.

| Area                                                             | Chromium | Firefox | WebKit      |
| ---------------------------------------------------------------- | -------- | ------- | ----------- |
| Empty state, privacy statement, disabled transport               | Pass     | Pass    | Pass        |
| Load two WAV files, metadata and shared duration                 | Pass     | Pass    | Skipped\*   |
| Play, switch at nonzero time, sampled gain crossfade both ways   | Pass     | Pass    | Skipped\*   |
| Pause, stop the playhead, seek both decks, resume                | Pass     | Pass    | Skipped\*   |
| Empty file, unsupported extension, corrupt `.mp3` load           | Pass     | Pass    | Pass        |
| Duration mismatch, shorter common duration and notice            | Pass     | Pass    | Skipped\*   |
| Replace while ready, remove while playing, return to incomplete  | Pass     | Pass    | Skipped\*   |
| End at common duration and replay from zero                      | Pass     | Pass    | Skipped\*   |
| No uploads, no third-party requests, no storage before theme use | Pass     | Pass    | Skipped\*   |
| System / Dark / Light, live system changes, reload persistence   | Pass     | Pass    | Pass        |
| 360 px mobile layout, no horizontal overflow, usable controls    | Pass     | Pass    | Skipped\*   |
| 1440 px two-column layout                                        | Pass     | Pass    | Pass        |
| Reduced motion keeps the core workflow usable                    | Pass     | Pass    | Skipped\*   |
| Keyboard playback, A/B, volume, mute; visible focus              | Pass     | Pass    | Skipped\*   |
| Skip link and logical tab order                                  | Pass     | Pass    | Skipped\*\* |

\* Playwright WebKit 27.2 on Windows reports WAV support through `canPlayType`, but local media never produces metadata or an error in this environment. The audio-flow specs skip with an explicit message on Windows rather than pretending to pass. Capture and format decoding must be verified in branded Safari.

\*\* This WebKit build omits links from the default Tab order (the Safari "Full Keyboard Access" behaviour). The keyboard spec detects that and skips with a message after verifying focus handling cannot be observed.

Unit/component suite: **76 tests passed** (Vitest).

## Format support

Switchroom accepts `.wav`, `.mp3`, `.flac`, `.aac` and `.m4a` for local playback. Acceptance is not a decode guarantee.

| Format    | Automated verification                                            | Manual verification            |
| --------- | ----------------------------------------------------------------- | ------------------------------ |
| WAV (PCM) | Loaded and played in Chromium and Firefox with generated fixtures | Edge on Windows 11, 2026-11-08 |
| MP3       | Validation/error paths only; no decodable MP3 fixture             | Not yet                        |
| FLAC      | Validation/error paths only                                       | Not yet                        |
| AAC       | Validation/error paths only                                       | Not yet                        |
| M4A       | Validation/error paths only; container may hold AAC or ALAC       | Not yet                        |

The automated suite deliberately generates WAV because it is dependency-free and deterministic. Codec support beyond PCM WAV remains a manual release check. Do not describe MP3/FLAC/AAC/M4A as verified until that check is recorded here.

## Manual browser checks

| Browser / device                   | Status     | Notes                                                                              |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| Chromium 158 (Playwright), Windows | Automated  | Full workflow, WAV, Web Audio gain automation, keyboard, themes, 360/1440 layouts. |
| Firefox 159 (Playwright), Windows  | Automated  | Full workflow and WAV playback.                                                    |
| WebKit 27.2 (Playwright), Windows  | Partial    | UI, validation, themes and layouts pass; local audio decode unavailable.           |
| Google Chrome desktop (current)    | Not tested | Needs a manual pass.                                                               |
| Microsoft Edge desktop (current)   | Manual     | Listening pass on the public deployment, Windows 11, WAV; no audible issues.       |
| Firefox desktop (branded, current) | Not tested | Engine build above is not the branded UI.                                          |
| Safari macOS (current)             | Not tested | AudioContext gesture activation and codec behaviour need a real check.             |
| Safari iOS (current)               | Not tested | Touch file selection and audio activation need a real device.                      |
| Chrome Android (current)           | Not tested | Touch and interruption recovery need a real device.                                |

## Manual listening checklist

**Status: completed 2026-11-08.** Automated tests prove that gain automation is scheduled, that sampled gains pass through intermediate values, and that the playhead does not reset. They cannot prove that a human hears a pleasant, click-free transition, so this pass was performed by the project owner against the public deployment.

- [x] Use real speakers or headphones in at least one desktop browser.
- [x] Load two closely related recordings (ideally a real Original/Edited pair supplied locally; never commit that pair).
- [x] Start on Original and switch to Edited during continuous playback.
- [x] Switch back and forth repeatedly.
- [x] Listen for clicks, pops, gaps, sudden loudness boosts and dropouts.
- [x] Confirm there is no audible restart or jump in the programme material.
- [x] Pause during a crossfade, resume, and switch again.
- [x] Confirm the level stays constant when switching between files with the same signal level.
- [x] Record the browser, OS, file format and observations here.

**Record:** Microsoft Edge (default browser) on Windows 11 Pro, public deployment at <https://switchroom.ftallfettah.workers.dev>, WAV files. The tester reported no audible clicks, pops, gaps, loudness jumps or dropouts across repeated switches, including pause and resume during a crossfade. The output device was not recorded and the pair's relative levels were not independently measured; the result is a subjective listening check, not a laboratory measurement.

## Known browser and platform limitations

- **AAC/M4A:** support depends on the platform codec and the codec inside the container. A successful file selection does not guarantee decoding.
- **Safari/iOS:** Web Audio must be created or resumed from the Play gesture. The engine is designed for this, but a real device check is outstanding.
- **Background tabs:** Chrome may throttle media or animation-frame updates in background tabs; continuity after returning to the tab has not been manually checked.
- **Playwright WebKit on Windows:** no local audio decode in this environment; do not treat skipped audio flows as coverage.
- **Mobile layout:** 360 px is verified in a desktop browser viewport. Real touch targets, on-screen keyboards and mobile browser chrome are not.
- **Large files:** only metadata is read before playback, but the browser's decode and memory behaviour for very large files has not been profiled.
- **Loudness:** no normalization. A crossfade between files with different levels will change perceived loudness.
- **Cross-browser codecs:** a file that plays in one browser may fail in another. The slot error explains which file failed and leaves the other slot usable.
