# Browser support and verification

Last updated: 2026-11-14.

This page records what was actually tested. It does not label an untested browser, device or codec as supported.

## Test environment

| Item               | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Host OS            | Windows 11 Pro, build 10.0.26300                                     |
| Node.js            | 26.13.1 used for local verification; CI targets Node 24 via `.nvmrc` |
| npm                | 11.20.0                                                              |
| Playwright         | 1.58.0+                                                              |
| Chromium build     | Chrome for Testing 158.0.8127.18                                     |
| Firefox build      | Firefox 159.0                                                        |
| WebKit build       | WebKit 27.2                                                          |
| Automated fixtures | Generated PCM WAV tones and failure fixtures, 44.1 kHz mono 16-bit   |

Playwright's Chromium and WebKit are test builds, not branded Chrome/Edge or Safari. Results below describe those engine builds on this Windows host.

## Automated end-to-end results (v0.4.0)

`npm run test:e2e` (Chromium gate): **40 passed**.

`npx playwright test --project=firefox --workers=4`: **40 passed**.

`npx playwright test --project=webkit --workers=3`: **5 passed, 35 skipped**.

| Area                                                              | Chromium | Firefox | WebKit      |
| ----------------------------------------------------------------- | -------- | ------- | ----------- |
| Empty state, privacy statement, disabled transport                | Pass     | Pass    | Pass        |
| Load two WAV files, metadata and shared duration                  | Pass     | Pass    | Skipped\*   |
| Play, switch at nonzero time, sampled gain crossfade both ways    | Pass     | Pass    | Skipped\*   |
| Pause, stop the playhead, seek both decks, resume                 | Pass     | Pass    | Skipped\*   |
| Empty file, unsupported extension, corrupt `.mp3` load            | Pass     | Pass    | Pass        |
| Duration mismatch, shorter common duration and notice             | Pass     | Pass    | Skipped\*   |
| Replace while ready, remove while playing, return to incomplete   | Pass     | Pass    | Skipped\*   |
| End at common duration and replay from zero                       | Pass     | Pass    | Skipped\*   |
| No uploads, no third-party requests, no storage before theme use  | Pass     | Pass    | Skipped\*   |
| Repeated Play clicks during startup produce one start             | Pass     | Pass    | Skipped\*   |
| Rapid A/B reversal keeps the latest request and valid gains       | Pass     | Pass    | Skipped\*   |
| Seek while playing keeps both decks converged                     | Pass     | Pass    | Skipped\*   |
| Pause during a fade settles on the target deck                    | Pass     | Pass    | Skipped\*   |
| Suspend the AudioContext and recover with an explicit Play        | Pass     | Pass    | Skipped\*   |
| Supported extension with a generic MIME type                      | Pass     | Pass    | Skipped\*   |
| Repeated replace/remove cycles leave no stale UI                  | Pass     | Pass    | Skipped\*   |
| Change the crossfade duration without restarting playback         | Pass     | Pass    | Skipped\*   |
| System / Dark / Light, live system changes, reload persistence    | Pass     | Pass    | Pass        |
| 360 px mobile layout, no horizontal overflow, usable controls     | Pass     | Pass    | Skipped\*   |
| 1440 px two-column layout                                         | Pass     | Pass    | Pass        |
| Long filenames and errors contained at 360 px                     | Pass     | Pass    | Skipped\*   |
| Reduced motion keeps the core workflow usable                     | Pass     | Pass    | Skipped\*   |
| Keyboard playback, A/B, volume, mute and crossfade; visible focus | Pass     | Pass    | Skipped\*   |
| Skip link and logical tab order                                   | Pass     | Pass    | Skipped\*\* |

\* Playwright WebKit 27.2 on Windows reports WAV support through `canPlayType`, but local media never produces metadata or an error in this environment. The audio-flow specs skip with an explicit message on Windows rather than pretending to pass. Capture and format decoding must be verified in branded Safari.

\*\* This WebKit build omits links from the default Tab order (the Safari "Full Keyboard Access" behaviour). The keyboard spec detects that and skips with a message.

### v0.4 additions to the matrix

| Area                                                                         | Chromium | Firefox |
| ---------------------------------------------------------------------------- | -------- | ------- |
| Home view launchpad & empty state with New comparison creation               | Pass     | Pass    |
| Workspace metadata editing (title, desc, notes, labels) & IndexedDB save     | Pass     | Pass    |
| Reopen workspace and truthful relinking notice with file descriptor match    | Pass     | Pass    |
| 4 Presentation layout switches (`standard`, `player`, `waveform`, `compact`) | Pass     | Pass    |
| Client preview mode entrance and exit with local-only banner                 | Pass     | Pass    |
| Portable manifest export (`.switchroom.json`) with zero binary payloads      | Pass     | Pass    |
| Settings dialog (theme, motion, default crossfade, default layout, clear)    | Pass     | Pass    |
| Assert zero private data or audio payloads leave the browser                 | Pass     | Pass    |

Unit/component suite: **223 tests passed** (Vitest, 21 files).

The v0.3.0 production build passed the automated preview smoke check and then the same check against the public deployment at <https://switchroom.ftallfettah.workers.dev> (version `e31cbcbf-6c57-4243-bab8-9141548b2b76`). That check verifies the production title, privacy statement, absence of the development hook, footer version, local WAV loading, duration, both waveform lanes reaching ready and painting real ink, playback progress, A/B switching and pause state. It does not replace a human listening pass.

### Async cases covered deterministically instead of in a real browser

Five plan scenarios depend on holding a browser promise or timer open at an exact moment. They are covered by deterministic Vitest engine/component tests rather than a Playwright spec, because the fake host can pause and resume those operations precisely:

| Scenario                                        | Deterministic coverage                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| E2E-13 Pause during startup                     | “pause during startup cancels the pending start”                                  |
| E2E-14 Replace a file during startup            | “replacing a file during startup supersedes the old start”                        |
| E2E-15 Remove a file during startup             | “removing a file during startup leaves the player incomplete”                     |
| E2E-20 Metadata duration becomes available late | “waits for a late duration instead of failing the first metadata event”           |
| E2E-21 Metadata timeout                         | “fails a never-loading file after the metadata timeout” and the slot timeout test |

The remaining v0.2 scenarios run against real media elements and Web Audio in Chromium and Firefox.

## Format support

Switchroom accepts `.wav`, `.mp3`, `.flac`, `.aac` and `.m4a` for local playback. Acceptance is not a decode guarantee. v0.3 also tolerates a blank or generic MIME type when the extension is supported, while still rejecting unsupported extensions. Waveform analysis parses PCM WAV directly and uses the browser decoder for compressed formats.

| Format    | Automated verification                                            | Manual verification            |
| --------- | ----------------------------------------------------------------- | ------------------------------ |
| WAV (PCM) | Loaded and played in Chromium and Firefox with generated fixtures | Edge on Windows 11, 2026-11-08 |
| MP3       | Validation/error paths only; no decodable MP3 fixture             | Not yet                        |
| FLAC      | Validation/error paths only                                       | Not yet                        |
| AAC       | Validation/error paths only                                       | Not yet                        |
| M4A       | Validation/error paths only; container may hold AAC or ALAC       | Not yet                        |

The automated suite deliberately generates WAV because it is dependency-free and deterministic. Codec support beyond PCM WAV remains a manual release check. Do not describe MP3/FLAC/AAC/M4A as verified until that check is recorded here.

## Manual browser checks

| Browser / device                   | Status     | Notes                                                                                        |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Chromium 158 (Playwright), Windows | Automated  | Full 34-spec workflow, WAV, Web Audio gain automation, waveforms, keyboard, themes, layouts. |
| Firefox 159 (Playwright), Windows  | Automated  | Full 34-spec workflow, WAV playback and waveform rendering.                                  |
| WebKit 27.2 (Playwright), Windows  | Partial    | 5 UI/validation/theme/layout specs pass; 29 audio-dependent specs skip.                      |
| Google Chrome desktop (current)    | Not tested | Needs a manual pass.                                                                         |
| Microsoft Edge desktop (current)   | Manual     | v0.1.0 listening pass only, Windows 11, WAV; no audible issues reported then.                |
| Firefox desktop (branded, current) | Not tested | Engine build above is not the branded UI.                                                    |
| Safari macOS (current)             | Not tested | AudioContext gesture activation and codec behaviour need a real check.                       |
| Safari iOS (current)               | Not tested | Touch file selection and audio activation need a real device.                                |
| Chrome Android (current)           | Not tested | Touch and interruption recovery need a real device.                                          |

## Manual listening record

**Status: no v0.2.0 or v0.3.0 listening pass has been performed.** The only recorded human listening session is from v0.1.0, before the crossfade duration control, interruption recovery and waveforms existed. Automated tests prove that gain automation is scheduled, that sampled gains pass through intermediate values, that the playhead is preserved across seek/switch/interruption, and that the crossfade duration affects the scheduled ramp. They cannot prove that a human hears a pleasant, click-free transition at every duration or on every output device.

### v0.1.0 record — completed 2026-11-08

Microsoft Edge (default browser) on Windows 11 Pro, public deployment at <https://switchroom.ftallfettah.workers.dev>, WAV files. The tester reported no audible clicks, pops, gaps, loudness jumps or dropouts across repeated switches, including pause and resume during a crossfade. The output device was not recorded and the pair's relative levels were not independently measured; the result is a subjective listening check, not a laboratory measurement.

### Outstanding v0.3.0 checklist

- [ ] Listen to the 80 ms, 180 ms and 600 ms settings in a branded desktop browser.
- [ ] Load a WAV pair and a compressed-format pair and confirm both waveform lanes render or fail honestly.
- [ ] Switch repeatedly in both directions and listen for clicks, pops, gaps or loudness jumps.
- [ ] Change the duration during a fade and confirm the current fade is not disturbed.
- [ ] Suspend audio (for example by switching output devices or backgrounding the tab) and confirm the interruption message and explicit Play recovery.
- [ ] Seek while playing and while paused, then switch, and confirm the programme does not restart.
- [ ] Repeat with MP3, FLAC, AAC and M4A files.
- [ ] Record the browser, OS, output device, file formats and observations here.

## Known browser and platform limitations

- **AAC/M4A:** support depends on the platform codec and the codec inside the container. A successful file selection does not guarantee decoding.
- **Safari/iOS:** Web Audio must be created or resumed from the Play gesture. The engine is designed for this, but a real device check is outstanding.
- **Background tabs:** Chrome may throttle media or animation-frame updates in background tabs. The engine preserves the playhead and republishes it on return, but real background-audio continuity has not been manually checked.
- **Playwright WebKit on Windows:** no local audio decode in this environment; do not treat skipped audio flows as coverage.
- **Mobile layout:** 360 px is verified in a desktop browser viewport. Real touch targets, on-screen keyboards and mobile browser chrome are not.
- **Large files:** only metadata is read before playback, but the browser's decode and memory behaviour for very large files has not been profiled.
- **Loudness:** no normalization. A crossfade between files with different levels will change perceived loudness.
- **Cross-browser codecs:** a file that plays in one browser may fail in another. The slot error explains which file failed and leaves the other slot usable.
