# Switchroom v0.2.0 — Expanded Stabilization & Execution Plan

> **Document type:** Standalone, agent-ready implementation specification for the next release  
> **Release target:** `v0.2.0`  
> **Starting point:** Existing public `v0.1.0` release on `main`  
> **Application:** <https://switchroom.ftallfettah.workers.dev/>  
> **Repository:** <https://github.com/Fettah010/switchroom>  
> **License:** MIT  
> **Architecture:** Existing React + TypeScript + Vite SPA deployed with Cloudflare Workers Static Assets  
> **Research/audit date:** 9 November 2026  
> **Primary goal:** Make the existing local-only A/B player more reliable, predictable and polished without implementing features assigned to later milestones.

---

## 0. Instructions to the implementation agent

You are continuing an existing application. You are **not** starting a new project, replacing its architecture, or implementing the whole product roadmap.

Read this file together with the current repository documentation, inspect the current branch and running application, and then improve the implementation already present in `v0.1.0`.

### 0.1 Required operating behaviour

1. **Inspect before editing.** Read `README.md`, `CHANGELOG.md`, `docs/audio-engine.md`, `docs/browser-support.md`, `docs/decisions.md`, `docs/deployment.md`, the current tests, and the relevant implementation files.
2. **Use the live v0.1 application as the behavioural baseline.** Do not infer the UI exclusively from this document. Open the live site at the URL above and compare it with the repository source.
3. **Run the existing checks before making changes.** Record the actual baseline results. Do not state that a test passes unless you ran it or have a current CI result proving it.
4. **Preserve the existing stack.** Keep React, TypeScript, Vite, Motion for React, the Web Audio API, Vitest, Testing Library, Playwright and the existing Cloudflare deployment integration unless a specific verified defect requires a narrowly scoped change.
5. **Do not rewrite the audio engine simply to make it look different.** The existing framework-independent `ABAudioEngine` is a deliberate architectural strength. Fix and extend it incrementally.
6. **Work in small, reviewable slices.** Each phase must leave the app buildable and the current comparison workflow usable.
7. **Test every behaviour that is changed.** A UI-only fix still needs component/E2E coverage where applicable. An engine fix needs deterministic unit tests and browser-level coverage for the user-visible result.
8. **Keep all user audio local.** The audio files must remain in browser-managed local object URLs. No file bytes, filenames, metadata, playback activity or diagnostics may be sent to a server.
9. **Keep the app deployable throughout development.** Do not add an API, database, account system, remote storage, or service dependency.
10. **Do not overstate browser support.** Distinguish automated engine coverage, real-browser manual verification, and unverified platforms.
11. **Do not hide failed or skipped tests.** Report skipped WebKit media tests as skipped, not passed. Explain why a test is skipped and what manual verification remains necessary.
12. **Do not deploy or publish a release until the complete release gate passes.** Use the existing manual deployment flow unless the owner explicitly authorizes another deployment method.

### 0.2 Implementation-agent completion report

At the end, provide a concise report containing:

- Changes made, grouped by phase.
- Files created, edited and removed.
- Tests run and exact pass/fail/skip counts.
- Build, preview and smoke-check results.
- Browsers and devices manually tested, including versions and file formats.
- Known limitations that remain.
- Deployment URL and Git tag, only if deployment and publication actually succeeded.
- Any action that could not be completed because a physical browser/device, codec fixture, or credential was unavailable.

Do not claim that you personally listened to a transition unless you actually performed a human listening test through a physical or real browser audio output.

---

## 1. Existing application audit — source of truth

### 1.1 Current release state

The public repository contains a tagged `v0.1.0` release, and the live Cloudflare-hosted page identifies itself as Switchroom and describes a local-only A/B listening room. The inspected live page exposes:

- System, Dark and Light theme controls.
- Original (A) and Edited (B) local file slots.
- File picker and drag-and-drop entry points.
- One shared Play/Pause control and one shared timeline.
- Original/Edited version selection.
- Master volume and mute.
- File metadata and load states.
- A clear local-only privacy statement and a warning that files are temporary and are cleared on refresh/close.
- The source repository link and `v0.1.0` release label.

The site was inspected through the live page and the corresponding public repository. Playback with the user's own audio files was **not** independently exercised during this audit. The human listening pass recorded in the repository was performed by the project owner in Microsoft Edge on Windows 11 using WAV files.

### 1.2 v0.1 capabilities that already exist — do not rebuild them

The current application already has the following core behaviour:

| Area              | Existing v0.1 implementation                                                                 | v0.2 instruction                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | React 19 + TypeScript + Vite                                                                 | Preserve.                                                                                                                    |
| Hosting           | Cloudflare Workers Static Assets through the Vite plugin                                     | Preserve. No API Worker is required for this milestone.                                                                      |
| Audio engine      | Framework-independent `ABAudioEngine` with an injected audio host                            | Preserve the model; improve only where tests demonstrate a need.                                                             |
| Audio graph       | Two HTML media elements, two deck gain nodes and one master gain node                        | Preserve the two-deck design.                                                                                                |
| Switching         | Synchronized A/B selection with a real Web Audio gain ramp                                   | Harden timing and interrupted-switch behaviour.                                                                              |
| Crossfade         | 180 ms linear-amplitude transition                                                           | Keep 180 ms as the default; add a bounded user adjustment. Do not change the fade curve without measured listening evidence. |
| Timeline          | One canonical playhead; both decks seek together                                             | Strengthen race, seek and interruption tests.                                                                                |
| Duration mismatch | Shared duration is the shorter valid duration; a note explains the mismatch                  | Preserve. Add edge-case tests.                                                                                               |
| Transport         | Play, pause, seek, replay, end handling                                                      | Harden asynchronous state transitions.                                                                                       |
| Volume            | Master volume and mute                                                                       | Preserve and test during fades.                                                                                              |
| File intake       | WAV, MP3, FLAC, AAC and M4A extension acceptance; local object URLs                          | Improve MIME and metadata edge cases without promising universal codec support.                                              |
| File slot         | Name, extension, size, duration, loading/ready/error state, replace/remove, drag/drop        | Preserve and refine error feedback.                                                                                          |
| Privacy           | No API, no upload, no database, no analytics; audio remains local                            | Preserve and test.                                                                                                           |
| Persistence       | Only the explicit theme choice is stored in localStorage                                     | Preserve. Do not persist audio or project data in v0.2.                                                                      |
| Theme             | System/Dark/Light and saved manual override                                                  | Preserve; add regression coverage for system preference changes.                                                             |
| Visual design     | Editorial typography, atmospheric background, crossfade motif, restrained Motion transitions | Refine rather than redesign.                                                                                                 |
| Accessibility     | Native controls, skip link, focus ring, keyboard-operable controls, reduced-motion support   | Strengthen; do not add global hotkeys.                                                                                       |
| Test stack        | Vitest, Testing Library and Playwright                                                       | Extend the existing suites.                                                                                                  |

### 1.3 Existing verification record — treat as a reported baseline, not a new test run

The `v0.1.0` GitHub release and repository README report the following results:

- Format check, ESLint and strict TypeScript checks: passed.
- Vitest unit/component tests: 76 passed.
- Playwright Chromium: 15/15 passed.
- Playwright Firefox: 15/15 passed.
- Playwright WebKit on Windows: 4 passed and 11 skipped because the tested WebKit build could not decode local audio in that environment.
- Production build, Workers-runtime preview and public deployment smoke test: passed.
- Manual listening: Microsoft Edge on Windows 11 with WAV files; the owner reported no clicks, pops, gaps, loudness jumps or dropouts during repeated switching, including pause/resume during a fade.

The release notes also explicitly state that MP3, FLAC, AAC and M4A still need a manual listening/codec pass, and that branded Chrome, Safari macOS/iOS and Chrome Android have not been manually verified. v0.2 must close as many of these gaps as practical and must document any that remain.

### 1.4 Concrete implementation observations to investigate and address

These are findings from the current source, not claims that every one has already caused a user-visible failure.

#### A. Asynchronous play-start race

`ABAudioEngine.play()` awaits `AudioContext.resume()` and then awaits both media elements' `play()` promises. During that interval, the user can still replace/remove a file or issue another transport action. The current implementation has no dedicated play-operation generation/token guarding all post-`await` state writes. A stale `play()` continuation could potentially update state after a newer action has superseded it.

**v0.2 action:** Add explicit operation cancellation/sequence protection and deterministic tests for overlapping Play, Pause, Replace, Remove and Dispose actions.

#### B. Version label can move before the switch is audible

`switchTo()` updates `snapshot.activeVersion` and notifies subscribers before the target deck has completed any required alignment. The UI can therefore display the requested target as active while the engine is still waiting for alignment and has not yet scheduled the fade.

**v0.2 action:** Give the UI an honest switching state, or otherwise keep the active/audible label aligned with the actual transition state. Do not let the status text claim the target is already audible while a seek/alignment is still pending.

#### C. Context interruption and recovery need stronger coverage

The engine resumes a suspended context during `play()`, but the implementation does not currently subscribe to `AudioContext.statechange` and translate unexpected suspension/interruption into a clear transport state. This matters especially on mobile platforms and when audio hardware is taken by another application.

**v0.2 action:** Track context state, preserve the playhead on interruption, pause/reconcile both decks, explain the interruption, and require an intentional user gesture to resume when the browser requires one.

#### D. Metadata duration handling can be too eager

The current `loadedmetadata` handler fails the deck immediately when `duration` is not finite and positive. The `durationchange` handler only updates a deck that is already marked ready. That means a browser/container combination where duration becomes known after the first metadata event may not get a chance to recover.

**v0.2 action:** Treat unknown duration as pending while appropriate media events are still expected. Resolve readiness only when the duration is valid; fail with a useful message after an explicit timeout or a real media error.

#### E. MIME envelope validation may reject valid locally selected files

The current file validator accepts blank MIME types and `audio/*`, plus `video/mp4` for container compatibility, but rejects other reported MIME families. Some systems provide generic MIME information for otherwise valid audio files.

**v0.2 action:** Treat the filename extension and browser decoder as the primary path, treat generic/unknown MIME values as advisory rather than proof of invalid audio, and preserve clear rejection for unsupported extensions and zero-byte files. Do not trust an extension as proof that a file really contains playable audio.

#### F. File metadata loading has no explicit upper bound

The engine installs `loadedmetadata`, `durationchange` and `error` handlers, but no bounded fallback for a file that never reaches a terminal load state.

**v0.2 action:** Add a cancellable metadata/load timeout whose duration is chosen and documented from testing. A timeout must not fire after replace/remove/dispose, and must never affect a newer file generation.

#### G. Browser/codec and mobile verification is incomplete

The automated audio fixtures are WAV-based. The existing WebKit Windows test environment skips audio decoding flows, and the recorded human test only covers Edge + WAV. The 360 px viewport check is not equivalent to testing a real mobile device.

**v0.2 action:** Add real small-format fixtures where feasible and execute a practical browser/device verification matrix. Label anything unavailable as not verified.

#### H. Seek/alignment scheduling uses a global timer

`ensureAligned()` uses `window.setTimeout`/`window.clearTimeout` directly inside the engine. This is a small coupling in an otherwise injected/testable audio engine.

**v0.2 action:** If needed for reliable deterministic tests, move this timeout behind the existing host/test adapter or a very small injected scheduler. Do not turn this into a broad dependency-injection rewrite.

#### I. Large-file and repeated-load resource behaviour has not been measured sufficiently

Object URL cleanup exists for replace, remove, error and dispose. However, the release notes explicitly identify large-file behaviour as unprofiled.

**v0.2 action:** Add repeat-load/resource-lifecycle checks and a practical stress pass. Preserve streaming through media elements; do not decode entire long files into `AudioBuffer` for the player.

### 1.5 Repository files to inspect first

At minimum, inspect the current versions of:

```text
README.md
CHANGELOG.md
package.json
wrangler.jsonc
.github/workflows/ci.yml
src/audio/ABAudioEngine.ts
src/audio/audioHost.ts
src/audio/audioTypes.ts
src/audio/crossfade.ts
src/audio/fileValidation.ts
src/audio/timeFormatting.ts
src/components/audio-file-slot/AudioFileSlot.tsx
src/components/player/PlayerSurface.tsx
src/components/player/Timeline.tsx
src/components/player/VersionSwitch.tsx
src/components/player/VolumeControl.tsx
src/features/comparison/ComparisonWorkspace.tsx
src/app/providers/PlayerProvider.tsx
src/app/providers/ThemeProvider.tsx
src/styles/base.css
src/styles/components.css
src/styles/themes.css
src/audio/*.test.ts
src/app/*.test.ts*
tests/e2e/*.spec.ts
scripts/preview-smoke.mjs
docs/audio-engine.md
docs/browser-support.md
docs/decisions.md
docs/deployment.md
```

Do not assume this file list is exhaustive. Follow imports and tests where necessary.

---

## 2. v0.2 product definition

### 2.1 Release purpose

**v0.2.0 is the reliability and precision release for the existing local A/B listening room.** It should make the v0.1 experience trustworthy for repeated real-world use with different recordings, browser states and input devices.

The central promise remains:

> Add an Original and an Edited recording, play them on one shared timeline, and switch between them without losing the programme position or hearing an avoidable discontinuity.

The output should still be a fast, local-only single-page app. The public app remains usable without sign-in, project creation or any server-side feature.

### 2.2 v0.2 feature set

Required:

1. Hardened asynchronous transport state and operation cancellation.
2. Reliable A/B switching during normal playback, rapid repeated switching and interrupted crossfades.
3. Reliable seeking while playing and paused.
4. Adjustable crossfade duration with 180 ms as the default.
5. Correct, honest UI status during playback start, target alignment and fade transitions.
6. Better handling of interrupted/suspended/closed audio contexts and media-element pause/error events.
7. Robust metadata-readiness handling and a bounded failure state.
8. Better MIME compatibility handling for accepted extensions.
9. Clear, actionable errors for unsupported/corrupt files and unavailable audio output.
10. Real browser/codec verification beyond WAV-only manual testing.
11. Resource-lifecycle and large-file stress checks.
12. Small, high-quality UI/UX improvements that clarify state and make the comparison player easier to use.
13. Updated tests, documentation, browser-support matrix, release notes and v0.2.0 tag.

### 2.3 User-facing acceptance promise

After v0.2, a user should be able to:

- Load one supported file into Original and another into Edited.
- Understand whether a file is waiting, loading, ready, failed or incompatible.
- Play, pause, seek and switch between both versions without losing the shared playback position.
- Reverse a transition quickly without a gain jump or stuck deck.
- Pause or replace/remove media during transport activity without stale playback restarting.
- Adjust the crossfade duration while keeping 180 ms as the default.
- Recover after a supported browser audio interruption by intentionally pressing Play again.
- Understand when the browser cannot decode a particular file.
- Use the application on supported desktop browsers and the verified mobile viewports/devices.
- Continue using the tool without an account, upload, database or network dependency for audio playback.

---

## 3. Strict scope boundaries — do not implement later milestones

This is the most important scope-control section. The v0.2 plan must not become a shortcut to the cloud/client product.

### 3.1 Explicitly out of scope for v0.2

| Later feature                                                         |           Reserved milestone | v0.2 rule                                                                                         |
| --------------------------------------------------------------------- | ---------------------------: | ------------------------------------------------------------------------------------------------- |
| Real waveform generation or waveform display                          |                         v0.3 | Do not add waveforms, peaks, spectrograms or waveform workers. Keep the existing simple timeline. |
| Local project library, saved project names, notes or manifests        |                         v0.4 | No project dashboard, IndexedDB, workspace save/open or metadata export/import.                   |
| Persistent player settings beyond the existing theme preference       |                         v0.4 | Crossfade adjustment may remain in memory for the current page session; do not persist it yet.    |
| Client preview layouts or presentation templates                      |                         v0.4 | Keep the current single-page listening-room layout.                                               |
| Cloud Worker API / Hono endpoints                                     |                         v0.5 | No API routes or new server handlers.                                                             |
| D1 database                                                           |                         v0.5 | No database, migrations or backend records.                                                       |
| R2 file storage or file uploads                                       |                    v0.5/v0.8 | Do not upload audio.                                                                              |
| Better Auth, OAuth, registration or user sessions                     |                         v0.5 | No authentication UI or auth dependencies.                                                        |
| Public, unlisted, private, password-protected or expiring share links |                         v0.6 | No link creation, share page or remote client playback.                                           |
| Guest client sessions                                                 |                         v0.6 | No guest identity/session storage.                                                                |
| Timestamped comments and threaded replies                             |                         v0.7 | No comments, replies or notifications.                                                            |
| Client preference voting                                              |                         v0.7 | No feedback ballot or preference submission.                                                      |
| Client download permissions or cloud file download routes             |                    v0.7/v0.8 | No client-facing download-permission system. Local input files remain in the user's possession.   |
| Resumable/multipart upload                                            |                         v0.8 | No upload code.                                                                                   |
| Audio transcoding or server-side processing                           | Later / out of product scope | No conversion, enhancement, normalization, EQ or compression.                                     |
| Automatic cloud expiration and cleanup jobs                           |                         v0.9 | No Cron Trigger, retention scheduler or server deletion code.                                     |
| Analytics or tracking                                                 |                  Not planned | Do not add analytics, telemetry, tracking pixels or external fonts.                               |
| Global keyboard shortcuts                                             |                  Not in v0.2 | Preserve native keyboard accessibility; do not steal keys from a DAW or another application.      |
| Playback speed controls                                               |         Not required in v0.2 | Do not add unless the owner explicitly changes the scope.                                         |

### 3.2 Architecture and privacy invariants

- The app remains a static React SPA on Cloudflare Workers Static Assets.
- There is no backend API for the player.
- There is no D1, R2, Supabase, auth provider, external file processor or analytics service.
- Audio is loaded from the user's `File` object through an in-memory object URL.
- No audio bytes, names, file sizes, durations or playback state are sent to the server.
- The only browser persistence remains the existing manual theme preference.
- Refreshing/closing the tab still clears selected audio.
- No service worker or offline audio cache is introduced.
- All new runtime dependencies require a concrete reason and an explicit note in the completion report.

---

## 4. Audio transport and engine specification

### 4.1 Preserve the current two-deck signal graph

Keep the existing graph unless a measured defect proves it needs a change:

```text
Original HTMLMediaElement
    └── MediaElementAudioSourceNode
          └── Original GainNode ──┐
                                 ├── Master GainNode ── AudioContext.destination
Edited HTMLMediaElement          │
    └── MediaElementAudioSourceNode
          └── Edited GainNode ────┘
```

The silent deck remains aligned and running during normal playback so that a switch does not have to begin a fresh media decode at the exact moment the user switches. Keep the master volume/mute independent from the deck gains.

Do not replace the media elements with fully decoded `AudioBuffer`s for long-form file playback. This would unnecessarily change the current memory/performance model.

### 4.2 Define one authoritative transport state

Review the current snapshot and add only the state necessary to represent real lifecycle transitions. The UI must not infer transport state from several unrelated booleans.

The conceptual state model should cover:

- `empty`
- `incomplete`
- `loading`
- `ready`
- `starting` (new or equivalent)
- `playing`
- `switching` (new or equivalent; may include target version)
- `paused`
- `interrupted` (new or equivalent recoverable state)
- `error`
- `disposed` internally, not a user-visible state unless needed

Do not blindly add every label to a union if the existing engine can express it cleanly another way. The requirement is unambiguous behaviour, not a particular state naming scheme.

Maintain these invariants:

1. There is one canonical `currentTime`.
2. There is one shared `duration` based on the shorter valid deck duration.
3. Both deck positions are aligned after any seek or successful switch.
4. The UI's **Audible version** label must not claim a target is audible before its alignment and fade start are confirmed.
5. A stale promise must never mutate current state after the action that created it has been superseded.
6. A new file generation invalidates load callbacks and pending operations that depended on the old file.
7. A removed or replaced slot cannot continue playing in the background.
8. `dispose()` remains idempotent and releases media resources, listeners and the audio context.

### 4.3 Guard asynchronous operations

Implement a clear operation-generation/cancellation mechanism. Do not scatter unrelated booleans throughout React components.

Required behaviours:

- Repeated Play clicks while startup is pending must not create multiple concurrent starts.
- Pause during startup must cancel the pending intent. The old Play promise must not later flip the engine into `playing`.
- Replace/remove during startup must invalidate the previous start.
- Dispose during startup must not restart media after cleanup.
- If one media element's `play()` promise rejects after the other begins, both decks must be paused and the engine must return to a stable, recoverable state.
- A new switch request invalidates the old pending alignment/switch request.
- A later switch request must win deterministically over earlier unresolved requests.
- A failed alignment must leave the currently audible deck and playhead in a coherent state.

Use a small sequence number, generation pair or equivalent pattern. Tie async operations to the relevant deck generations. Do not use ad-hoc sleeps to hide races.

### 4.4 Switch state and visual truthfulness

When the user requests a switch during playback:

1. Capture the current canonical playhead.
2. Confirm the target deck is valid and ready.
3. Align the target deck to the canonical playhead.
4. If required, wait for a bounded `seeked`/alignment result.
5. Confirm the target can continue playing.
6. Schedule the two gain ramps.
7. Update the displayed audible state in a way consistent with the actual fade. If showing a “Switching to Edited” state, keep it until the fade is complete or the application has a documented policy for the fade midpoint.
8. Continue the same canonical timeline without a timestamp reset.

If the UI changes the selected indicator at fade start, document that it indicates the selected/target version rather than claiming the entire transition has completed. Prefer a small `switching` status instead of showing a misleading instant final state.

When the target fails:

- Keep playback on the previous audible deck if it is still healthy.
- Restore a correct selected/audible indicator.
- Show an actionable, non-technical status message.
- Do not leave both decks silent or both decks fully audible.

### 4.5 Rapid switching and fade interruption

Add explicit regression coverage for:

- A → B → A within one fade window.
- A → B → A → B across several overlapping requests.
- Switching immediately after Play begins.
- Switching while the target deck is being realigned.
- Pausing during the fade.
- Seeking during the fade.
- Replacing/removing one deck during a pending switch.
- Muting/unmuting and changing master volume during a fade.

The engine already has ramp interpolation/rebasing logic. Reuse it and test its actual behaviour. Do not introduce a second unrelated fade implementation.

Acceptance:

- Gains remain bounded within `[0, 1]`.
- At normal transition points, the two deck gains follow the intended complementary transition policy.
- No stale gain ramp remains after a newer request supersedes it.
- The transition does not snap to an endpoint unexpectedly.
- The canonical playhead does not jump backwards or restart.
- A failed target does not silence the working deck.

### 4.6 Adjustable crossfade duration

Add a small, restrained control for the crossfade duration.

**Required values:**

- Minimum: `80 ms`.
- Default: `180 ms`.
- Maximum: `600 ms`.
- Step: use a sensible small increment (for example, 20 ms) or a few deliberate presets if a slider would add unnecessary visual noise.

The exact control may be a compact slider or preset list, but it must:

- Have a proper visible/accessibility label such as `Crossfade duration`.
- Show the current value in milliseconds.
- Keep `180 ms` on first load.
- Update the engine without reloading the files or resetting the playhead.
- Work while paused and during an active fade. If the value changes mid-fade, define and test whether the current fade completes unchanged while the new duration applies to the next switch, or whether the current fade is safely replanned. Prefer the simpler and safer policy and state it in the UI or documentation.
- Remain session-only in v0.2. It must not be stored in localStorage, IndexedDB or a remote account.
- Respect reduced motion for the control's decorative UI. Audio crossfade remains functional regardless of the user's reduced-motion setting.

Keep the current linear-amplitude curve as the default. Do not switch to equal-power or introduce a fade-shape selector without controlled listening tests and a clear product reason. An equal-power curve is not automatically better for every pair of recordings.

### 4.7 Seeking while playing

The current timeline seeks both media elements to the same position. Strengthen this behaviour so it remains coherent when:

- The user drags the timeline while playing.
- The user seeks while a fade is in progress.
- One deck is slightly behind the other.
- The requested time is very close to the common end.
- The requested value is non-finite or outside the allowed range.
- A metadata duration changes after readiness.

The slider must remain responsive. Do not block the user interface until both media elements emit `seeked`; use a clear pending/recovery state when needed. If a deck cannot seek, fail safely and keep the other deck from becoming falsely synchronized.

Add an E2E test that seeks while playing, not only while paused.

### 4.8 AudioContext and media interruption handling

Add explicit support for audio context state changes through the existing host abstraction.

- Listen for `statechange` when an AudioContext exists.
- Handle `running`, `suspended`, `interrupted` where exposed, and `closed`.
- Do not assume every browser exposes the same intermediate states.
- If the context becomes suspended/interrupted unexpectedly during playback, reconcile the transport state and preserve the current position.
- Do not auto-play solely because a context returns to `running`; require a user gesture where the browser requires one.
- When the user presses Play again, attempt to resume the context and then start both aligned decks.
- If the context is closed or cannot be resumed, surface an actionable error rather than leaving the Play button showing a false playing state.
- Handle media `pause`, `waiting`, `stalled`, `playing`, `ended` and `error` events where they materially affect the controller. Avoid duplicating browser event state unnecessarily.

**Visibility policy:** Do not automatically pause every time the page becomes hidden; users may legitimately switch tabs while listening. On `visibilitychange`, `pageshow` or `pagehide`, reconcile current time and ticker state safely. If the browser actually suspends or interrupts the AudioContext, use the context state as the primary signal. On a true page teardown, allow the existing disposal/resource cleanup path to run.

Do not make the experimental `navigator.audioSession` API a required dependency. Use the widely available `AudioContext.state`/`statechange` contract as the primary mechanism and feature-detect anything newer.

### 4.9 Startup and browser audio errors

Distinguish these categories where the browser provides enough information:

- AudioContext/Web Audio API unavailable.
- AudioContext resume rejected or still suspended.
- HTMLMediaElement play promise rejected.
- One deck fails while the other starts.
- Media decoder rejects an unsupported/corrupt file.
- Media element was interrupted or paused by the browser/system.

Do not expose raw browser exception text directly to ordinary users. Keep useful technical details in development diagnostics only; do not send logs to a remote service.

Suggested user-facing tone:

- “Audio could not start. Press Play again to retry.”
- “Your browser interrupted audio playback. Press Play to continue.”
- “This file could not be decoded by your browser. Try exporting it as WAV or MP3.”
- “The selected version could not be synchronized. Playback stayed on the current version.”

The actual messages may differ if they are clearer. Avoid blaming the user or claiming a format is unsupported based only on a weak MIME probe.

---

## 5. File compatibility and metadata handling

### 5.1 Supported extensions remain unchanged

Continue to advertise and accept:

- WAV
- MP3
- FLAC
- AAC (`.aac`)
- M4A (`.m4a`)

Do not add new formats in v0.2. The purpose is to make the existing supported list more honest and reliable, not to expand the format roadmap.

### 5.2 Extension and MIME policy

The extension is a useful first filter, not proof of the underlying codec. `File.type` can be blank or generic on some systems.

Implement the following policy:

1. Reject zero-byte files with the existing clear message.
2. Reject unsupported extensions before allocating an object URL.
3. Accept supported extensions when `File.type` is blank.
4. Do not reject a supported extension solely because the OS reports a generic MIME such as `application/octet-stream`.
5. Treat a suspicious MIME mismatch as a warning or early hint, not an absolute decoder verdict, unless there is a strong, reliable reason to reject it.
6. Let actual media metadata/decode errors determine whether the file can be played.
7. Do not transcode, rewrite, rename or silently repair a file.
8. Continue to keep the other slot usable if one file fails.

Add unit tests for blank MIME, `application/octet-stream`, common `audio/*` types, the accepted `video/mp4` container case if still needed, clearly unrelated MIME types, uppercase extensions and fake/corrupt content.

### 5.3 Capability probes are hints only

Keep `canPlayType()` as a preliminary compatibility hint. Do not treat a return value of `"maybe"` or `"probably"` as proof that the specific file will decode. An empty response is a useful warning, but the actual file may still be supported depending on container/codec details. The media element's load and error events remain the final practical test.

If you improve MIME strings, include codec parameters only when the actual file codec is known. Do not pretend `.m4a` means one guaranteed codec; M4A is a container and can hold different audio codecs.

### 5.4 Robust metadata-readiness state

Rework the current readiness sequence so that it does not immediately fail only because duration is temporarily unavailable.

The slot should remain in a genuine loading state while the browser is still resolving metadata. Listen to the appropriate media events, including at least:

- `loadedmetadata`
- `durationchange`
- `loadeddata` or `canplay` if needed for the readiness policy
- `error`
- `emptied`/replacement lifecycle where needed

Requirements:

- Read duration only when it is finite and greater than zero.
- If duration is `NaN` or `Infinity` at the first event, determine whether a later event can resolve it before failing.
- Do not let `durationchange` ignore a deck merely because it has not yet been marked ready.
- Use a load-generation token so stale metadata/error events from a replaced file cannot affect the current slot.
- Add a cancellable timeout for files that never reach a usable state. Choose the timeout based on practical local-file tests; document the value and its reason. It must be long enough for large local files but short enough that an invalid file does not leave the interface loading forever.
- Cancel the timeout on ready, failure, replace, remove and dispose.
- Treat a zero or invalid duration as a meaningful error only after the load sequence has had a fair chance to resolve.
- If `durationchange` occurs after readiness, recompute the common duration and keep the playhead clamped safely.

### 5.5 File replacement and failed input behaviour

Test these scenarios carefully:

- Choose a valid file, then cancel the native picker. Existing file remains unchanged.
- Choose an unsupported extension. Existing valid file remains usable and the new selection error is clear.
- Choose a supported extension with an invalid/corrupt body. The slot enters a recoverable error state; the other deck remains independent.
- Replace a file while playback is starting.
- Replace a file while playback is active.
- Remove either deck while playback is active.
- Rapidly replace one deck several times before metadata returns.
- Drop multiple files into a one-file slot.
- Drop files across nested slot children without flickering/locking the drag state.

A failed replacement must not silently discard a still-working prior file if validation can reject the new selection before the engine replaces the old media. If the browser begins loading a candidate and then decoding fails, clearly explain that the candidate failed and let the user replace it again.

### 5.6 Format fixtures

Create small, deterministic and rights-safe fixtures for codec/browser verification.

Preferred approach:

- Generate a short sine/tone-based audio sample locally.
- Use FFmpeg only as a development/test fixture generator if available; do not make FFmpeg a production dependency.
- Keep each committed binary fixture small and clearly generated, or generate fixtures during test setup when the required codec tool is available.
- Do not add copyrighted music, speech, client files or personal recordings to the repository.
- If a codec fixture cannot be generated in CI, report that exact coverage as skipped/unavailable instead of claiming codec support.

At minimum, the automated test assets should include WAV and MP3 if generation is reliable in the CI environment. Add FLAC/AAC/M4A fixtures when the selected browser/codec path can be generated reproducibly.

### 5.7 Do not add a universal file size cap without measurements

The current app displays file size and uses media elements/object URLs. v0.2 must test realistic larger files and measure:

- Time to metadata readiness.
- Memory stability across load/replace/remove cycles.
- Playback start latency.
- Playback continuity during A/B switch.
- Browser responsiveness while the two decks are active.

Do not introduce an arbitrary 50 MB/100 MB hard limit simply because it is easy to implement. Add a warning threshold only if testing demonstrates a meaningful problem, and explain the threshold to the user. A browser memory failure must be handled cleanly without a broken player state.

---

## 6. UI/UX improvements — polish the existing product, do not redesign it

### 6.1 Design direction to preserve

Keep the existing Switchroom visual identity:

- Premium minimal / experimental atmosphere.
- Editorial serif display headline paired with a clean sans-serif control system.
- Restrained accent colour.
- Dark and light modes with system preference as the default.
- Atmospheric grid/glow/grain background.
- Crossfade motif in the hero.
- Distinct Original (A) and Edited (B) language.
- Compact file metadata and clear status states.
- Deliberate, subtle interactions rather than constant animation.

Do not replace this with a generic dashboard template, an audio DAW clone, glassmorphism, excessive gradients or a complex waveform editor.

### 6.2 Improve state communication

The highest-value UI improvements are state clarity, not new sections.

Add/revise visual states where needed:

- Starting playback.
- Switching/alignment pending.
- Fade in progress (only if a restrained indicator is genuinely helpful).
- Browser interruption/recovery.
- File metadata timeout.
- Decoder/codec failure.
- Context unavailable.

The user should never be left wondering whether the application is loading, playing silently, switching, paused or broken.

Status copy should be concise and contextual. Avoid adding a large persistent alert panel for transient states. Use the existing player status line and slot-level status/error areas where possible.

### 6.3 Crossfade control presentation

Expose the adjustable duration with minimum visual weight. Suggested placement:

- A small `Transition` disclosure/control adjacent to the player, or
- A compact secondary control within the player surface.

Do not create a full settings page, project settings screen or dashboard. Keep the main action — Play and A/B selection — visually dominant.

### 6.4 Responsive behaviour

Preserve the existing desktop two-slot arrangement and mobile stacked slots. Recheck at:

- 360 px
- 375 px
- 390 px
- 430 px
- 768 px
- 1024 px
- 1280 px
- 1440 px

Check actual overflow after files with long names, long error messages and metadata are loaded. Ensure the transition control does not force horizontal scrolling.

For touch devices, interactive targets should be comfortable to hit (aim for at least 44 CSS px where practical). The file replace/remove controls, version switch, play/pause, timeline and volume must not be too small or too close together.

A desktop browser narrowed to 360 px is useful but does not substitute for real mobile testing.

### 6.5 Motion and interactions

Keep motion refined and purposeful:

- Use short opacity/position transitions for state changes.
- Avoid animating layout properties continuously.
- Avoid scroll-driven effects that compete with the player or add work during playback.
- Keep the atmospheric background static or very subtle; do not introduce always-running high-cost animation.
- Keep decorative Motion animations disabled or reduced under `prefers-reduced-motion`.
- Never disable the functional audio crossfade because reduced motion is enabled.
- Respect user interaction preference; buttons need clear hover, active and focus feedback.
- Do not add click ripples or motion for every decorative element if it compromises the minimal feeling.

### 6.6 Accessibility refinements

Preserve:

- Skip link.
- Semantic headings and sections.
- Native button/range controls.
- Meaningful accessible names.
- Visible focus indication.
- Logical tab order.
- Polite status announcements for state transitions.
- Reduced-motion behaviour.

Improve:

- Ensure the transition duration control is accessible and reports its value.
- Ensure switching and interruption messages do not flood the screen reader during rapid toggles.
- Ensure file slot errors are associated with the relevant slot/input/visible trigger.
- Ensure colour contrast for muted, warning and error copy in both themes.
- Ensure focus remains stable when a file is replaced or an error message appears.
- Test keyboard operation of every control.

**Do not add global keyboard shortcuts in v0.2.** The current design decision intentionally avoids stealing keys from a DAW, another audio application, the browser or assistive technology. Native keyboard operability is required; global hotkeys are not.

### 6.7 No decorative fake data

Do not add fake waveforms, fake meters, pretend analysis, random playback activity, simulated audio quality scores or charts that imply real file analysis. The v0.2 player still uses the honest shared timeline only.

---

## 7. Testing and verification plan

### 7.1 Testing principle

Use three different forms of verification, and report them separately:

1. **Automated logic tests:** deterministic tests for state, gain planning, metadata and lifecycle behaviour.
2. **Real browser tests:** Playwright against actual media elements and Web Audio where supported.
3. **Human listening/manual device tests:** physical speakers/headphones and real browser/device combinations.

Automated gain tests are not proof that the fade sounds pleasant. A successful `canPlayType()` result is not proof that a particular file decodes. A desktop mobile-sized viewport is not proof of real mobile behaviour.

### 7.2 Unit tests — engine and helper logic

Extend current tests rather than replacing them.

Required categories:

#### Transport operation races

- Two Play requests arriving together produce one valid start.
- Pause supersedes a pending Play.
- Replace supersedes a pending Play.
- Remove supersedes a pending Play.
- Dispose supersedes all pending operations.
- A late rejected `play()` promise cannot put the engine into an obsolete state.
- A late resolved `play()` promise cannot restart a removed/replaced deck.
- Newer switch requests supersede older alignment promises.

#### Synchronization and seek

- Seek both decks while paused.
- Seek both decks while playing.
- Seek during a fade.
- Clamp negative, non-finite and over-duration seeks.
- Align with a small drift under the tolerance.
- Align with drift over the tolerance.
- Timeout a seek that never emits `seeked`.
- Verify a failed alignment rolls back cleanly.
- Verify the shared duration remains the shorter valid duration.

#### Crossfade behaviour

- Default duration is 180 ms.
- Values below 80 ms are clamped/rejected to the documented minimum.
- Values above 600 ms are clamped/rejected to the documented maximum.
- Values within range schedule the expected ramp.
- A → B → A interruptions rebase from interpolated gain.
- Pause during fade settles into a stable state.
- Mute/master volume changes do not modify the selected deck gains incorrectly.
- No gain exceeds `[0, 1]`.

#### Context/media interruption

- Context suspended during playback.
- Context interrupted (where representable in the fake host).
- Context closed unexpectedly.
- Context resumed only after a valid user action where required.
- One deck emits `pause` while the other continues.
- Browser interruption preserves canonical time.
- Resume does not produce two audible decks.

#### Metadata and file validation

- Blank MIME and generic MIME.
- Supported extension with a known audio MIME.
- Supported extension with a suspicious MIME.
- Unsupported extension.
- Zero-byte file.
- Corrupt body with supported extension.
- Duration initially unknown then becomes finite.
- Duration remains invalid until timeout.
- Duration changes after readiness.
- Load timeout is cancelled on success, replacement, removal and dispose.
- A stale event from the previous file generation is ignored.

#### Resource lifecycle

- Object URL is revoked on replace.
- Object URL is revoked on remove.
- Object URL is revoked on decode failure.
- Object URL is revoked on dispose.
- Repeated replace/remove does not leak URLs, listeners or AudioContexts.
- `dispose()` is idempotent.
- React StrictMode mount/unmount behaviour remains correct.

### 7.3 Component tests

Add/update component tests for:

- Crossfade duration label and input bounds.
- Current duration display updates when the user changes it.
- Switching/starting/interrupted states are announced appropriately.
- Disabled controls remain disabled while required media is missing.
- File error copy is associated with the correct slot.
- The theme toggle and system preference remain correct.
- No new UI control introduces keyboard traps.

### 7.4 Playwright E2E tests

Add new stable E2E cases to `tests/e2e/`.

Minimum new cases:

| ID     | Scenario                                    | Expected result                                                            |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| E2E-12 | Repeated Play clicks during startup         | One start; no duplicated or stuck media.                                   |
| E2E-13 | Pause during startup                        | Playback remains paused after the pending promise resolves.                |
| E2E-14 | Replace a file during startup               | Old start is cancelled; new file owns the slot.                            |
| E2E-15 | Remove a file during startup                | Neither deck restarts; player becomes incomplete.                          |
| E2E-16 | Rapid A/B reversal during crossfade         | Latest request wins; gains remain valid; timeline stays continuous.        |
| E2E-17 | Seek while playing                          | Both deck times converge on the requested position and playback continues. |
| E2E-18 | Pause during fade                           | Both decks pause at a coherent position and no stale fade resumes.         |
| E2E-19 | Context suspension/interruption simulation  | UI shows recoverable state and does not falsely report playing audio.      |
| E2E-20 | Metadata duration becomes available late    | Slot eventually becomes ready instead of failing immediately.              |
| E2E-21 | Metadata timeout                            | Slot exits loading and displays an actionable error.                       |
| E2E-22 | Generic MIME with supported extension       | File is not rejected solely because MIME is generic.                       |
| E2E-23 | Replace/remove repeatedly                   | No stale UI state, media playback or URL leak.                             |
| E2E-24 | Transition slider/presets                   | Value is clamped, displayed and applied without restarting playback.       |
| E2E-25 | System theme change                         | System mode responds to OS theme changes; manual mode stays fixed.         |
| E2E-26 | Long filename and long error text on mobile | No overflow, overlap or inaccessible action.                               |

Use the existing deterministic fake audio host for race/state tests and real Playwright media playback for browser behaviour. Avoid tests that rely on arbitrary fixed sleeps when a state/event poll can be used.

### 7.5 Real browser / codec matrix

At minimum, attempt these combinations when the required browsers/devices are available:

| Browser/device                      |  WAV |  MP3 | FLAC |  AAC |  M4A | Required note                                                 |
| ----------------------------------- | ---: | ---: | ---: | ---: | ---: | ------------------------------------------------------------- |
| Microsoft Edge desktop / Windows 11 | Test | Test | Test | Test | Test | This is the previously recorded manual baseline for WAV only. |
| Google Chrome desktop / Windows 11  | Test | Test | Test | Test | Test | Branded Chrome manual pass is outstanding.                    |
| Firefox desktop / Windows 11        | Test | Test | Test | Test | Test | Distinguish branded Firefox from Playwright Firefox.          |
| Safari macOS                        | Test | Test | Test | Test | Test | Real browser/device test, not just Playwright WebKit.         |
| Chrome Android                      | Test | Test | Test | Test | Test | Touch/file-picker/audio activation.                           |
| Safari iOS                          | Test | Test | Test | Test | Test | AudioContext interruption and user-gesture resume.            |

Do not force a claim that every format works in every browser. Record `Pass`, `Fail`, `Not tested` or `Not available` separately. Include:

- Browser version.
- Operating system/device.
- File extension.
- Actual codec/container when known.
- File duration and size.
- Whether metadata loaded.
- Whether playback began.
- Whether A/B switching worked.
- Whether a fade sounded clean.
- Whether interruption/recovery worked.
- Any console error or visible warning.

The browser matrix is a record, not a promise that v0.2 must make every underlying codec available everywhere. If a browser cannot decode a format, the app must fail clearly and retain a reliable experience for formats it does support.

### 7.6 Human listening checklist

Use a generated synthetic test pair or a non-confidential audio pair provided by the owner. Never commit private client audio.

Test:

- Repeated Original → Edited → Original switching.
- Several very rapid switch reversals.
- Switching at the beginning, middle and near the end.
- Pause and resume during a fade.
- Seek while playing, then switch.
- Change the master volume during a fade.
- Mute/unmute during a fade.
- Compare identical-level files and files with a known loudness difference.
- Compare WAV and the verified compressed fixtures.
- Replace/remove one file while paused and while playing.

Listen for:

- Clicks and pops.
- Gaps or doubled transients.
- Abrupt loudness changes caused by the engine rather than the source pair.
- A restart or jump in programme content.
- A stale deck continuing underneath after switching.
- A transition that fails to complete after repeated clicks.

Record observations. Do not claim that the engine guarantees equal loudness between two different masters; the application does not normalize audio.

### 7.7 Responsive and accessibility checks

- Check the viewport list in section 6.4.
- Run keyboard-only workflows for file selection, Play/Pause, A/B selection, timeline, volume, mute and transition duration.
- Verify focus visibility in both themes.
- Verify reduced-motion mode and normal motion mode.
- Check text contrast for status/error/warning states.
- Check that screen-reader announcements do not repeat at animation-frame frequency.
- Consider adding `axe-core`/Playwright accessibility scans if they fit cleanly into the current test stack; do not allow a scanner to replace manual keyboard and screen-reader review.

### 7.8 Network/privacy regression checks

Preserve and expand the existing E2E test that checks for local-only behaviour.

Verify:

- No request containing an audio file or file bytes is made.
- No filename, file size, duration or file metadata is sent to a remote endpoint.
- No new analytics, tracking or external font request is introduced.
- No local audio bytes are written to localStorage, sessionStorage, IndexedDB or Cache Storage.
- The only permitted localStorage key remains `switchroom.theme`.
- A refresh clears both selected files.
- The production build does not expose the development-only engine diagnostic hook.

### 7.9 Performance and resource checks

Test realistic files and repeat cycles:

- Short WAV and MP3 fixtures.
- Several-minute audio file.
- Larger WAV test file representative of an uncompressed edit/master export.
- Repeated replace/remove cycles (at least 20 in an automated/fake-host test and a smaller real-browser stress pass).
- Switch repeatedly while playing.
- Use the browser performance/memory tooling where available.

Requirements:

- Avoid decoding full long-form files into memory.
- Revoke object URLs at the correct lifecycle boundary.
- Do not create one new AudioContext for every click or switch.
- Do not create duplicate event listeners on every render.
- Stop requestAnimationFrame/ticker work when paused, disposed or otherwise not needed.
- Do not animate expensive background effects continuously during playback.
- Keep the UI responsive during file metadata loading.

---

## 8. Implementation phases and completion gates

The agent must complete the phases in order. Do not skip the baseline phase or begin visual polish before transport behaviour is stable.

### Phase 0 — Baseline audit and reproduction

**Goal:** Establish what is actually present in the checked-out project and reproduce the behaviours before touching code.

Tasks:

1. Confirm repository, current branch, commit and `v0.1.0` tag.
2. Run `npm ci` from a clean checkout.
3. Run format check, lint, typecheck, unit tests, Chromium E2E, production build, preview and smoke test.
4. Capture screenshots for light, dark and mobile layouts using the existing screenshot script.
5. Open the public app and confirm its visible behaviour matches repository source.
6. Reproduce the main risk scenarios with deterministic tests or manual controls where possible: startup race, rapid switching, duration-not-ready, context suspension.
7. Record exact pass/fail/skip results and create a `v0.2.0` working branch.

**Gate 0:** No code changed; baseline results and current app state are recorded. If the repository differs materially from this plan, update the plan notes before implementation rather than blindly applying assumptions.

### Phase 1 — Transport lifecycle and async operation safety

**Goal:** Make Play/Pause/Replace/Remove/Dispose and pending switching deterministic.

Tasks:

1. Define the smallest adequate transport state model.
2. Add operation generations or cancellation tokens for asynchronous engine actions.
3. Prevent duplicate concurrent Play starts.
4. Cancel stale Play continuations when Pause/Replace/Remove/Dispose occurs.
5. Ensure both media elements stop if one deck fails to start.
6. Add explicit switch-pending state or equivalent truthful status.
7. Ensure failed alignment leaves the current audible deck stable.
8. Ensure load-generation tokens invalidate old metadata/error events.
9. Add deterministic engine tests for every race listed in section 7.2.

**Gate 1:** All state/race unit tests pass. Existing v0.1 playback, seek, replace, remove and disposal tests still pass. No UI state falsely reports playback after a superseding action.

### Phase 2 — Precision switching, seeking and crossfade configuration

**Goal:** Make the central A/B comparison robust under rapid, real-world operation.

Tasks:

1. Audit the existing gain-ramp interpolation and rebase behaviour.
2. Add tests for rapid reversal and requests during alignment.
3. Add seek-while-playing and seek-during-fade handling.
4. Verify time alignment at normal playback speeds.
5. Implement a user-adjustable crossfade duration from 80–600 ms with 180 ms default.
6. Define the effect of changing the duration during an active fade.
7. Add the compact UI control and accessible current-value readout.
8. Test volume and mute while a fade is running.
9. Retain the existing linear-amplitude default unless real listening evidence supports a different curve.

**Gate 2:** Real browser switching stays continuous and the deterministic gain tests pass. The crossfade setting can change without resetting files or timeline. No waveform or speed control is added.

### Phase 3 — AudioContext interruption and playback recovery

**Goal:** Make audio playback resilient to system/browser state changes.

Tasks:

1. Extend the audio host interface only as needed to observe context state changes.
2. Subscribe/unsubscribe to `AudioContext.statechange` correctly.
3. Handle suspended/interrupted/closed states without assuming all browsers expose every state.
4. Reconcile both media decks and the canonical playhead after interruption.
5. Make the UI status explicitly recoverable.
6. Require a user action to resume if browser gesture policy requires it.
7. Handle relevant media-element pause/stall/error events without creating contradictory state.
8. Reconcile ticker/playhead after tab visibility changes and page restoration.
9. Add fake-host and Playwright tests for interruption/resume paths.

**Gate 3:** Simulated context interruption tests pass. No automatic hidden-tab pause policy is introduced. The app never reports audible playback while the context is known to be unavailable.

### Phase 4 — Robust file validation and metadata readiness

**Goal:** Reduce false file rejection and prevent infinite/incorrect metadata loading states.

Tasks:

1. Update MIME validation according to section 5.2.
2. Improve `canPlayType()` copy and ensure it remains advisory.
3. Rework metadata readiness to handle late duration information.
4. Add a measured, cancellable metadata timeout.
5. Classify decoder/load errors into clear messages.
6. Keep slot failure independent from the other slot.
7. Add generated codec fixtures where practical.
8. Add tests for replacement during metadata load and stale events.
9. Keep the displayed file metadata truthful; do not invent bitrate/sample rate or codec details that the browser has not actually provided.

**Gate 4:** All deterministic file-validation and metadata tests pass. Corrupt/unsupported media exits loading with a clear error. Generic MIME values do not automatically reject supported extensions. Codec support claims match the actual verification matrix.

### Phase 5 — UI state polish, responsive and accessibility refinement

**Goal:** Improve clarity and comfort without replacing the design.

Tasks:

1. Add subtle starting/switching/interrupted visual feedback.
2. Add the compact transition control and ensure it fits all viewport sizes.
3. Refine slot status, warning and error messages.
4. Check long filenames and file metadata wrapping/truncation.
5. Verify mobile touch target sizes and spacing.
6. Recheck theme contrast and system-follow behaviour.
7. Recheck focus and screen-reader announcements.
8. Verify reduced-motion behaviour for all new UI transitions.
9. Capture refreshed desktop light/dark and mobile screenshots.

**Gate 5:** The existing visual identity is intact; all required controls remain accessible; no horizontal overflow or overlapping controls at the required widths.

### Phase 6 — Browser, codec and performance hardening

**Goal:** Validate the app in real media/browser conditions, not only in the test harness.

Tasks:

1. Run Playwright Chromium and Firefox suites.
2. Run WebKit UI tests and report audio skips honestly.
3. Test branded Chrome, Edge and Firefox manually where available.
4. Test real Safari and mobile devices where available.
5. Test WAV/MP3/FLAC/AAC/M4A fixtures and document actual results.
6. Complete the human listening checklist.
7. Complete the repeated load/replace/remove resource pass.
8. Run a larger-file stress test and note time/memory observations.
9. Resolve P0/P1 issues found during the pass.
10. Keep unverified browser/device cases clearly labelled as unverified.

**Gate 6:** No known critical transport, resource or privacy regression remains. The browser-support document accurately describes the tested matrix. Unavailable physical-device checks are documented, not fabricated.

### Phase 7 — Documentation, CI and release preparation

**Goal:** Deliver a clean, reproducible and publicly usable v0.2.0 release.

Tasks:

1. Update `README.md` for the v0.2 behaviour and limitations.
2. Update `docs/audio-engine.md` with operation cancellation, switch state, transition setting and interruption policy.
3. Update `docs/browser-support.md` with actual matrix and manual listening record.
4. Update `docs/decisions.md` with any changed engine decisions.
5. Update `docs/local-development.md` only if development/test commands changed.
6. Update `docs/deployment.md` only if deployment instructions changed; do not introduce backend setup.
7. Update `CHANGELOG.md` with an accurate v0.2.0 entry.
8. Update `package.json` version to `0.2.0` and regenerate the lockfile using the project package manager if needed.
9. Ensure CI covers new tests and still does not need Cloudflare secrets for ordinary test runs.
10. Build and preview the actual production bundle through the Workers runtime.
11. Run the smoke test locally and against the deployed public URL after deployment.
12. Publish tag/release `v0.2.0` only after all release gates pass.

**Gate 7:** All required checks pass, release documentation is accurate, the public deployment is verified and `v0.2.0` is tagged. If deployment credentials are unavailable, finish the build and docs but report deployment as blocked; do not claim public deployment success.

---

## 9. Required scripts and CI contract

Preserve the existing npm scripts unless there is a clear reason to alter them.

Required checks:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run preview
npm run smoke
```

Full browser suite where installed:

```bash
npm run test:e2e:all
```

First-time browser installation (as needed):

```bash
npx playwright install chromium firefox webkit
```

Rules:

- CI must run formatting, lint, typecheck, Vitest and the required Playwright Chromium suite.
- Keep the production build in CI.
- Add Firefox CI coverage if it can be kept stable and within reasonable runtime; otherwise run it as a documented release gate.
- Keep WebKit UI coverage, but do not convert unsupported audio skips into fake passes.
- The CI workflow must not deploy automatically or require Cloudflare credentials merely to run tests.
- Do not add credentials to source, test fixtures, logs or documentation.
- Keep the development-only diagnostic hook absent from production output.

---

## 10. Release definition of done — v0.2.0

Do not mark v0.2 complete until every applicable item below is checked.

### 10.1 Transport and audio

- [ ] Current v0.1 audio workflows still work.
- [ ] Pending Play can be safely cancelled.
- [ ] Double Play does not start duplicate media operations.
- [ ] Pause/replace/remove/dispose supersede stale asynchronous operations.
- [ ] Both decks remain aligned through switch and seek operations.
- [ ] A/B switching works repeatedly in both directions.
- [ ] Rapid reversals do not create gain jumps or stuck decks.
- [ ] Pause/resume during a fade is coherent.
- [ ] Volume/mute changes work during a fade.
- [ ] Seeking while playing works.
- [ ] Duration mismatch still uses the shorter common duration.
- [ ] The crossfade duration setting works from 80 to 600 ms.
- [ ] The default crossfade remains 180 ms.
- [ ] The playhead does not unexpectedly reset on a switch or interruption.
- [ ] The app does not report playing when the audio context is unavailable.
- [ ] Interrupted playback has a clear recovery path.

### 10.2 File handling

- [ ] WAV, MP3, FLAC, AAC and M4A remain accepted by extension.
- [ ] Blank and generic MIME types are handled correctly.
- [ ] Actual codec decode failures produce honest messages.
- [ ] Late metadata/duration readiness is handled.
- [ ] A bounded load timeout exists and is cancellable.
- [ ] Stale load events cannot affect a replacement file.
- [ ] Invalid replacement attempts do not needlessly discard the previous working file.
- [ ] One failed slot does not corrupt the other slot.
- [ ] File size/duration/format metadata remains truthful.

### 10.3 UX and accessibility

- [ ] System/Dark/Light themes work.
- [ ] System mode reacts to operating-system theme changes.
- [ ] Manual theme choice persists as before.
- [ ] Reduced motion is respected for decorative/UI motion.
- [ ] Functional audio crossfade remains enabled under reduced motion.
- [ ] Keyboard operation works for all controls.
- [ ] Focus visibility is clear in both themes.
- [ ] Errors and switching/interruption status are accessible.
- [ ] Layout remains usable at all required viewport widths.
- [ ] Real device checks are recorded separately from viewport emulation.

### 10.4 Privacy and scope

- [ ] Audio files are never uploaded.
- [ ] No new backend/API/database/storage/auth dependency exists.
- [ ] No audio/file metadata telemetry exists.
- [ ] No audio bytes are persisted in browser storage.
- [ ] Theme is the only allowed persistent browser preference.
- [ ] No waveform or waveform-analysis UI was added.
- [ ] No local project library or saved workspace was added.
- [ ] No share link or client review page was added.
- [ ] No comments, voting, client downloads or account UI was added.
- [ ] No automatic deletion/scheduled job was added.

### 10.5 Engineering and release

- [ ] `npm run format:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:e2e` passes.
- [ ] Firefox suite passes or any failure is explicitly documented and fixed before release.
- [ ] WebKit skips are reported accurately.
- [ ] `npm run build` passes.
- [ ] `npm run preview` runs successfully through the Workers runtime.
- [ ] `npm run smoke` passes.
- [ ] Public deployment smoke test passes after deployment.
- [ ] Browser-support document reflects tests actually performed.
- [ ] Changelog, README and package version are updated.
- [ ] Tag `v0.2.0` and GitHub release are created only after verification.

---

## 11. Documentation changes required

### `README.md`

Update:

- Project status from `v0.1.0` to `v0.2.0`.
- Feature list with adjustable crossfade and the verified transport/recovery refinements.
- Keep the local-only privacy promise explicit.
- Keep the file compatibility limitations honest.
- Update test counts only after running the final suite.
- Update known limitations with the actual remaining gaps.
- Do not imply that waveform, saving, sharing or client review already exists.

### `docs/audio-engine.md`

Document:

- The final transport state model.
- Operation generation/cancellation policy.
- Switch target/alignment/fade semantics.
- Crossfade duration range, default and policy for changing it mid-fade.
- Seek-while-playing behaviour.
- AudioContext interruption policy.
- Media event handling and cleanup.
- Metadata/load timeout.
- Resource lifecycle.

### `docs/browser-support.md`

Document:

- Exact automated browser versions.
- Real branded browser/device versions.
- Codec fixtures and their actual container/codec.
- Which combinations passed, failed, skipped or were not tested.
- Human listening date and observations.
- Remaining mobile/Safari/codec limitations.

### `docs/decisions.md`

Record only decisions that changed. Explain why the current architecture was retained and why v0.2 did not add a backend, waveform engine or saved workspace.

### `CHANGELOG.md`

Add a `0.2.0` section with:

- Added.
- Improved.
- Fixed.
- Verified.
- Known limitations.

Avoid marketing language that implies unverified universal codec compatibility.

---

## 12. Risks and implementation traps

### 12.1 Do not “fix” seamless switching by making the second deck lazy

The current architecture keeps the inactive media element aligned and running silently. Starting it only when the user clicks would add seek/start latency at the exact moment a smooth transition is needed. Preserve the two-deck approach unless profiling proves it is unsustainable on target devices.

### 12.2 Do not equate a UI selection with audible completion

A button may be selected while a switch is pending. The player status should describe whether a transition is in progress and which deck is actually audible. Avoid premature “Playing Edited” copy.

### 12.3 Do not rely solely on `canPlayType()`

It provides a likelihood signal, not proof that a specific file's codec/container will decode. Always test the actual selected media and handle the media error path.

### 12.4 Do not assume `.m4a` always contains AAC

M4A identifies a container, not a single guaranteed codec. Do not write copy that promises that every M4A file will work.

### 12.5 Do not treat Playwright WebKit on Windows as branded Safari

The current release documents that audio decode is unavailable in its WebKit test environment. Keep those cases visible as skipped and run a real Safari pass when hardware is available.

### 12.6 Do not auto-resume after an interruption without policy

Mobile browser/audio focus behaviour varies. Preserve the playhead, show a clear state and require an explicit Play gesture if needed. Do not restart the audio unexpectedly after an incoming call or a different application taking audio control.

### 12.7 Do not overcomplicate the fade controls

One duration value is enough. Do not add curve selectors, loudness normalization, multi-stage fades or separate per-deck transition settings.

### 12.8 Do not add a waveform because the timeline feels sparse

Waveforms are explicitly reserved for v0.3. The v0.2 timeline should remain honest and simple.

### 12.9 Do not add fake technical metadata

If the app cannot accurately identify sample rate, bit depth, bitrate or codec, do not display a guessed value. Existing file name, extension, byte size and decoded duration are sufficient.

### 12.10 Avoid dependency creep

Do not introduce a new audio framework, component library, state-management library, analytics SDK or remote media service for this milestone. Use the current code structure unless a demonstrated defect makes a focused dependency necessary.

---

## 13. Agent execution checklist

Before beginning:

- [ ] Read this plan end to end.
- [ ] Read the existing master roadmap and v0.1 implementation plan.
- [ ] Read the current README/docs and inspect the live site.
- [ ] Confirm the checked-out repository and `v0.1.0` baseline.
- [ ] Run and record all current baseline tests.
- [ ] Create a `v0.2.0` branch.

Before each phase is considered complete:

- [ ] Implementation is complete and scoped.
- [ ] Unit/component tests cover the changed behaviour.
- [ ] E2E tests cover user-visible behaviour where applicable.
- [ ] No unplanned later-version feature was introduced.
- [ ] Documentation was updated if behaviour changed.
- [ ] Build, lint, typecheck and formatting still pass.

Before release:

- [ ] All Phase 0–7 gates are satisfied.
- [ ] All v0.2 definition-of-done checks are reviewed.
- [ ] Test counts and browser matrix are exact.
- [ ] Manual listening results are recorded honestly.
- [ ] `README.md`, `CHANGELOG.md` and docs match the code.
- [ ] `package.json` and lockfile report `0.2.0`.
- [ ] Build, preview and smoke checks pass.
- [ ] Deployment succeeds and is verified before announcing it.
- [ ] Git tag/release `v0.2.0` is published only after all release gates pass.

---

## 14. Reference links

### Project

- Live v0.1 application: <https://switchroom.ftallfettah.workers.dev/>
- Public repository: <https://github.com/Fettah010/switchroom>
- v0.1.0 release: <https://github.com/Fettah010/switchroom/releases/tag/v0.1.0>
- README: <https://github.com/Fettah010/switchroom/blob/main/README.md>
- Audio engine: <https://github.com/Fettah010/switchroom/blob/main/src/audio/ABAudioEngine.ts>
- Audio file validation: <https://github.com/Fettah010/switchroom/blob/main/src/audio/fileValidation.ts>
- Audio engine tests: <https://github.com/Fettah010/switchroom/blob/main/src/audio/ABAudioEngine.test.ts>
- Crossfade implementation: <https://github.com/Fettah010/switchroom/blob/main/src/audio/crossfade.ts>
- E2E comparison tests: <https://github.com/Fettah010/switchroom/blob/main/tests/e2e/comparison.spec.ts>
- Browser support record: <https://github.com/Fettah010/switchroom/blob/main/docs/browser-support.md>
- Audio engine documentation: <https://github.com/Fettah010/switchroom/blob/main/docs/audio-engine.md>
- Implementation decisions: <https://github.com/Fettah010/switchroom/blob/main/docs/decisions.md>
- Deployment instructions: <https://github.com/Fettah010/switchroom/blob/main/docs/deployment.md>

### Web platform references

Use official documentation when changing browser API behaviour. Verify compatibility data at implementation time.

- `HTMLMediaElement.canPlayType()`: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType> — a likelihood hint (`""`, `"maybe"` or `"probably"`), not a guarantee that a specific file will decode.
- `HTMLMediaElement` and media events: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement> — event and duration semantics for `loadedmetadata`, `durationchange`, `canplay`, `ended` and media errors.
- `HTMLMediaElement.error`: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/error> — inspect the available `MediaError` details without exposing raw browser text directly to users.
- `BaseAudioContext.state`: <https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state> — understand `running`, `suspended`, `interrupted` and `closed` where supported.
- `AudioContext.resume()`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume> — resume a previously suspended context and handle the returned promise.

---

## Final instruction

Deliver **Switchroom v0.2.0 as a stronger version of the existing local-only listening room**, not as an early version of the cloud client-review platform.

Prioritize transport correctness, real codec/browser verification, recoverable audio interruptions, clean file lifecycle handling and precise UI state. Keep the current app functional throughout. Do not implement v0.3 waveforms, v0.4 local workspaces, or any v0.5+ cloud/client features.
