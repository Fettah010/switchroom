# Switchroom v0.3.0 — Expanded Execution Plan

> **Release:** `v0.3.0`  
> **Working title:** Waveform & Expressive Timeline  
> **Baseline:** Public `v0.2.0` release  
> **Repository:** https://github.com/Fettah010/switchroom  
> **Live application:** https://switchroom.ftallfettah.workers.dev  
> **Deployment:** Cloudflare Workers Static Assets  
> **License:** MIT  
> **Document type:** Local-agent implementation specification  
> **Status:** Ready for implementation

---

## 0. Instructions to the implementation agent

You are working on the existing Switchroom repository. This document is the implementation contract for **v0.3.0 only**.

Your job is to inspect the current repository, understand the working v0.2 implementation, implement the v0.3 waveform/timeline experience and the specifically requested visual/interaction refinements, test the result, and leave the application deployable as a public release.

Do not treat this as a greenfield project. Do not replace the architecture simply because a different implementation looks cleaner. Preserve working behaviour unless a change is needed to satisfy a requirement in this document.

### 0.1 Required working method

1. Begin by inspecting the current branch, recent commits, `package.json`, README, `CHANGELOG.md`, the v0.2 release notes, source files, existing tests, CI workflow and deployment configuration.
2. Confirm that the checkout really contains the v0.2.0 code described in this document. If it is newer, inspect the changes and adapt without reverting them.
3. Run the existing format, lint, type-check, unit, browser and build commands before editing. Record the baseline result. Do not silently attribute pre-existing failures to v0.3.
4. Read the existing audio-engine and implementation-decision documents before changing playback or file lifecycle behaviour.
5. Create a short internal implementation checklist based on this plan. Work phase by phase and keep the application runnable throughout.
6. Inspect the rendered application in dark and light themes at desktop and mobile sizes. Do not rely only on source code or unit tests for visual changes.
7. Add tests with each meaningful implementation change. Do not postpone all testing until the end.
8. Keep the original local-only behaviour. Do not transmit audio files, audio samples, waveform data, filenames or metadata to any server.
9. Update the README, changelog, browser-support record and technical documentation to reflect what was actually implemented and tested.
10. Deploy only after all release gates in this document pass. Do not claim that a release is public until the deployment and public smoke test succeed.

### 0.2 Agent autonomy and decision rules

- Make ordinary implementation decisions without interrupting the user for approval.
- Prefer the smallest maintainable implementation that satisfies the requirements.
- Reuse the installed libraries and conventions. Motion for React is already in the project; do not add another animation framework.
- Do not introduce a new dependency unless the existing stack cannot reasonably provide the required capability. Explain any proposed dependency in the completion report, including size, maintenance status, browser support and why a native implementation is insufficient.
- Do not make assumptions about codec support. Feature-detect, attempt real decode where appropriate, and provide a truthful fallback.
- If a desired waveform cannot safely be generated, the comparison player must continue to work. A waveform is an enhancement, never a playback prerequisite.
- If a requirement conflicts with user privacy, playback correctness, reduced-motion accessibility or device memory safety, preserve those higher-priority requirements and document the limitation.
- Do not add placeholder buttons or controls for later milestones.
- Do not leave TODOs that represent unfinished acceptance criteria.

### 0.3 Source-of-truth priority

When sources disagree, use this order:

1. The current repository code and tests on the active implementation branch.
2. This v0.3 execution plan for the v0.3 release scope.
3. Existing architecture and privacy documentation.
4. The master roadmap for features assigned to later milestones.

This plan does not authorize implementation of v0.4+ features.

---

## 1. Release mission

### 1.1 Purpose

v0.3 turns Switchroom's currently functional A/B player into a more visual and expressive listening experience without changing its local-only product model.

The release has three goals:

1. **Visualize the recordings.** Show the Original and Edited audio waveforms on one aligned time axis, with a shared playhead and direct seek interaction.
2. **Make the whole page feel designed and alive.** The current entrance animation is concentrated in the top hero. The empty file dropzones, comparison workspace and player feel static when they enter view. Extend the existing Motion system to those important areas with a restrained, deliberate reveal sequence.
3. **Make controls feel custom and stable.** Replace the generic-looking volume and crossfade range controls with a coherent Switchroom slider system. Eliminate the Play/Starting/Pause layout movement and make state changes feel immediate and smooth.

The result should feel like a premium, minimal audio listening instrument—not a DAW, not an audio editor, and not a generic dashboard.

### 1.2 Definition of success

A user can load two local recordings, see their waveform previews, use one shared timeline to seek both recordings, and switch Original/Edited without breaking synchronized playback. The waveform generation does not block playback or exhaust memory on larger files. The whole listening room has a deliberate entrance and responsive interaction feedback. Volume, timeline and crossfade sliders share a polished visual language. Play/Pause/Starting changes do not make the player or adjacent controls jump.

All existing v0.1 and v0.2 functionality remains intact.

### 1.3 What v0.3 is not

v0.3 is not a cloud or client-review release. It remains a local, browser-based application.

---

## 2. Verified v0.2.0 baseline

The following baseline was checked against the live application and the public repository before writing this plan.

### 2.1 Release and deployment

- Repository: `Fettah010/switchroom`.
- Public deployment: `https://switchroom.ftallfettah.workers.dev`.
- v0.2.0 release published on **2026-11-09**.
- v0.2.0 is deployed as a Vite/React SPA using Cloudflare Workers Static Assets.
- It has no API, database, R2 bucket, server-side audio processing, analytics or account system.
- The `v0.2.0` release notes record 116 Vitest tests, 24 Chromium Playwright specs and 24 Firefox Playwright specs passing. WebKit on Windows records 4 passed and 20 audio-dependent skips because local media decode does not complete in that test environment.
- The public smoke test passed on 2026-11-09.

### 2.2 Existing v0.2 features to preserve

- Two local audio slots: Original (A) and Edited (B).
- WAV, MP3, FLAC, AAC and M4A extensions accepted for browser playback, subject to actual codec support.
- Local `File` objects and in-memory object URLs; files are not uploaded.
- One shared transport and canonical playhead.
- Two synchronized media decks.
- Web Audio API gain routing and an adjustable linear-amplitude crossfade from 80 to 600 ms, in 20 ms steps, with 180 ms default.
- Crossfade updates apply to the next switch; an active fade is not restarted mid-transition.
- Master volume and mute.
- Shorter common duration policy and duration mismatch notice.
- Replace, remove, loading, error and interrupted states.
- Startup/switch operation tokens and cancellation to prevent stale asynchronous work.
- Bounded metadata loading with a 15-second default timeout.
- Recovery after browser/AudioContext interruption through explicit user Play.
- System, Dark and Light themes. Only the manual theme choice is persisted.
- Responsive layout, keyboard-operable controls, visible focus and reduced-motion support.
- Existing diagnostics are development-only and must remain absent from production builds.

### 2.3 Relevant current code structure

Do not assume these are the only files that will need changes, but use them as the starting map:

```text
src/
  app/
    App.tsx
    providers/
      PlayerProvider.tsx
      ThemeProvider.tsx
  audio/
    ABAudioEngine.ts
    audioHost.ts
    audioTypes.ts
    crossfade.ts
    fileValidation.ts
    timeFormatting.ts
  components/
    audio-file-slot/
      AudioFileSlot.tsx
    layout/
      Hero.tsx
      PageAtmosphere.tsx
      TopBar.tsx
      Footer.tsx
    player/
      PlayerSurface.tsx
      Timeline.tsx
      VersionSwitch.tsx
      VolumeControl.tsx
      CrossfadeControl.tsx
  features/
    comparison/
      ComparisonWorkspace.tsx
  hooks/
    usePlayer.ts
    usePlayhead.ts
  styles/
    base.css
    components.css
    index.css
    themes.css
    tokens.css
  test/
    fakeAudioHost.ts

 tests/e2e/
   accessibility.spec.ts
   comparison.spec.ts
   helpers.ts
   theme.spec.ts
```

Check actual paths before editing. The v0.2 repository contains a `CrossfadeControl.tsx` that is not present in the original v0.1 plan.

### 2.4 Confirmed visual and interaction gaps

These are source-level findings and user-reported symptoms. Reproduce them in the browser before deciding exact implementation details.

| Area                  | Current v0.2 implementation                                   | v0.3 action                                                           |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Top entrance          | Hero copy and crossfade motif use Motion entrance animations. | Keep and refine; coordinate with the rest of the page.                |
| Workspace heading     | Static React layout.                                          | Add a restrained entrance/reveal.                                     |
| Original/Edited slots | Static entrance; CSS hover and drag-state transitions exist.  | Reveal both slots with a slight stagger; enrich dropzone interaction. |
| Player surface        | Static entrance; status-driven CSS only.                      | Give the player its own prominent but restrained reveal.              |
| Footer/footnotes      | Static.                                                       | Reveal when they enter view, without excessive animation.             |
| Timeline range        | Partially custom CSS slider.                                  | Integrate with the waveform timeline and shared slider system.        |
| Master volume         | Native range control using `accent-color`.                    | Give it a complete custom Switchroom skin.                            |
| Crossfade duration    | Native range control using `accent-color`.                    | Give it the same custom slider system and clear scale/readout.        |
| Play/Pause            | Button label and transport text vary by state.                | Reserve geometry and animate state feedback without changing layout.  |
| Waveform              | Not present.                                                  | Add aligned Original/Edited visual peaks and shared seek interaction. |

Relevant source facts:

- `Hero.tsx` uses `motion` and `useReducedMotion` for the hero copy and crossfade illustration.
- `App.tsx`, `ComparisonWorkspace.tsx`, the file slots and `PlayerSurface.tsx` are not currently wrapped in entrance/reveal components.
- `VolumeControl.tsx` and `CrossfadeControl.tsx` use plain range inputs whose styling is mostly browser-native.
- `Timeline.tsx` uses a more customized slider, but it is separate from the volume and crossfade styles.
- `PlayerSurface.tsx` changes visible labels between `Starting…`, `Play`, `Pause`, `Switching to …`, status text and the active/audible version.
- `.player__top` and `.player__bottom` currently use flexible wrapping. Dynamic labels and different control widths can cause the layout to reflow during state changes, especially at narrow widths.

Do not assume all perceived lag is CSS. Instrument the state transition and layout. The engine should retain truthful async status; the visual layer should not pretend audio has started before it has.

### 2.5 Outstanding v0.2 verification debt to close in v0.3

The v0.2 release notes explicitly say that no human listening pass was performed on the v0.2 build or new crossfade range. The only recorded human pass is v0.1.0 in Microsoft Edge on Windows 11 using WAV.

v0.3 release verification must include:

- Human listening on the current v0.2 engine behaviour before or during v0.3 QA.
- Listening to 80 ms, 180 ms and 600 ms crossfades.
- Listening to repeated A/B reversals and fade interruption.
- Manual checks of MP3, FLAC, AAC and M4A where available, while reporting unsupported codecs honestly.
- A real mobile touch check if an Android or iOS device is available.

Do not rewrite old browser-support records as if these checks had already been completed.

---

## 3. Scope contract

### 3.1 Required v0.3 deliverables

**A. Waveform and expressive timeline**

- Original and Edited waveform visualization, vertically stacked or otherwise clearly separated, sharing exactly one time axis.
- One visible playhead and one canonical playback position.
- Click/tap waveform to seek both decks together.
- Continue supporting accessible keyboard operation through a native range control or equivalent accessible slider.
- Waveform generation that runs independently from playback.
- Downsampled amplitude peaks; never render one visual element per audio sample.
- Worker-first peak processing where supported and safe.
- Threshold-based fallback for large files or low-memory devices.
- Honest waveform-unavailable/fallback UI. Never display fabricated peaks.
- Duration mismatch remains clear and both waveform rows must remain aligned against the common duration.

**B. Entrance and interaction animation**

- Bring the workspace heading, both file slots/dropzones, player surface, waveform and footnotes into the entrance/reveal system.
- Use a deliberate, short stagger so the user understands the page hierarchy.
- Add an entrance when content first enters the viewport; avoid repeatedly replaying long animations on every scroll.
- Give the dropzones meaningful hover, focus, active and drag-over feedback.
- Reveal waveform peaks smoothly after real peak data is ready.
- Give the player a restrained active/playing visual state.
- Improve click/tap feedback on controls.
- Preserve reduced-motion accessibility.

**C. Slider and player layout refinement**

- Replace native-looking volume and crossfade sliders with a consistent custom skin.
- Bring the timeline range/thumb into the same visual design language as volume and crossfade.
- Preserve keyboard, screen-reader and touch operation.
- Prevent Play/Starting/Pause/Interrupted labels from resizing the play button or moving adjacent elements.
- Prevent state text or the control row from changing the player's outer geometry unnecessarily.
- Preserve honest status announcements and the existing engine states.

**D. Verification and documentation**

- Unit tests for waveform generation and peak reduction.
- Tests for worker cancellation, stale results, failure and fallback.
- Playwright tests for waveform seeking, animations, sliders, responsive layout and stable geometry.
- Manual browser/audio verification and updated browser-support matrix.
- Updated README, CHANGELOG and technical design docs.
- Public deploy and smoke test only after all release gates pass.

### 3.2 Explicit exclusions — do not implement

Do not add or partially scaffold any of the following:

- Accounts, OAuth, Better Auth or user profiles.
- Cloudflare Worker API routes, Hono, D1, R2, storage buckets or server audio processing.
- Uploading audio or waveform peaks to any remote server.
- Shareable links, public/unlisted/private review pages or password protection.
- Guest client sessions or client identity.
- Comments, timestamped feedback, replies, ratings or preferred-version voting.
- Persistent project library, local workspace manager or saved comparison manifests.
- Local audio persistence in IndexedDB, Cache Storage or localStorage.
- Automatic retention or deletion jobs.
- Multi-track editing, effects, EQ, compression, mastering or audio processing.
- Loudness normalization or automatic gain matching.
- Audio transcoding or format conversion.
- Waveform editing, destructive trimming or clip manipulation.
- Server-side waveform generation.
- Analytics, telemetry, third-party tracking or advertising.
- A redesign of the entire product identity or a new UI framework.
- A user-configurable animation settings panel or full presentation-layout system.

The existing theme preference remains the only persisted application setting. The crossfade duration remains session-only as in v0.2 unless a later release explicitly changes that decision.

### 3.3 Optional low-priority work

The master roadmap mentions optional moment bookmarks. Do not let bookmarks delay the required waveform, motion, slider, or stability work.

Only after all required acceptance criteria pass may the agent consider **session-only timestamp markers** as a small enhancement. If implementation would require persistence, a project model, a complex editing UI or more than a small isolated component, leave it out and report it as deferred. No saved bookmarks in v0.3.

---

## 4. Preserve existing architecture and product principles

### 4.1 Stack to retain

Keep the current stack unless a concrete blocker is demonstrated:

- React 19 + TypeScript.
- Vite.
- Motion for React (`motion/react`) for animation.
- Existing CSS custom properties and dark/light theme variables.
- Web Audio API and HTMLMediaElement for the actual playback engine.
- Vitest + Testing Library.
- Playwright.
- Cloudflare Workers Static Assets for deployment.
- GitHub Actions for CI.

Do not add a large waveform player package that replaces the current transport. A lightweight drawing helper may be considered only if it reduces complexity and is properly maintained.

### 4.2 Keep playback engine independent from waveform rendering

`ABAudioEngine` remains the source of truth for:

- loaded file metadata;
- readiness and errors;
- the selected and audible versions;
- canonical current time;
- common duration;
- active playback state;
- seek operations;
- media deck synchronization;
- crossfade gain scheduling;
- volume and mute;
- lifecycle and object URL cleanup.

Waveform computation must be a separate subsystem. It can subscribe to file lifecycle information and receive the local `File`, but it must not own the playhead, create a second timeline, or change the actual audio deck state.

### 4.3 Keep local-first privacy true

- Use browser APIs and local files only.
- Do not send file bytes, file names, durations, file metadata, extracted PCM, peaks or waveform previews to a remote service.
- Do not add analytics or third-party processing.
- Do not persist file bytes or peaks to localStorage/sessionStorage/IndexedDB/Cache Storage.
- Keep object URL cleanup and waveform buffer cleanup explicit.
- Update the privacy copy only if the current implementation changes; the intended privacy model does not change in v0.3.

---

## 5. Waveform experience requirements

### 5.1 User-facing experience

The waveform area should make it easy to visually compare the shape and timing of the two recordings.

Required composition:

- One shared horizontal time axis.
- Original waveform row (A) and Edited waveform row (B).
- Both rows begin at the same horizontal origin.
- Both use the same total/common duration scale.
- A shared playhead line crosses both rows.
- A shared progress indication marks elapsed playback.
- Current-time and total-time labels remain clear and stable.
- Duration mismatch information remains visible.
- The user can click or tap the waveform area to seek.
- Normal timeline seeking must continue to work even when waveform generation fails or is disabled.

The waveform is a preview of amplitude over time, not a spectral analyser. Do not add spectrograms, frequency analysis, loudness graphs or fabricated processing indicators.

### 5.2 Alignment and duration rules

The engine currently uses the shorter valid duration as the shared comparison duration. Keep this policy.

- The waveform visualization must use the same shared duration policy.
- If Original is longer, display its waveform only across the common timeline and indicate the longer file using the existing mismatch notice. Do not visually compress one waveform to fit the other's length.
- If Edited is longer, apply the same rule.
- If the files have effectively equal lengths, both waveforms should fill the same width.
- Seeking from any point in either waveform must call the existing canonical engine seek operation. Never implement independent per-row playheads.
- A seek gesture while playback is running must preserve current v0.2 semantics for both decks and any in-progress switch/fade.
- A click on the waveform should not cause an accidental file drop or page text selection.

### 5.3 Peak format

Create a compact waveform peak data model. It should describe the number of buckets and a typed array of peak magnitudes, with enough metadata to map peaks to the shared duration.

Recommended conceptual contract:

```ts
interface WaveformPeaks {
  version: 'original' | 'edited';
  durationSeconds: number;
  sampleRate?: number;
  channelCount?: number;
  bucketCount: number;
  peaks: Float32Array;
  sourceGeneration: number;
}
```

This is a conceptual example, not a required exact interface. Adapt it to repository naming conventions and type design.

Requirements:

- Values must be finite and normalized to a documented range, typically `[0, 1]`.
- Use peak magnitude per time bucket or another clearly documented peak representation. Do not retain raw decoded PCM after analysis finishes.
- Preserve stereo information only if it provides a real presentation benefit without doubling unnecessary memory. A mono max-envelope preview is acceptable for the initial implementation; explain the choice.
- Keep the number of display buckets bounded by a fixed maximum and/or the actual drawing resolution. Do not create millions of peaks for long files.
- Do not use arbitrary random/synthetic peaks when no audio data is available.
- The same source file should produce deterministic peaks for the same configured resolution.

Recommended initial visual resolution: approximately 1,200–2,400 buckets across the displayed timeline, adjusted to viewport width/device pixel ratio with an upper cap. The exact count should be chosen after profiling, not allowed to scale without limit.

### 5.4 Waveform generation pipeline

Build the waveform pipeline independently of the playback engine.

Recommended conceptual flow:

```text
Local File
   │
   ▼
File/metadata preflight
   │
   ├── over resource budget ──► waveform unavailable / progress-line fallback
   │
   ▼
Waveform decode/analysis strategy selection
   │
   ├── safe Worker path available ──► Dedicated Worker
   │                                  │
   │                                  ▼
   │                             Downsample peaks
   │                                  │
   │                                  ▼
   │                             Transfer compact peaks
   │
   └── safe fallback path ───────────► async decode + Worker peak reduction
                                      │
                                      ▼
                                  Compact peak result
                                      │
                                      ▼
                                  Canvas renderer
```

The real implementation may vary, but keep these invariants:

1. Playback readiness is independent from waveform readiness.
2. Pressing Play never waits for waveform decode or peak extraction.
3. Waveform work is cancellable when a file is replaced, removed or the app is disposed.
4. Every result carries a generation/request ID and stale results are ignored.
5. The waveform pipeline has explicit memory and time limits.
6. Waveform failure never marks a playable audio deck as failed.
7. Large-file fallback is a designed state, not an application error.

### 5.5 Worker and codec constraints

Do not assume every Web Audio or WebCodecs API exists in Dedicated Workers or every browser.

- Investigate the actual API availability on target browsers before choosing a Worker decoding approach.
- A Dedicated Worker can safely own CPU-heavy peak reduction and parse supported PCM WAV data.
- For formats that need browser decoding, `AudioContext.decodeAudioData()` is a candidate only after checking file size, duration and memory budget. It expects a complete encoded file buffer; it is not a streaming-chunk decoder.
- If decoding happens in the main browsing context, keep it asynchronous and move the expensive sample iteration/downsampling out of the main thread where practical.
- Do not assume `AudioDecoder` or WebCodecs is a universal fallback. Feature-detect and check supported codecs/configurations. Do not make v0.3 depend on a limited-availability browser API.
- Do not introduce FFmpeg/WASM or a large demux/transcode dependency by default. It can materially increase bundle size and memory use. A proposal requires measured need and a fallback path.
- For WAV, a dedicated Worker may parse common PCM encodings directly if the implementation can correctly handle RIFF chunks, chunk ordering, padding, channel count and sample formats. Do not assume all `.wav` files are 44.1 kHz 16-bit PCM.
- If a format cannot be safely decoded for waveform analysis, keep the audio player available and show the fallback state.

The browser's ability to play an audio file does not guarantee that the waveform subsystem can safely decode it for analysis. The UI must distinguish these capabilities.

### 5.6 Memory and workload protection

The waveform implementation must not decode unbounded audio files into huge PCM buffers.

Before decoding, use available local metadata and the file size to estimate risk. Include a conservative, documented budget for:

- encoded input buffer;
- decoded PCM buffer;
- any copied/transferable channel arrays;
- peak arrays;
- drawing surfaces.

Use a configurable resource policy rather than scattering magic numbers through components.

- Establish a default source-size limit and estimated decoded-memory limit after a quick local profile on desktop and a constrained/mobile profile.
- If `navigator.deviceMemory` is available, it may inform the budget, but it is optional and must be feature-detected. Do not depend on it.
- Use conservative fallback when the estimate is unknown or exceeds budget.
- Release `AudioBuffer`, `ArrayBuffer`, temporary channel arrays, worker references and object URLs as soon as they are no longer needed.
- Never retain decoded PCM for both files for the entire session when only the compact peaks are needed for drawing.
- Avoid duplicate full-file reads for Original and Edited when the same file object is accidentally selected twice; deduplication is optional but any cache must have a strict memory budget and must not persist.
- A cancelled worker task must not keep processing indefinitely. Terminate/recreate worker if graceful cancellation cannot stop the active operation.

### 5.7 Waveform states

Support these distinct user-visible states:

- **Waiting:** the audio file has not been selected.
- **Preparing:** file is loaded for playback; waveform analysis is pending.
- **Ready:** real waveform peaks have been generated and drawn.
- **Fallback:** waveform analysis was intentionally skipped because of size, memory or unsupported analysis capability; normal timeline seeking remains available.
- **Unavailable:** waveform analysis failed for this file; playback may still work.

Do not use a spinner indefinitely. If analysis has a known upper time bound, show progress or a timeout/fallback state. Do not block the Play button while waveform analysis is pending.

For a fallback, the app may display a simple progress rail and the file's name/duration. It must not draw a generic decorative shape that could be mistaken for a real waveform.

### 5.8 Canvas/SVG rendering

Prefer a Canvas renderer for many waveform bars/peaks because the waveform is dense and mostly static. A small number of SVG elements is acceptable if performance is demonstrated; do not create thousands of DOM nodes.

- Draw from downsampled peak data only.
- Use `devicePixelRatio` for crisp output, but cap total canvas dimensions and memory.
- Respond to element/container resize with `ResizeObserver`; disconnect observers during unmount.
- Avoid repeated full-canvas redraws on every React render.
- Redraw when peak data, dimensions, active version, theme or relevant visual state changes.
- Use a shared horizontal scale and align both rows precisely.
- Use CSS transforms or a lightweight overlay for the moving playhead; do not redraw all peaks every animation frame.
- If the waveform scrolls horizontally in a future design, that is outside v0.3. Keep the entire shared duration visible for now.
- Use theme tokens for waveform colors. Ensure both dark and light themes have sufficient contrast.
- Do not communicate Original/Edited identity using color alone; keep visible A/B labels.

---

## 6. Expressive timeline and interaction requirements

### 6.1 Single canonical playhead

The waveform rows and timeline slider are two views of one timeline.

- Keep one canonical position from `ABAudioEngine`.
- The playhead moves across both waveform rows together.
- Seeking through Original waveform, Edited waveform or the range input calls the same `engine.seek()` operation.
- Avoid duplicated local time state that can drift from the engine snapshot.
- Keep the current `usePlayhead` high-frequency subscription or an equivalent isolated subscription. Do not cause `App`, `Hero`, file slots and the entire `PlayerSurface` to rerender at 60 Hz.
- The player must keep both decks synchronized after seek, including while playing and during a crossfade.

### 6.2 Waveform seeking

- Support pointer click and touch tap on either row.
- Convert pointer X to a clamped fraction of the shared timeline width, then to a target time.
- Clamp to `[0, commonDuration]`.
- Keep playhead and waveform drawing aligned under browser zoom and high-DPI screens.
- Avoid a seek on click of labels, buttons or other controls nested within the waveform area.
- Support drag-to-scrub only if it remains smooth and accessible; ensure pointer capture is handled and released on pointer cancel/unmount.
- The native accessible slider remains the keyboard pathway. Do not require a mouse to operate the app.

### 6.3 Visual progress

- A vertical playhead line should be visible across both rows.
- The elapsed portion may receive a subtle tint/overlay, but avoid making the waveform unreadable.
- Use a small circular or pill-like playhead cap only if it fits the current design.
- The playhead must not jump when switching A/B.
- On pause, progress stops exactly at the preserved time.
- On replay from the end, playhead returns smoothly to the beginning without a large flash or page shift.

### 6.4 Duration mismatch

Preserve v0.2's shorter-common-duration policy. The visual timeline should reinforce, not contradict, the current notice.

- Show the common duration as the timeline endpoint.
- Keep the longer file's remaining tail from implying that comparison can continue beyond the shared endpoint. Either clip the visualization to the common window or mark the tail as outside the comparison range with a clear visual treatment; do not distort its time scale.
- If a waveform is generated for a file with a slightly different duration, use its actual metadata for time mapping and clip to the common duration.
- Test both Original-longer and Edited-longer cases.

---

## 7. Animation and motion design specification

### 7.1 Desired visual result

The page should feel intentionally composed from top to bottom. The hero should no longer be the only section that appears animated.

The intended entrance order is:

1. Header/wordmark and theme control.
2. Hero text and crossfade motif (retain and refine existing motion).
3. Workspace heading and privacy text.
4. Original and Edited file cards, with a short stagger.
5. Comparison player and waveform area.
6. Footnotes and footer when they enter the viewport.

The visual hierarchy should be calm and deliberate. Avoid turning every label and icon into an animation.

### 7.2 Motion implementation

- Use the existing Motion for React package and `motion/react` import path.
- Create a small reusable reveal wrapper or variants only if it genuinely reduces duplication.
- Use `useReducedMotion` or the established reduced-motion hook consistently.
- Prefer `opacity` and `transform` for entrance animation. Avoid animating layout properties such as `height`, `width`, `margin`, `padding`, `top`, `left` or grid dimensions.
- Use `viewport={{ once: true }}` or equivalent so scrolling back and forth does not replay every entrance endlessly.
- Use a sensible viewport threshold and root margin; do not make content wait until it is almost fully scrolled away before appearing.
- Ensure content is visible when JavaScript/Motion is unavailable or reduced motion is enabled. Do not ship permanently hidden sections.
- Keep animation duration short and consistent. Suggested reveal range: approximately 350–650 ms with a modest stagger (roughly 70–130 ms). Adjust after visual testing.
- Do not use large blur effects, dramatic zooms, overshoot springs or heavy parallax.
- Do not animate every character in headings.
- Do not introduce scroll hijacking, smooth-scroll libraries or pinned sections.

### 7.3 Workspace and dropzone entrance

The dropzones are the primary initial interaction and must not feel static.

- Reveal the workspace heading and privacy note.
- Reveal the Original and Edited cards together using a subtle stagger.
- Give each dropzone its own small internal reveal (icon, title, supporting text) only if it remains visually coherent and not over-animated.
- On hover/focus, slightly lift or brighten the dropzone, change its dashed border to the accent, and animate the upload icon subtly.
- On press/tap, provide a short tactile scale/opacity response. The visual state must return to normal on pointer cancel and keyboard activation.
- On drag-over, show a clear accent border and a restrained background/ring effect. Do not rely only on color; preserve visible drop instructions.
- Do not run perpetual idle animation in both empty dropzones. Avoid attention fatigue.
- Keep the file selection and drag/drop implementation unchanged unless required for animation correctness.

### 7.4 Player entrance and active state

- The entire player card must have an entrance animation when it becomes visible.
- The waveform area and playback controls may stagger in very slightly after the player container.
- If both audio files are loaded after the page has already entered, reveal the waveform only after the real data is available; do not replay the entire page entrance.
- The currently audible version may receive a subtle accent highlight.
- When starting playback, show a small active indicator or gentle accent response. When paused, settle cleanly.
- During a version switch, show pending/selected/audible state truthfully. Do not animate a target as audible before the engine says the crossfade has actually begun.
- Do not make a decorative animation imply audio is playing while the media elements are paused or interrupted.

### 7.5 Waveform animation

- The waveform may fade or draw in when real peaks are ready.
- Keep the animation short and avoid moving the waveform's layout box.
- Do not animate thousands of individual bars independently.
- Use a Canvas reveal/clip or a simple opacity/transform approach on the containing surface.
- Playhead movement remains functionally synchronized. Reduced motion may disable decorative easing but must not freeze playback progress.

### 7.6 Subtle scroll and atmosphere effects

A small amount of scroll-driven atmosphere is allowed because the user requested more movement and the current page already contains grid/glow/grain layers.

- Limit scroll movement to the existing background glow/grid layers or section reveals.
- Use tiny parallax offsets only; the foreground content should remain stable.
- Do not attach expensive per-scroll React state updates to the whole application.
- Prefer Motion's optimized scroll hooks/transform mapping or CSS effects that do not cause layout.
- Disable nonessential scroll movement for reduced-motion users.
- Keep background effects `pointer-events: none` and behind interactive content.
- Do not add video backgrounds, Lottie files, external image dependencies or network-loaded animation assets.

### 7.7 Click and control feedback

- Buttons should have consistent hover, focus-visible and pressed feedback.
- Use a subtle press scale, not a bounce.
- Use one consistent easing family and timing scale with existing tokens.
- Do not animate button width or height during state changes.
- Ensure transitions do not delay response to the user's click.
- All functional audio transitions in Web Audio remain independent from decorative UI motion.

### 7.8 Reduced-motion requirements

- Respect `prefers-reduced-motion: reduce` at the Motion and CSS layers.
- In reduced-motion mode, entrance content should appear immediately or with a near-instant opacity change; never leave sections hidden awaiting an animation.
- Disable background parallax, nonessential looping indicators, decorative waveform drawing effects and large movement.
- Keep actual audio crossfade unchanged. It is functional audio behaviour, not decorative page motion.
- Keep seek/playhead updates correct; do not replace continuous playback progress with a delayed visual animation.
- Keep loading/error states clear without relying on a spinner alone.

---

## 8. Slider and range-control design system

### 8.1 Scope

Restyle all three controls as one coherent family:

1. Playback position / timeline range.
2. Master volume.
3. Crossfade duration.

Do not replace native accessible inputs with canvas-only or div-only fake sliders. Native `input[type="range"]` is preferred, with CSS custom styling.

### 8.2 Visual direction

Target: premium, understated, responsive and precise.

- Slim, high-contrast track.
- Clear filled/progress portion.
- Circular or softly rounded thumb with a visible focus ring.
- Subtle hover emphasis and pressed state.
- Consistent track and thumb proportions across the three sliders.
- Dark and light theme variants through CSS variables.
- Monospaced numeric readouts with tabular figures.
- Sufficiently large pointer/touch hit area even when the visible track is thin.
- No browser-default blue accent bar or unstyled range thumb.

Suggested visual measurements (adjust after testing):

- Visible rail: approximately 3–5 CSS px.
- Thumb diameter: approximately 12–16 CSS px.
- Interactive target height: at least 36–44 CSS px, even if the rail is thinner.
- Transition timing: around 120–200 ms for hover/focus; no excessive animation when dragging.

### 8.3 Shared styling architecture

Create a shared range-control class or reusable small component. Avoid three unrelated sets of pseudo-element CSS.

Recommended concepts:

- `.range-control` as the common input class.
- `.range-control--timeline`, `.range-control--volume`, `.range-control--crossfade` for variant sizing.
- A CSS custom property such as `--range-progress` for the filled percentage.
- CSS variables for rail color, fill color, thumb color, focus ring and shadow.
- Matching `::-webkit-slider-*` and `::-moz-range-*` selectors.
- Explicit `appearance: none` and platform-specific thumb/track styles.

Do not assume Chrome/WebKit and Firefox render range controls identically. Test both engines.

### 8.4 Timeline slider

- Keep `aria-label="Playback position"` or an equivalent clear accessible name.
- Expose elapsed and total time through `aria-valuetext`.
- Display the current progress as the shared playhead position.
- Keep the range keyboard accessible with Arrow keys, Home and End behaviour expected from a native range input.
- When the waveform is displayed, the waveform visual and range input must represent the same time. Do not create separate slider and waveform positions.
- Ensure the native input has a sufficiently large hit area over the timeline/waveform. The visual track can be thin, but interaction must remain usable on touch.

### 8.5 Volume slider

- Preserve the existing 0–1 engine value.
- Display an accurate percentage readout.
- Preserve the separate mute/unmute button and its accessible label.
- When muted, the slider can still show the stored volume value; the mute state must be separately communicated.
- Dragging volume must not cause the rest of the player to move.
- Keep the readout width stable between values such as `0%`, `100%` and `Muted`.

### 8.6 Crossfade slider

- Preserve current min/max/default: 80–600 ms, step 20 ms, default 180 ms.
- Preserve current engine behaviour: changing the value affects the next A/B switch, not a fade already in progress.
- Readout should reserve enough width for `600 ms` and should not move surrounding controls.
- Add a small visual scale with clear minimum, default and maximum reference points if it improves comprehension. The default reference must not clutter the control.
- The default marker is an indication of the 180 ms nominal setting, not a separate click target unless keyboard-accessible behaviour is implemented.
- `aria-valuetext` must describe the selected duration in milliseconds.
- Do not persist the value in v0.3.

### 8.7 Slider accessibility

- Every range input has a programmatic accessible name.
- Focus rings are visible in both themes.
- Thumb/track interaction works with mouse, touch and keyboard.
- Readouts do not rely on color only.
- Disabled state is visually distinct but still legible.
- Ensure the crossfade default marker and scale labels do not create confusing duplicate screen-reader announcements.

---

## 9. Play/Pause state transition and layout stability

This is a high-priority issue reported by the user. Treat it as a release-blocking UX requirement.

### 9.1 Problem to solve

When the user clicks Play, the transport changes through a state sequence (for example `ready → starting → playing`). The visible button label/icon and supporting status text also change. The current flexible layout can recalculate widths and wrapping, making the button and nearby controls appear to jitter or shift.

The fix must address both the actual transition timing and the layout geometry. Do not simply add a long CSS transition to hide the jump.

### 9.2 Preserve truthful engine states

- Keep the v0.2 `starting`, `playing`, `switching`, `paused`, `interrupted` and `error` semantics.
- Do not label the deck as audible before the engine has established the actual audio start/fade state.
- The user should receive immediate visual acknowledgement after clicking Play. The UI can immediately display a stable `Starting…` state while `AudioContext.resume()` and the media `play()` promises are pending.
- If Play fails, animate cleanly to the error/ready state and announce the error.
- If Pause is clicked while starting, preserve v0.2's operation cancellation and settle correctly. Do not leave the UI in a fake playing state.
- The state display should not wait for the entire playback promise before showing any response.

### 9.3 Stable button geometry

- Give the Play/Pause/Starting button a stable width and height across all transport states.
- Keep icon container dimensions fixed.
- Place play and pause icons in the same fixed visual box; swap/animate opacity and transform rather than inserting/removing content that changes button width.
- Reserve a stable label width sufficient for the longest state text (including `Starting…`).
- Do not use an auto-sized button whose intrinsic width is determined by `Play`, `Pause` or `Starting…`.
- Keep border, padding, icon position and baseline identical across state changes.
- On narrow screens, adapt the whole control row intentionally with breakpoints; do not let a state text change accidentally trigger a breakpoint-like wrap.

### 9.4 Stable supporting copy

- Reserve a stable block height for transport kicker/title text.
- Use tabular numerals for times and duration labels.
- Clamp or otherwise constrain long dynamic labels (for example `Switching to Edited`) so they do not resize the entire grid.
- Ensure status/error text can wrap without pushing the transport or other controls around unexpectedly.
- Reserve a predictable status area height or place status on a dedicated grid row.
- The text remains readable and is not hidden just to avoid layout changes.

### 9.5 Stable player layout

Consider converting the player top and bottom from unconstrained flexible wrapping to an intentional grid with explicit responsive layouts.

Desktop concept:

- Left: fixed-width transport button + stable transport copy.
- Right: version selector + audible-version label.
- Timeline/waveforms occupy a full-width middle row.
- Bottom controls occupy intentional columns; status gets its own stable row or reserved area.

Mobile concept:

- Transport occupies a predictable row.
- Version selector may become full-width beneath it.
- Waveform/timeline spans the card width.
- Volume and crossfade controls stack or use stable grid columns with no overflow.
- Status is a separate full-width row and must not affect control placement.

Do not force the desktop geometry onto mobile. Use explicit breakpoints and test 360/375 px as well as desktop.

### 9.6 Layout-shift instrumentation

Add a test that captures bounding boxes at key stages and confirms that the Play/Pause UI does not move surrounding player elements.

At minimum compare:

- Play button rectangle.
- Transport block rectangle.
- Version selector rectangle.
- Timeline/waveform container rectangle.
- Volume control rectangle.
- Crossfade control rectangle.
- Player outer rectangle.

Compare after `ready`, `starting`, `playing`, `switching`, `paused` and `interrupted` where testable. The text may change; geometry should remain within a small tolerance, ideally about 1 CSS px except for explicitly content-driven error/notice expansions.

Use both:

1. Deterministic component tests with deferred promises to prove immediate `Starting…` feedback and correct cancellation.
2. Playwright tests with the real browser engine to verify visible dimensions and real transitions.

Do not use a visual screenshot comparison alone as the only layout stability test.

---

## 10. Detailed implementation phases

The agent may adapt file ordering, but each phase must end in a working application and pass its relevant checks before proceeding.

### Phase 0 — Repository audit and v0.2 reproduction

**Goal:** establish the actual implementation and reproduce the reported issues before editing.

Tasks:

1. Confirm branch, current commit, tags and `package.json` version.
2. Read the latest v0.2 release notes and current README.
3. Run all existing verification commands and record results.
4. Start the local development server and preview server.
5. Inspect dark, light and system themes.
6. Inspect desktop widths (1440, 1280, 1024) and mobile widths (768, 430, 375, 360).
7. Record where the current page enters view and which elements are static.
8. Measure Play button and transport rectangles before/after Play, Starting, Pause and switch state changes.
9. Inspect range controls in Chromium and Firefox to identify which still use native-looking browser styles.
10. Verify crossfade value/engine behaviour at 80/180/600 ms.
11. Verify the current `usePlayhead` render path; do not accidentally cause the entire page to update on every animation frame.

**Deliverables:**

- A short baseline note in the agent's execution log.
- A concise list of reproduced visual/layout problems.
- No code changes until the baseline has been understood.

**Gate:** all existing tests are run and their baseline status is recorded.

### Phase 1 — Stable transport layout and Play/Pause feedback

**Goal:** remove state-change jitter before adding waveform complexity.

Tasks:

1. Inspect `PlayerSurface.tsx`, its state-derived labels and existing CSS.
2. Keep the engine as the source of truth; do not shortcut the audio state model.
3. Give the play/pause button fixed geometry across labels.
4. Use a fixed icon region for Play/Pause state visuals.
5. Stabilize transport copy dimensions and wrapping.
6. Replace accidental flex-wrap behaviour with an intentional player layout.
7. Make the bottom status area stable so changing status does not push sliders around.
8. Create responsive layouts for desktop, tablet and narrow mobile.
9. Add a deterministic test using deferred `AudioContext.resume()`/media `play()` operations.
10. Add Playwright bounding-box tests that compare the same key regions across player states.

**Do not:** remove `starting`, `switching` or `interrupted` statuses to simplify the visual work. Do not label playback as started before the underlying operation has succeeded.

**Gate:** Play/Starting/Pause does not resize the button or move adjacent controls; all v0.2 transport tests still pass.

### Phase 2 — Unified custom slider system

**Goal:** make the timeline, volume and crossfade sliders look and behave like one product family.

Tasks:

1. Create shared CSS tokens/classes or a small range component.
2. Style WebKit and Firefox tracks/thumbs explicitly.
3. Provide progress fill via a CSS custom property.
4. Keep the thumb and track hit areas touch-friendly.
5. Apply the shared system to the existing playback timeline.
6. Apply it to master volume.
7. Apply it to crossfade duration.
8. Add crossfade scale markers for minimum/default/maximum if they improve comprehension.
9. Keep all existing accessible labels and `aria-valuetext` values.
10. Verify readout widths do not change the layout.
11. Check hover, active, focus-visible and disabled appearance in both themes.
12. Check keyboard stepping and pointer dragging in Chromium and Firefox.

**Gate:** no range input relies on browser-default `accent-color` as its primary visual design; every range remains keyboard- and touch-operable.

### Phase 3 — Waveform model and asynchronous processing pipeline

**Goal:** produce compact, genuine peak data without disturbing playback.

Tasks:

1. Add a dedicated waveform module with its own types, service and lifecycle.
2. Define peak data structure and generation/request IDs.
3. Implement cancellation for replace/remove/dispose.
4. Implement a dedicated Worker for peak reduction and any safe parsing path.
5. Support a safe PCM WAV analysis path if feasible and correctly tested.
6. For other codecs, choose a feature-detected decode path with explicit size/memory limits.
7. Never assume WebCodecs is available in all supported browsers.
8. If audio needs full-file decode, estimate memory before starting.
9. Establish and document conservative memory/file thresholds.
10. Provide a fallback state for files too large or unsupported for waveform analysis.
11. Ensure waveform generation begins independently of playback and never disables Play.
12. Discard raw PCM and temporary buffers after generating compact peaks.
13. Ensure a late result for a replaced file is ignored.
14. Add deterministic worker/unit tests for peak generation, cancellation, malformed input and fallback policy.

**Gate:** peak generation is deterministic, bounded and cancellable; playback remains usable throughout.

### Phase 4 — Waveform renderer and shared timeline

**Goal:** add the actual two-row comparison waveform.

Tasks:

1. Create a waveform visualization component separate from the engine.
2. Render Original and Edited rows on a single shared duration scale.
3. Add persistent visible A/B labels.
4. Add common playhead/progress overlay.
5. Draw from downsampled peak data only.
6. Render to Canvas or an equally efficient approach with measured justification.
7. Handle `devicePixelRatio` and `ResizeObserver` safely.
8. Avoid React re-rendering the entire player at playback frame rate.
9. Use the existing playhead subscription or a dedicated, isolated visual update path.
10. Make waveform click/tap seek through the existing canonical engine operation.
11. Keep the accessible native range input as the keyboard pathway.
12. Preserve the shorter-common-duration rule and mismatch notice.
13. Add truthful preparing/ready/fallback/unavailable states.
14. Add a subtle entrance when real waveform peaks become available.

**Gate:** clicking/tapping either waveform and moving the timeline slider always seek to the same canonical time; no second playhead or independent timeline exists.

### Phase 5 — Full-page entrance and reveal system

**Goal:** animate the whole listening room, not only the hero.

Tasks:

1. Retain the existing hero entrance but align it with the overall motion system.
2. Add a reusable reveal pattern for the workspace heading, privacy line, slots, player and footnotes/footer.
3. Trigger appropriate content reveals on initial entry and when below-fold content enters the viewport.
4. Use a short stagger for Original and Edited cards.
5. Give the player card a clear but restrained entrance.
6. Give the waveform area its own data-ready reveal without replaying the page entrance.
7. Add hover/focus/pressed state transitions to dropzones.
8. Add drag-over feedback to the dropzone/card without layout movement.
9. Add subtle player active-state feedback driven by true engine status.
10. Add minimal background scroll/parallax movement only if it is smooth and inexpensive.
11. Audit reduced-motion behaviour.
12. Verify content remains visible if an animation is skipped.

**Gate:** workspace, dropzones and player no longer appear static; motion is restrained and never blocks interaction.

### Phase 6 — Visual cohesion and responsive refinement

**Goal:** make the new waveform, controls and animations feel like one coherent design.

Tasks:

1. Tune waveform colors for dark and light themes.
2. Check contrast and distinguish A/B without color alone.
3. Align slider spacing, labels and readouts.
4. Keep tabular numeric values from changing their reserved width.
5. Ensure card/player geometry is stable during state changes.
6. Inspect 360/375/430/768/1024/1280/1440 px layouts.
7. Ensure no horizontal overflow.
8. Ensure slider hit areas and waveform tap targets work on touch.
9. Ensure file cards remain understandable in waiting/loading/ready/error/fallback states.
10. Capture updated screenshots in both themes and mobile.
11. Remove unused styles and animation variants.

**Gate:** the visual design is coherent across desktop and mobile in both themes; no key interaction causes accidental wrap/shift.

### Phase 7 — Comprehensive testing and manual verification

**Goal:** verify functionality, memory safety, accessibility, and actual listening.

Tasks:

1. Run all existing v0.2 tests and preserve them.
2. Add unit tests for waveform generation, downsampling and worker lifecycle.
3. Add component tests for waveform state and controls.
4. Add E2E tests for waveform seeking and playback continuity.
5. Add E2E geometry checks for Play/Starting/Pause.
6. Add E2E tests for reduced motion and entrance visibility.
7. Add E2E tests for range slider keyboard/pointer interactions.
8. Test replacement/removal while waveform generation is pending.
9. Test oversized/unsupported waveform cases and ensure the audio player remains usable.
10. Run Chromium and Firefox suites.
11. Run WebKit suite and preserve explicit skips where the environment cannot decode local media.
12. Complete human listening pass on v0.2/v0.3 engine and record output device/browser/format.
13. Test all accessible audio formats manually where real samples are available.
14. Test at least one real mobile browser/device if available; otherwise state that only viewport emulation was tested.
15. Profile at least one long/large file within the documented analysis budget and one file that triggers fallback.

**Gate:** all automated required tests pass; manual limitations are clearly recorded and no unsupported browser/codec claims are made.

### Phase 8 — Documentation, release and deployment

**Goal:** publish a truthful and stable v0.3.0 release.

Tasks:

1. Update `README.md` with waveform/timeline behaviour and fallback limitations.
2. Update `CHANGELOG.md` with Added/Improved/Fixed/Verified sections.
3. Update `docs/audio-engine.md` only if the playback engine itself changed; otherwise keep waveform processing documented separately.
4. Add `docs/waveform.md` explaining pipeline, worker strategy, budgets, fallback and rendering.
5. Update `docs/decisions.md` with key choices and trade-offs.
6. Update `docs/browser-support.md` with actual test matrix and manual checks.
7. Update screenshots.
8. Run the complete quality gate from a clean install.
9. Build and preview through the Cloudflare Workers runtime.
10. Run preview smoke test.
11. Deploy manually through the existing deployment flow.
12. Run public smoke check against the deployed URL.
13. Verify privacy claim and absence of dev diagnostics in production.
14. Tag `v0.3.0` and publish GitHub release notes only after deployment passes.

**Gate:** public deployment is live and verified; release notes and README accurately describe the shipped build.

---

## 11. Suggested component and module boundaries

Adapt names to the actual codebase. The intent is separation of responsibilities, not a rigid folder mandate.

### 11.1 Waveform subsystem

Possible structure:

```text
src/
  waveform/
    waveformTypes.ts
    waveformService.ts
    waveformBudget.ts
    peakExtraction.ts
    waveformWorker.ts
    waveformWorkerClient.ts
    waveformFallback.ts
    peakExtraction.test.ts
    waveformBudget.test.ts
    waveformWorkerClient.test.ts

  components/
    waveform/
      ComparisonWaveform.tsx
      WaveformCanvas.tsx
      WaveformStatus.tsx
      WaveformLabels.tsx
```

If the repo uses a different module convention, follow it. Do not create empty abstractions just to match this diagram.

### 11.2 Motion/reveal components

Possible structure:

```text
src/
  components/
    motion/
      Reveal.tsx
      revealVariants.ts
```

Use a small reusable abstraction if it genuinely makes sequencing easier. Do not make a generic animation framework with dozens of props.

### 11.3 Slider styles

Prefer a shared slider class and a few variants rather than multiple separate slider implementations. Keep each control component responsible for value, labels and ARIA attributes; keep common visual styling in CSS tokens/classes.

---

## 12. Waveform algorithm and engineering rules

### 12.1 Peak downsampling

For an input audio signal, divide its duration into a bounded number of equal-duration buckets. For each bucket calculate the maximum absolute amplitude or another explicitly documented envelope statistic.

Example conceptual algorithm:

```text
bucketCount = min(maxDisplayBuckets, max(1, floor(renderWidth * targetDensity)))
samplesPerBucket = sampleCount / bucketCount

for each bucket:
    peak = max(abs(samples[i])) across this bucket
    output[bucket] = clamp(peak, 0, 1)
```

Do not implement this loop in a frequently re-rendering React component.

### 12.2 Channel policy

Choose and document one initial policy:

- **Mono envelope:** combine channels per sample/bucket by maximum absolute channel amplitude. Simpler and compact.
- **Stereo rows:** render separate left/right envelopes. More informative, but increases UI and rendering work.

For v0.3, prefer mono envelope unless stereo adds a clearly measurable user benefit. Do not add a complex multichannel editor layout.

### 12.3 Worker messages

Use typed messages and request IDs. A conceptual design:

```ts
type WaveformRequest = {
  type: 'analyze';
  requestId: string;
  fileGeneration: number;
  file: File;
  bucketCount: number;
};

type WaveformCancel = {
  type: 'cancel';
  requestId: string;
};

type WaveformSuccess = {
  type: 'success';
  requestId: string;
  fileGeneration: number;
  durationSeconds: number;
  peaks: ArrayBuffer;
};

type WaveformFailure = {
  type: 'failure';
  requestId: string;
  fileGeneration: number;
  reason: 'unsupported' | 'too-large' | 'decode-failed' | 'cancelled' | 'internal';
};
```

This is illustrative. Use actual shared types and transfer lists. Do not serialize large typed arrays to JSON.

### 12.4 Cancellation and stale results

- Each audio slot already has a file generation concept in the audio engine. The waveform pipeline needs equivalent generation identity.
- Increment/invalidate waveform generation when a file is replaced or removed.
- On worker result, compare generation before committing the peaks to React state.
- On unmount/dispose, cancel active work and release object URLs/buffers.
- Do not let a cancelled operation update status from a newer file.
- Handle rapid A then B replacement and repeated file selection.

### 12.5 Fallback rules

- If waveform generation is over budget, leave audio playable and show a non-error fallback.
- If only one waveform succeeds, show the available one and explain the other; do not invent a matching shape.
- If both fail, preserve the standard timeline and all A/B controls.
- If the Worker fails to initialize, use the safe bounded fallback only if memory permits. Otherwise use progress line only.
- If the page is in reduced-motion mode, waveform rendering still occurs; only the decorative reveal is reduced.

### 12.6 No audio-engine coupling

Do not:

- Create a second `AudioContext` just to animate the waveform in real time.
- Read live audio samples from the playback graph in v0.3.
- Change gain nodes or media element routing to render the waveform.
- Store waveform peaks in the existing player snapshot if that would cause high-frequency or unnecessary player rerenders.
- Re-decode media on every A/B switch.

The waveform should be a static file-derived preview with a moving shared playhead overlay.

---

## 13. Playwright and unit test plan

Keep the existing test commands and extend the existing suites. Give new tests unique descriptive names and do not rely on timing-only assertions where deterministic state checks are possible.

### 13.1 Unit tests — peak extraction

Cover:

- empty input;
- all-zero/silent PCM;
- single impulse;
- constant amplitude;
- positive and negative peaks;
- values outside expected range (clamp/validation);
- odd sample count and final partial bucket;
- mono and stereo channel policy;
- bucket count of 1;
- maximum bucket count cap;
- non-finite samples;
- deterministic output for same input/configuration;
- extremely short clips;
- source array length not divisible by bucket count.

### 13.2 Unit tests — resource policy

Cover:

- normal-sized file accepted;
- file size over limit falls back;
- estimated decoded size over budget falls back;
- unknown duration uses conservative behaviour;
- unsupported Worker capability does not crash;
- `navigator.deviceMemory` unavailable;
- low reported device memory triggers conservative budget if that feature is used;
- no negative, NaN or infinite budget calculations.

### 13.3 Unit tests — Worker lifecycle

Cover:

- success returns compact transferable peak data;
- error path resolves to an unavailable/fallback result;
- cancellation stops/ignores the task;
- stale request ID ignored;
- stale file generation ignored;
- replace Original while Original analysis is running;
- replace Edited while Edited analysis is running;
- remove a file while analysis is pending;
- dispose/unmount while analysis is pending;
- one slot failing does not cancel the other slot's valid result.

### 13.4 Component tests — waveform UI

Cover:

- empty state;
- preparing state;
- ready state with both waveforms;
- one waveform fallback;
- both waveform fallback;
- duration mismatch labels;
- active Original/Edited visual emphasis;
- waveform labels are accessible;
- seek control remains available when waveform is missing;
- theme changes update colors without rebuilding data;
- no fake/generated peaks displayed for unavailable state.

### 13.5 E2E tests — waveform and seeking

Add deterministic generated test fixtures where possible.

1. Load two generated WAV files; wait for audio readiness and waveform readiness independently.
2. Confirm Play becomes available before waveform generation completes (use a delayed test worker/fixture).
3. Click near 25% on Original waveform; confirm both media decks seek to the same time.
4. Click near 70% on Edited waveform; confirm the same canonical time is reflected in both decks.
5. Seek using the native timeline range; confirm waveform playhead matches.
6. Start playback; confirm the waveform playhead advances.
7. Switch A/B during playback; confirm waveform playhead does not reset.
8. Pause/resume; confirm waveform position is preserved.
9. End the common duration; confirm the playhead stops at the shorter endpoint.
10. Load a duration-mismatch pair; confirm both waveforms share the same time scale and the mismatch is clear.
11. Replace a file during analysis; confirm no stale old peaks appear.
12. Remove a file during analysis; confirm the corresponding waveform clears.
13. Trigger waveform fallback; confirm audio playback still works.
14. Confirm no network request is made for audio or peaks.

### 13.6 E2E tests — entrance and motion

- Workspace heading is visible and enters the viewport smoothly.
- Original and Edited slots both reveal; they do not remain hidden.
- Player surface reveals when it enters the viewport.
- Scrolling down reveals lower content once.
- Scrolling away and back does not repeatedly replay disruptive animations.
- Waveform appears after actual peak data is ready.
- Reduced-motion mode shows all content immediately/without travel animation.
- Controls remain clickable during entrance animation; animation must not cover pointer targets.
- The page has no horizontal overflow at 360 px.

Do not make tests brittle by asserting exact intermediate animation frames. Assert visible completion, no permanently hidden content, correct state and accessible interactions.

### 13.7 E2E tests — slider controls

- Master volume slider starts at 100%.
- Adjusting volume changes the displayed percentage and engine value.
- Mute/unmute continues to work.
- Crossfade starts at 180 ms.
- Minimum 80 ms and maximum 600 ms are reachable.
- Keyboard arrows adjust ranges correctly.
- `aria-valuetext` reports milliseconds and percentage/time accurately.
- Sliders are visible and operable in both themes.
- Sliders do not overflow at 360/375 px.
- Range readout changes do not move other controls.

### 13.8 E2E tests — Play/Pause stability

- Click Play; immediate state becomes `Starting…` while deferred start work is pending.
- Resolve startup; state transitions to actual Playing/Pause state.
- Click Pause; button responds promptly and playback stops.
- Click Pause while Starting; pending work is cancelled and late media promise cannot resume playback.
- Click Play again; playback restarts correctly.
- Switch A/B; Play/Pause button geometry remains stable.
- Interrupted state and recovery text do not move controls.
- Compare bounding boxes of key player elements across states. Allow approximately 1 CSS px tolerance for fixed regions, excluding explicit notices that are supposed to appear/disappear.

### 13.9 Performance tests

At minimum, measure or inspect:

- initial app load / no waveform work before files are selected;
- waveform processing on representative short files;
- a larger file which must fall back;
- memory release when files are replaced or removed;
- no render-per-sample behaviour;
- no large canvas dimensions beyond expected cap;
- no full application rerender at every playhead tick;
- no unbounded Worker task accumulation.

A full benchmark suite is not required, but the agent must record representative file sizes, duration, browser, and observed processing time/memory strategy.

---

## 14. Accessibility requirements

- Preserve the skip link and logical tab order.
- Native range inputs remain in the tab order.
- File selection remains keyboard accessible through the visible dropzone buttons.
- Waveform visuals should not be the only method of seeking.
- Provide accessible labels for Original and Edited waveform regions.
- Provide a text description for waveform-unavailable/fallback state.
- Do not announce every playhead animation frame to screen readers.
- Announce meaningful playback status changes through the existing polite live region.
- Avoid `aria-live` on the continuously changing elapsed time.
- Keep visible focus rings on buttons, range controls and waveform seek controls.
- Ensure A/B identification is not color-only.
- Ensure text and control contrast in dark and light themes.
- Ensure 44 px touch target where appropriate, or provide a sufficiently large surrounding hit area.
- Respect reduced motion without disabling functional audio transitions.

---

## 15. Theme and responsive design requirements

### 15.1 Dark and light themes

- Use existing theme variables as the source of truth.
- Add waveform colors using theme variables; do not hardcode dark-only colors in component code.
- Slider rail, fill, thumb, focus ring and disabled states must be legible in both themes.
- Motion should not cause a theme flash or hide the content before the theme resolves.
- Avoid adding external fonts or images.

### 15.2 Responsive sizes

Test at least:

| Viewport width | Required layout                                                                            |
| -------------: | ------------------------------------------------------------------------------------------ |
|         360 px | Narrow mobile, no horizontal overflow, single-column slots and stacked controls if needed. |
|         375 px | Common mobile viewport, readable waveform labels and usable slider hit areas.              |
|         430 px | Larger phone, make use of width without stretching controls awkwardly.                     |
|         768 px | Tablet layout; no awkward partial desktop grid.                                            |
|        1024 px | Compact desktop/tablet; controls remain balanced.                                          |
|        1280 px | Standard desktop two-slot layout.                                                          |
|        1440 px | Wide desktop, balanced content width and waveform scale.                                   |

### 15.3 Layout stability

- Keep the outer player card geometry stable during Play/Pause/switching state changes.
- Keep controls from jumping to new rows because a readout becomes a few characters longer.
- Use `min-width: 0`, `min-height`, grid columns and stable labels intentionally.
- Avoid absolute-positioning important text solely to prevent reflow.
- Error notices may expand the content when necessary, but normal playback states must not cause unpredictable shifts.

---

## 16. Performance and reliability constraints

- Playback is the priority. Waveform computation is secondary.
- Never render per-sample DOM elements.
- Never rerun peak extraction on every render or every theme change.
- Do not decode both files into full PCM and retain both buffers indefinitely.
- Use a bounded worker queue; do not allow multiple repeated requests for the same slot to accumulate.
- Cancel stale work on file generation change.
- Keep Canvas render work bounded by display size and capped peak count.
- Keep the moving playhead separate from static waveform rendering.
- Avoid frequent DOM reads/writes in scroll handlers. Do not force synchronous layout repeatedly.
- Entrance animations should use opacity/transform and not trigger layout recalculation.
- Avoid blur/backdrop-filter animations across large areas.
- Keep background grain/grid static or very lightly animated.
- Do not introduce heavy animation or waveform dependencies without measured benefit.
- Check production bundle size before/after. Any substantial increase must be explained.
- Keep `window.__switchroom` diagnostics development-only.

---

## 17. Error handling and fallback copy

Use concise, actionable language. Do not expose raw browser exception strings to end users.

Suggested copy (wording may be refined):

| Condition                       | User-facing behaviour                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Preparing peaks                 | “Preparing waveform…”                                                                       |
| Too large for waveform analysis | “Waveform preview skipped for this file. Playback and seeking still work.”                  |
| Unsupported analysis codec      | “Waveform preview is unavailable for this format in this browser. Playback may still work.” |
| Worker/analysis failure         | “Could not create this waveform. You can still compare the audio.”                          |
| Stale/cancelled request         | No error announcement; silently discard stale work.                                         |
| File replaced                   | Clear old peaks immediately; show preparing state for the new file.                         |
| File removed                    | Clear peaks and return that row to empty state.                                             |
| Both waveform paths unavailable | Keep standard progress timeline available.                                                  |

Do not show a waveform error as if playback itself failed. The two systems are separate.

---

## 18. Documentation updates

### 18.1 `README.md`

Update the v0.3 feature summary to include:

- stacked/aligned Original and Edited waveform previews;
- shared playhead and waveform seeking;
- worker-assisted/downsampled peak generation where available;
- fallback for large/unsupported analysis files;
- the fact that playback remains available if waveform preview cannot be created;
- refined entrance motion and custom range controls.

Be clear that waveform generation is local-only and does not upload audio.

### 18.2 `docs/waveform.md` — new

Document:

- peak data model;
- decode strategy by file/browser capability;
- Worker responsibilities;
- supported waveform paths and limitations;
- memory/file-size budgets;
- cancellation/generation identity;
- rendering strategy;
- fallback UI;
- test coverage;
- manual performance verification.

### 18.3 `docs/audio-engine.md`

Only change this if the playback engine itself changes. Explain clearly that waveform is not part of the Web Audio playback graph and does not own the canonical playhead.

### 18.4 `docs/decisions.md`

Record:

- why the waveform subsystem is separate from the playback engine;
- chosen waveform decode/analysis strategies and limitations;
- why WebCodecs is optional rather than required;
- memory thresholds and fallback policy;
- why a Canvas/other renderer was selected;
- page motion and layout-stability decisions.

### 18.5 `docs/browser-support.md`

Update the exact browser matrix. Distinguish:

- audio playback tests;
- waveform generation tests;
- UI/slider tests;
- motion/reduced-motion tests;
- branded browser manual tests;
- test environment skips.

Do not mark Safari/Chrome Android as manually verified merely because Playwright WebKit/Chromium passed on desktop Windows.

---

## 19. Release quality gate

Do not publish v0.3.0 until every required check is complete.

### 19.1 Clean-install verification

```bash
npm ci
```

### 19.2 Static quality

```bash
npm run format:check
npm run lint
npm run typecheck
```

### 19.3 Unit/component suite

```bash
npm test
```

### 19.4 Browser tests

```bash
npm run test:e2e
```

Then run the full local browser matrix where installed:

```bash
npm run test:e2e:all
```

WebKit skips must retain explicit reasons. Do not count skipped audio tests as passing audio coverage.

### 19.5 Production build and preview

```bash
npm run build
npm run preview
npm run smoke
```

### 19.6 Visual checks

With the preview server running:

```bash
npm run screenshots
```

Inspect screenshots in:

- Desktop dark.
- Desktop light.
- Mobile 360 px.

Also manually inspect at 375/430/768/1024/1280/1440 px, especially the waveform/player/slider area.

### 19.7 Manual listening checklist

Complete and record:

- Load two real WAV files with similar duration.
- Listen to Original then switch to Edited mid-play.
- Switch back and forth repeatedly.
- Test crossfade durations 80 ms, 180 ms and 600 ms.
- Change crossfade setting during an active fade and confirm current fade completes normally.
- Pause/resume during a fade.
- Seek from each waveform row and from the timeline slider.
- Confirm both decks remain aligned.
- Listen at the shortest/longest common duration boundary.
- Listen to files with noticeably different lengths.
- Test volume slider and mute/unmute.
- Confirm waveform failure/fallback does not affect playback.
- Listen for clicks, pops, gaps, sudden jumps, dropouts or other audible artifacts.

Record browser, OS, output device, source formats and observations. If no real audio hardware test was possible, say so.

### 19.8 Manual format check

Attempt real examples of:

- WAV;
- MP3;
- FLAC;
- AAC;
- M4A.

Record both playback result and waveform result separately. A file can play while waveform analysis falls back.

### 19.9 Privacy smoke test

Confirm:

- no audio upload requests;
- no waveform/peak upload requests;
- no third-party analytics/network calls;
- no file bytes or metadata persisted to browser storage;
- theme is still the only persistent application setting;
- no dev diagnostic hook in production.

### 19.10 Deploy and public smoke test

Only after all preceding gates:

```bash
npm run deploy
```

Then:

```bash
SMOKE_URL=https://switchroom.<your-workers-subdomain>.workers.dev npm run smoke
```

PowerShell example:

```powershell
$env:SMOKE_URL = 'https://switchroom.<your-workers-subdomain>.workers.dev'; npm run smoke
```

Use the actual deployed URL printed by Wrangler. Do not guess.

### 19.11 Release publication

- Update package version to `0.3.0`.
- Update changelog and README.
- Confirm production build and public smoke passed.
- Confirm manual limitations are recorded.
- Create git tag `v0.3.0`.
- Publish GitHub release notes only after the public deployment is verified.

---

## 20. Definition of Done — v0.3.0

### Waveform and timeline

- [ ] Original waveform preview displays when analysis succeeds.
- [ ] Edited waveform preview displays when analysis succeeds.
- [ ] Both use one shared time axis and common duration policy.
- [ ] One playhead spans both rows.
- [ ] Clicking/tapping either row seeks both decks through the existing engine.
- [ ] Native timeline slider seeks to the same canonical position.
- [ ] Playhead advances during playback without redrawing every peak.
- [ ] A/B switching does not reset waveform position.
- [ ] Duration mismatch remains truthful and visually aligned.
- [ ] Peak arrays are downsampled and bounded.
- [ ] Waveform processing is cancellable and generation-safe.
- [ ] Large/unsupported files fall back gracefully.
- [ ] Playback remains available while waveform is preparing or unavailable.
- [ ] No file/audio/peak data is sent to a server.

### Animation

- [ ] Header/hero entrance remains polished.
- [ ] Workspace heading and privacy note have an entrance/reveal.
- [ ] Both file slots/dropzones reveal with a restrained stagger.
- [ ] Player surface and waveform area reveal when entering view.
- [ ] Footnote/footer entrance is subtle and not distracting.
- [ ] Dropzone hover/focus/press/drag states have clear feedback.
- [ ] Player active state reflects actual engine state.
- [ ] Scroll effects are subtle, performant and disabled/reduced as appropriate.
- [ ] No important UI remains invisible if motion is reduced or skipped.
- [ ] No perpetual decorative animation distracts from listening.

### Sliders and player stability

- [ ] Timeline slider shares the visual range-control system.
- [ ] Volume slider no longer looks like a browser-default range input.
- [ ] Crossfade slider no longer looks like a browser-default range input.
- [ ] Sliders work in Chromium and Firefox.
- [ ] Sliders remain keyboard accessible.
- [ ] Sliders are usable on touch devices.
- [ ] Crossfade min/max/default remain 80/600/180 ms.
- [ ] Play button dimensions remain stable through Play/Starting/Pause.
- [ ] Surrounding player controls do not jump when status labels change.
- [ ] Status remains truthful and accessible.

### Regression and release

- [ ] Existing v0.1/v0.2 tests still pass.
- [ ] New waveform unit/component/E2E tests pass.
- [ ] New Play/Pause geometry tests pass.
- [ ] New slider and reduced-motion tests pass.
- [ ] 360 px layout has no horizontal overflow.
- [ ] 1440 px layout remains balanced.
- [ ] Both themes are visually verified.
- [ ] Browser-support and human listening records are updated honestly.
- [ ] Format, lint, type-check, unit, browser, build and smoke commands pass.
- [ ] Public Cloudflare deployment passes smoke test.
- [ ] v0.3.0 release tag and notes are created only after deployment verification.

---

## 21. Agent completion report

When finished, provide a concise but evidence-based report containing:

1. **Version:** final package version/tag and deployed URL.
2. **What changed:** waveform, timeline, motion, slider and layout stability changes.
3. **Architecture:** waveform generation strategy, Worker responsibilities, decode limitations and memory budgets.
4. **Files changed:** grouped by waveform, UI/motion, styles, tests and docs.
5. **Tests:** exact command results and counts for Vitest, Chromium, Firefox and WebKit; list skips separately.
6. **Manual checks:** browser, OS, audio formats, output device and listening observations.
7. **Performance:** sample files tested, waveform processing time, fallback triggers and resource policy.
8. **Privacy:** confirmation that local audio and peak data remain local; list any network/storage verification.
9. **Known limitations:** unsupported codecs, browsers or waveform fallbacks that remain.
10. **Deployment:** build/preview/public smoke results and release/tag confirmation.
11. **Deferred work:** explicitly confirm that no v0.4+ features were added.

Do not claim completion based only on a successful build. A completed v0.3 release requires the functional tests, layout/animation verification, truthful browser-support record, privacy checks and deployment checks above.

---

## 22. Technical references for the agent

These are reference documents, not instructions to adopt a specific library.

- [Switchroom repository](https://github.com/Fettah010/switchroom)
- [Switchroom v0.2.0 release](https://github.com/Fettah010/switchroom/releases/tag/v0.2.0)
- [Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Web Audio API best practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [BaseAudioContext.decodeAudioData() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [WebCodecs API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [AudioDecoder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder)
- [WebCodecs codec selection — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)
- [Audio codecs and browser compatibility — MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)
- [Motion for React documentation](https://motion.dev/docs/react)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

Implementation considerations drawn from those references:

- `decodeAudioData()` decodes complete encoded file data rather than arbitrary fragments. Treat its full-file memory footprint as part of the resource budget.
- Web Audio is a good fit for actual audio playback and gain routing; keep the existing HTMLMediaElement/two-deck design for full-length files.
- `AudioDecoder` is not a universal baseline API. It may be available in Dedicated Workers on supporting browsers, but v0.3 must feature-detect and provide a fallback.
- The browser's codec support varies by format, container and platform. Do not promise that every accepted extension will decode for waveform analysis.

---

## 23. Final instruction

Build **v0.3.0 only**: a more visual, expressive and polished local A/B listening room with genuine waveforms, an expressive shared timeline, a full-page but restrained entrance system, custom sliders and a stable Play/Pause UI.

Preserve the v0.2 playback engine, privacy model, deployment method and working tests. Make the experience feel more alive without sacrificing speed, clarity, accessibility or smooth audio.

Do not drift into project persistence, cloud storage, accounts, sharing or client review. Those belong to later milestones.
