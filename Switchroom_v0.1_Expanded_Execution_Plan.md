# Switchroom v0.1.0 — Expanded Implementation & Release Plan

> **Document type:** Standalone execution handoff for a local coding agent  
> **Project:** Switchroom — open-source audio A/B review tool  
> **Milestone:** `v0.1.0` — Public foundation and first working synchronized A/B player  
> **Target release:** First publicly deployed, genuinely usable version  
> **Architecture:** React + TypeScript + Vite, deployed as Cloudflare Worker Static Assets  
> **Operating mode:** Local-first, no account, no server-side audio storage  
> **Prepared:** 8 November 2026  
> **Status:** Implementation specification

---

## 0. Instructions to the implementation agent

You are implementing **only Switchroom v0.1.0**. This document is the acceptance contract for this milestone. Read it fully before making changes.

Your job is to produce a finished, tested, documented, publicly deployable first release—not a mock-up, design prototype, empty scaffold, or partial audio demo.

### 0.1 Required operating behaviour

1. Inspect the existing repository and working tree before changing anything. Preserve existing user work. Do not overwrite or delete unrelated files.
2. If the repository is empty, scaffold the application. If an implementation already exists, audit it and adapt it rather than blindly recreating it.
3. Use current stable versions of the required tools that are mutually compatible. Verify package APIs and Cloudflare deployment instructions against official documentation at implementation time. Commit the lockfile.
4. Implement the milestone in small, complete vertical slices. Each slice must build and pass its relevant tests before moving on.
5. Do not stop after producing a plan or a visual shell. Finish the functional player, automated tests, accessibility checks, deployment configuration, documentation and release preparation.
6. Do not invent credentials, account IDs, repository URLs, deployment URLs or successful test results. Use already configured credentials where available. If a human-only sign-in or external action is required, complete all local work first and report the exact remaining action.
7. Do not enable paid plans, add billing, purchase a domain, or create a resource that can incur charges. The v0.1 app needs only static hosting.
8. Do not add features from later milestones just because they are easy to scaffold. Keep the architecture clean enough to extend, but do not build future systems early.
9. When a requirement is ambiguous, prefer the smallest implementation that meets the stated behaviour. Record any meaningful assumption in `docs/decisions.md`; do not block progress with questions about non-essential implementation details.
10. Never claim a feature or release is complete unless the corresponding checks were actually run and passed.

### 0.2 What success looks like

A first-time visitor opens the live public site, selects one Original file and one Edited file, presses Play, switches between A and B while playback continues at the same point, hears a real smooth audio crossfade, seeks the shared timeline, pauses/resumes, and changes the theme. The visitor does not need an account. The audio files are not uploaded to Switchroom.

The repository must also build from a clean checkout, pass the test suite and have a `v0.1.0` release tag after the public deployment has been smoke-tested.

### 0.3 Do not wait for later versions

The v0.1 player must work independently. Do not create disabled buttons for cloud saving, share links, accounts, comments, feedback, waveform analysis or downloads. Those capabilities are not part of this release and should not appear as broken or misleading UI.

---

## 1. Product scope

### 1.1 v0.1 product statement

Switchroom is a refined, local-first web tool for listening to two versions of the same recording. The first version provides one synchronized A/B player. The listener can choose **Original** or **Edited** at any moment without restarting the playhead. When playback is active, the outgoing version fades down as the incoming version fades up.

The application is a comparison/presentation tool, not an audio editor, DAW, mastering processor or file-hosting service.

### 1.2 Confirmed product requirements

| Area                | v0.1 requirement                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Primary interaction | One synchronized A/B player, one playhead and one transport                                             |
| Audio inputs        | One Original file and one Edited file                                                                   |
| Accepted extensions | `.wav`, `.mp3`, `.flac`, `.aac`, `.m4a`                                                                 |
| Playback            | Play, pause, seek, display current time and common duration                                             |
| Switching           | Switch A/B without restarting playback                                                                  |
| Audible transition  | Real Web Audio gain crossfade, nominally 180 ms                                                         |
| Volume              | One master volume/mute control                                                                          |
| Duration mismatch   | Use the shorter playable duration as the common timeline and explain the mismatch                       |
| File handling       | Local browser `File` objects and temporary object URLs only                                             |
| Accounts            | None in v0.1                                                                                            |
| Storage             | No server storage, no cloud upload, no persistent audio storage                                         |
| Theme               | System preference by default, manual System / Dark / Light override                                     |
| Layout              | Responsive desktop, tablet and mobile                                                                   |
| Visual style        | Premium minimal / experimental, atmospheric, deliberate, highly polished but restrained                 |
| Motion              | Micro-interactions, restrained scroll reveals and smooth page-state transitions; respect reduced motion |
| Public release      | Public GitHub repository and public Cloudflare deployment                                               |

### 1.3 Strictly out of scope

Do **not** implement any of the following in v0.1:

- User registration, login, OAuth, guest identity or account management.
- Cloudflare D1, R2, KV, Durable Objects, Supabase or any database.
- Worker API routes, Hono, server-side logic or a separate backend service.
- File uploads to a server, presigned URLs, multipart/resumable uploads or cloud playback.
- Public, unlisted, password-protected or expiring share links.
- Client review pages, client voting, preferred-version submission, comments or replies.
- Audio downloads, exports, rendering, conversion or transcoding.
- Waveform analysis, spectrograms, loudness measurement, normalization or audio processing beyond the crossfade and master volume.
- EQ, compression, mixing, mastering, noise reduction or AI features.
- Persistent projects, local project database, IndexedDB, File System Access API or project restoration after refresh.
- PWA/offline-install functionality, service workers, analytics, tracking or advertising.
- Multi-track comparisons or more than two input files.

The audio files must remain in the visitor's browser. The only persistence allowed in v0.1 is a small theme preference in `localStorage`.

### 1.4 Local-only privacy promise

Display a concise, visible privacy statement near the file slots or workspace:

> **Local-only listening.** Your audio stays in this browser. Switchroom does not upload or store your files.

This statement must remain true in the implementation. Do not add third-party analytics, telemetry, external audio APIs or remote audio processing. Do not send file names, file metadata or file bytes to a server. The app's normal static website requests to Cloudflare are expected; user audio is not part of those requests.

Be explicit that a comparison is temporary: refreshing or closing the page clears the selected files, and the user must select them again. Do not imply that projects are saved.

---

## 2. User journeys and screen behaviour

### 2.1 First visit

1. Visitor opens the public root URL.
2. The page loads in System theme unless a prior manual preference is saved.
3. The visitor understands the product within a few seconds: compare an original recording against an edited one, synchronized in one player.
4. The visitor sees the two file slots and can start immediately; do not put a signup, modal, tutorial or multi-step onboarding in front of the workflow.
5. The player is inactive until both files have loaded successfully.

### 2.2 Load the two recordings

1. Visitor selects a file for **Original** using the file picker or drag-and-drop.
2. The slot displays the file name, extension/format label, readable file size and loading state.
3. The app reads media metadata locally and confirms that the browser can load the file.
4. Visitor selects the **Edited** file; the same validation and metadata process runs.
5. Once both files are ready, the player becomes available.
6. The player displays the common duration. If the source durations differ, show a concise non-blocking notice that comparison playback ends at the shorter duration.

Either file can be replaced or removed independently. Removing one file returns the player to a waiting state without crashing or leaving the previous file playing.

### 2.3 Listen and switch

1. Visitor presses the main Play control.
2. The application activates/resumes its `AudioContext` from the user gesture and starts both synchronized audio elements.
3. Only the selected deck is audible; the other deck runs at zero gain so it is ready for an immediate switch.
4. Visitor presses Original or Edited.
5. The player changes its active-version state and performs a real gain ramp between the two decks.
6. The shared playhead continues forward; the playback position must not reset to zero or jump to a different timestamp.
7. Visitor can switch repeatedly, pause during a fade, seek, resume and switch again.

### 2.4 End and reset

- Playback stops at the common duration, not at the longer file's end.
- Pressing Play after reaching the end restarts from zero.
- Pressing Pause stops both decks, not just the audible deck.
- Seeking updates both decks to the same target time.
- Replacing a file disposes of the old media source/object URL safely and loads the new file.
- Navigating away or unmounting the player pauses both decks, closes the audio context where safe, removes event listeners and releases object URLs.

---

## 3. Technical decisions for v0.1

### 3.1 Required stack

| Layer                | Decision                                                                                                    | v0.1 use                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Language             | TypeScript, strict mode                                                                                     | App, audio engine and tests                                     |
| UI                   | React                                                                                                       | Single-page application                                         |
| Build/dev            | Vite                                                                                                        | Development server and production build                         |
| Hosting              | Cloudflare Workers Static Assets, using the supported Vite integration                                      | Public static application; no application API in this milestone |
| Styling              | CSS variables + component CSS; Tailwind only if it is already part of the scaffold and is used consistently | Visual system and responsive layout                             |
| Motion               | Motion for React (`motion` package) for meaningful transitions; CSS for simple hover/focus states           | Page/section reveals and interaction motion                     |
| Audio                | HTMLAudioElement + Web Audio API                                                                            | Two local media decks, GainNodes and master volume              |
| Unit/component tests | Vitest + React Testing Library + `@testing-library/user-event`                                              | Pure logic, component behaviour and mocked boundary tests       |
| Browser tests        | Playwright Test                                                                                             | Real browser flow with local generated audio fixtures           |
| Formatting/linting   | Prettier + ESLint with TypeScript and React rules                                                           | Consistent source and CI                                        |
| CI                   | GitHub Actions                                                                                              | Verify PRs and main branch                                      |

Do not add a general-purpose UI component framework. The application should have a bespoke interface. A small icon package such as `lucide-react` is acceptable if needed; avoid a large set of unrelated dependencies.

Use npm and commit `package-lock.json`. Pin a currently supported Node.js LTS version in `.nvmrc` or `.node-version`; confirm the selected Node version satisfies the installed Vite, Vitest and Cloudflare tooling requirements.

### 3.2 Hosting and deployment approach

Use the current official Cloudflare Vite plugin workflow for a React SPA deployed with Workers Static Assets. Start from the current official React/Vite/Cloudflare template or adapt a standard React TypeScript Vite project according to the current Cloudflare guide.

The final build must:

- Serve the Vite-built client assets from Cloudflare Static Assets.
- Have SPA fallback configured so the application root works reliably on direct navigation and refresh.
- Use the generated/current Wrangler configuration supported by the installed plugin version.
- Deploy with the official Wrangler workflow.
- Require no D1, R2, KV, secrets, OAuth credentials or environment variables in v0.1.
- Use a free `workers.dev` address unless a public URL is already configured.

Do not create a backend Worker API just to make the application appear full-stack. This milestone intentionally has no backend. Keep the file structure clean so future Worker routes can be added later, but add no empty API, fake endpoints or unused services now.

Before deployment, verify the current Cloudflare guide and scaffold output. Do not copy old `wrangler.toml`/Vite plugin configuration blindly; the plugin and generated configuration can change. A correct static deployment is more important than preserving a specific config shape from this document.

### 3.3 No client-side audio persistence

- Use `File` objects from `<input type="file">` or drag-and-drop.
- Use `URL.createObjectURL(file)` for local playback.
- Do not use `fetch()` to send the audio anywhere.
- Do not write file bytes to `localStorage`, `sessionStorage`, IndexedDB or Cache Storage.
- Do not add a service worker.
- Revoke each object URL after its media element no longer uses it and during cleanup.
- Persist only the user's manual theme choice.

---

## 4. Audio engine specification

The audio engine is the most important technical deliverable in v0.1. It must be implemented as an isolated module, not as a large collection of event handlers embedded in the page component.

### 4.1 Required design

Implement a framework-independent `ABAudioEngine` (or similarly named class/module) that owns:

- One Original `HTMLAudioElement`.
- One Edited `HTMLAudioElement`.
- One `AudioContext` created/resumed as part of an explicit user playback gesture.
- One `MediaElementAudioSourceNode` per audio element, created only once for that element.
- One per-deck `GainNode`.
- One master `GainNode` for volume/mute.
- A canonical transport state and active deck.
- Object URL references and media event listener cleanup.
- A subscription/event mechanism for React to observe state changes.

Recommended signal graph:

```text
Original <audio> -> Original MediaElementSource -> Original Gain --+
                                                                  +--> Master Gain -> AudioContext.destination
Edited   <audio> -> Edited   MediaElementSource -> Edited   Gain --+
```

Do not connect both media elements directly to the output in addition to the graph. The signal must pass through the GainNodes so the inactive deck can be silent and both decks can be crossfaded.

### 4.2 Playback state contract

Expose a small typed snapshot. Suggested shape (adapt names if the implementation has an equally clear contract):

```ts
type AudioVersion = 'original' | 'edited';
type PlayerStatus = 'empty' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

interface DeckInfo {
  fileName: string | null;
  fileSize: number | null;
  extension: string | null;
  duration: number | null;
  ready: boolean;
  error: string | null;
}

interface ABPlayerSnapshot {
  status: PlayerStatus;
  activeVersion: AudioVersion;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0..1
  muted: boolean;
  crossfadeMs: number; // default 180; may be a constant in v0.1 UI
  original: DeckInfo;
  edited: DeckInfo;
  durationMismatch: boolean;
  globalError: string | null;
}
```

The engine must expose operations equivalent to:

```ts
loadFile(version, file);
removeFile(version);
play();
pause();
seek(seconds);
switchTo(version);
setVolume(value);
setMuted(value);
subscribe(listener);
getSnapshot();
dispose();
```

This is an API shape, not a demand to use this exact class layout. Keep the UI independent from the engine's internal media elements.

### 4.3 One canonical timeline

- The common timeline duration is `min(original.duration, edited.duration)` once both durations are finite and valid.
- Clamp seek positions to `[0, commonDuration]`.
- Both media elements must seek to the same target.
- Both elements must share the same playback rate (use `1.0` only in v0.1; no speed control required).
- The active deck is the source of truth for the visible current time, but the inactive deck must be aligned before it is made audible.
- Update the displayed time smoothly without forcing a full-page React render on every audio clock tick. Isolate progress updates to the timeline component or use a small, throttled subscription.
- Never derive the common playhead from the wall clock; use the media element's actual playback time.

### 4.4 Synchronization model

For the baseline implementation, both decks should be started by the same Play user action and kept running together while playback is active. The inactive deck has gain `0`, not a separate independent pause state. This makes A/B switching immediate and avoids a cold-start delay each time the listener changes versions.

Before a deck becomes audible:

1. Verify that its metadata is ready and playback has not failed.
2. Compare its `currentTime` with the canonical/active deck time.
3. If the difference is beyond a small tolerance (start with 50 ms), seek the target deck to the canonical time and wait for `seeked`/sufficient readiness before beginning the fade.
4. If it cannot be made ready, retain the current audible deck and show a local error; do not abruptly switch to silence.

Handle browsers that reject `play()` on one element. If either deck fails to start, pause both and show a useful error rather than leaving them in a split state.

### 4.5 Crossfade specification

- Nominal crossfade duration: **180 ms**.
- A shorter/longer constant may be selected after listening tests, but do not add a settings panel for crossfade duration in v0.1.
- The transition must be performed with `AudioParam` automation on the two `GainNode`s. Do not implement the audio transition with CSS, `HTMLAudioElement.volume` alone, or a visual-only animation.
- Use a linear amplitude crossfade as the initial default because original/edited versions are likely to contain highly correlated programme material; an equal-power crossfade can raise level when correlated copies overlap.
- Outgoing deck: ramp from its current gain to `0`.
- Incoming deck: ramp from its current gain to `1`.
- Keep master volume independent of A/B switching.
- The A/B active state and accessible label must update predictably as the switch is initiated. The audible transition may finish over 180 ms.
- If a second switch occurs during a fade, cancel/rebase the current automation from the actual interpolated gain values and schedule the new target. Do not stack competing ramps or create a volume jump.
- If paused, switching can set the gain targets immediately because no audio is audible; the selected version must be correct on resume.
- Pausing during a fade must not leave an unstable gain state. Either allow the short fade to complete silently or snap to the selected deck's final target before resume; document and test the chosen behaviour.
- Avoid clipping or accidental double-volume output. Do not apply loudness normalization or auto-gain in this release.

The engine should schedule automation against `audioContext.currentTime`, not against `setTimeout`. If `cancelAndHoldAtTime` is not supported in a target environment, implement a reliable interpolation-based fallback; do not assume `AudioParam.value` always represents the instantaneous value during a scheduled ramp.

### 4.6 AudioContext and autoplay policy

- Do not autoplay audio on page load or immediately after file selection.
- Create or resume the audio graph from a direct user action such as pressing Play.
- Handle a suspended AudioContext and rejected `play()` promises.
- Show an actionable message such as “Press Play to enable audio” or “Your browser blocked audio playback. Press Play again.”
- Do not throw an uncaught promise rejection.
- Reuse the same AudioContext and MediaElementAudioSourceNodes for the lifetime of the player; do not create a new source node each time a file is replaced.

### 4.7 Load, remove and replace behaviour

- File selection should start metadata loading immediately.
- Use the media element's `loadedmetadata`, `durationchange`, `canplay`, `error`, `emptied`, `seeked` and `ended` events as needed.
- Use per-deck load-generation tokens or equivalent cancellation so stale events from a previously selected file cannot overwrite the newest selection state.
- If a file is replaced while playing, pause both decks, update the file source, wait for metadata, and return to a safe paused/loading state. Do not allow the previous file to keep playing invisibly.
- When one side is removed, pause the player and return to an incomplete state.
- Revoke old object URLs only after their media elements no longer need them. Revoke all remaining URLs in `dispose()`.
- Remove all media event listeners on disposal.
- Make `dispose()` idempotent so React development Strict Mode or repeated cleanup cannot cause unhandled errors.

### 4.8 File-format handling

Allow the five requested formats in the chooser and drag-and-drop flow:

| Extension | Candidate media type                                   | Important note                                                          |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `.wav`    | `audio/wav`                                            | Common PCM WAV is the primary high-confidence WAV path.                 |
| `.mp3`    | `audio/mpeg`                                           | Broadly supported.                                                      |
| `.flac`   | `audio/flac`                                           | Test current browsers; do not infer universal support in older clients. |
| `.aac`    | `audio/aac` or appropriate browser-recognized AAC type | Raw AAC/ADTS support varies by browser and operating system.            |
| `.m4a`    | `audio/mp4`                                            | M4A is a container; actual codec may be AAC or ALAC, among others.      |

Rules:

1. Use both extension and MIME information. Browser `File.type` may be empty, so do not reject a valid supported extension solely because MIME is blank.
2. Do not claim the extension proves the codec. Use `canPlayType()` only as an initial hint, then use actual media loading/playback as the final compatibility check.
3. If the browser returns no support hint, show a non-blocking compatibility warning and still attempt loading where reasonable. A failed decode/load should produce a clear error naming the affected slot and file.
4. Never convert, transcode, rename, modify or upload the file.
5. If a file is clearly not audio (for example, a `.txt` renamed as `.mp3`), reject it with a clear message.
6. Avoid implementing a full custom container/codec parser in v0.1. Lightweight signature checks for common formats are acceptable only if they are tested and do not reject unusual valid files.
7. The README and UI help text must say that actual codec support depends on the browser and on the codec stored inside the file. Do not promise every possible AAC or M4A file plays everywhere.

### 4.9 Duration mismatch and end handling

- If Original is 02:10 and Edited is 02:14, the common timeline is 02:10.
- If the durations differ beyond a small display tolerance, display a short note, e.g. “The versions have different lengths. Comparison stops at 02:10.”
- Do not time-stretch, pad, loop or silently align the tracks.
- When the common duration is reached, pause both elements and show the final common playhead position.
- Play from the end restarts both elements at zero.

### 4.10 Media resource and memory rules

- Use the media elements for playback; do not decode the entire file into an `AudioBuffer` just to play it.
- Do not generate waveforms or spectrograms in v0.1.
- Do not read entire files into base64 strings or place their bytes in React state.
- Keep only the `File`, object URL, metadata and engine-owned media resources needed for playback.
- Handle zero-byte files, very large files, corrupt/truncated files and unsupported codecs gracefully. Do not set an arbitrary hard file-size limit unless testing shows it is necessary. If a practical soft-warning threshold is introduced, make it a named constant and explain that the browser/device may have limits.

---

## 5. File intake and validation

### 5.1 Upload-slot design

Create one reusable `AudioFileSlot` component with a `version` prop or equivalent. Render it twice:

- **Original** — the starting recording.
- **Edited** — the adjusted recording.

Each slot contains:

- A clearly labelled drop area.
- A visible “Choose file” button that opens the native file picker.
- A supported-format hint: WAV, MP3, FLAC, AAC, M4A.
- File name (truncate visually but preserve full name for tooltip/screen reader).
- File size in an appropriate unit.
- Loading/ready/error status.
- Replace and Remove actions once a file has been selected.

Do not depend on drag-and-drop alone; the native browse action is required for accessibility and mobile use.

### 5.2 Validation sequence

1. Confirm that one file was selected/dropped.
2. Check extension against the allowlist (case-insensitive).
3. Inspect `File.type` where available; do not require it to be populated.
4. Reject obviously non-audio extensions and zero-byte files.
5. Create a local object URL.
6. Load media metadata and detect duration/error.
7. If loading fails, release the new URL and show a user-readable error.
8. If loading succeeds, expose file metadata to the view and notify the player engine.

### 5.3 Error wording

Use plain language. Examples:

- “Choose a WAV, MP3, FLAC, AAC or M4A file.”
- “This file could not be opened by your browser. Try another export or a different format.”
- “The Original file is still loading.”
- “The Edited file has a different duration. Playback uses the shorter length.”
- “This file is empty.”

Do not expose stack traces, raw browser error codes or developer jargon in the UI. Log technical details only to the browser console in development builds; avoid logging full file contents or sensitive metadata.

---

## 6. UI and design direction

### 6.1 Art direction

The interface should feel like a premium audio instrument or a small, carefully art-directed studio—not a generic SaaS dashboard, file converter or DAW clone.

**Core qualities:**

- Minimal, spacious and confident.
- Experimental editorial layout, with a clear visual hierarchy and a few intentional asymmetries.
- Atmospheric backgrounds with depth, soft gradients, very subtle grain or fine line motifs.
- Precise typography, restrained borders and carefully composed spacing.
- Motion that communicates state and gives the interface tactility.
- The audio comparison remains the visual focus. Decorative details must never compete with it.

**Avoid:**

- Generic dashboard cards everywhere.
- Overloaded glassmorphism, glossy/glass buttons, thick glow outlines or neon gradients.
- Constant background motion, autoplay video, heavy WebGL, giant parallax scenes or cursor-following effects that reduce usability.
- Oversized ornamental waveforms that look functional but do not represent the actual audio.
- Too many accent colours, badges, pills and decorative labels.
- Any design element that makes file loading, playback state or the active version ambiguous.

### 6.2 Page composition

Build a single focused page in v0.1. Avoid adding a dashboard, authentication page, client page or project list.

Suggested composition:

1. **Top bar:** Switchroom wordmark, concise local-only label and theme control. Keep it restrained.
2. **Hero/intro:** A confident headline such as “Hear the difference.” Add one short supporting sentence explaining synchronized Original/Edited comparison. Use one modest visual motif to establish the brand.
3. **Comparison area:** Two clearly differentiated file slots arranged side-by-side on larger screens and vertically on narrow screens.
4. **Player surface:** One prominent play control, one shared timeline, current time/total time, Original/Edited A/B selector and master volume.
5. **Supporting note:** Short explanation of local-only handling and accepted file types.
6. **Footer:** Minimal project/version and GitHub links. Use a valid repository URL only after it exists; do not invent a placeholder link in production.

The comparison area should be easy to reach without a long scroll. The visitor should see the main purpose and the ability to add files on the first screen at common desktop sizes.

### 6.3 Visual state hierarchy

The A/B active state must be unmistakable in both themes and without relying on colour alone. Use a combination of:

- “ORIGINAL” / “EDITED” text labels.
- Selected button/segment styling.
- A small active indicator or icon.
- `aria-pressed` or an equivalent accessible state.

During crossfade, do not rapidly flash states or animate the whole page. Keep the selected state calm and clear.

### 6.4 Responsive behaviour

Test at minimum:

- 1440 × 900 desktop.
- 1280 × 720 desktop/laptop.
- 1024 × 768 tablet/compact desktop.
- 768 × 1024 portrait tablet.
- 390 × 844 mobile.
- 360 × 800 narrow mobile.

Requirements:

- No horizontal page overflow.
- File slots stack vertically on narrow mobile widths.
- Player controls remain visible and have comfortable touch targets.
- Timeline thumb and controls remain usable with touch.
- File names truncate without pushing controls off-screen.
- Avoid hover-only actions; provide visible touch/click actions.
- Layout must adapt rather than simply scale down the desktop arrangement.

### 6.5 Design tokens and theme

Implement semantic CSS custom properties, not scattered hard-coded colours.

At minimum define tokens for:

- Page background.
- Main surface and elevated surface.
- Primary, secondary and muted text.
- Border and subtle divider.
- Primary accent and accent contrast.
- Success, warning and error states.
- Focus ring.
- Radius scale.
- Spacing scale.
- Motion durations/easing.

The exact palette may be refined during implementation, but keep one restrained signal accent. Dark should use deep ink/charcoal surfaces with readable near-white text. Light should use soft neutral/paper surfaces with dark graphite text. Maintain contrast in both themes.

Theme behaviour:

1. Initial mode is `system`.
2. Respect `prefers-color-scheme` when no manual override exists.
3. Provide System / Dark / Light selection.
4. Persist only explicit manual choice in `localStorage`.
5. If System is selected, follow OS changes live through `matchMedia`.
6. Apply the initial theme before the main UI paints where practical to avoid a light/dark flash.
7. If localStorage is unavailable, fall back safely to System.

### 6.6 Motion language

Motion should feel precise and calm. Use Motion for React for choreographed page/section transitions and CSS for straightforward hover/focus/press states.

Suggested starting targets:

| Interaction           | Starting behaviour                                                       |
| --------------------- | ------------------------------------------------------------------------ |
| First page reveal     | 250–450 ms, restrained opacity/position                                  |
| Main panel entrance   | 220–320 ms, subtle movement only                                         |
| Button press          | 80–140 ms, slight scale/position feedback                                |
| File slot drag-over   | 100–160 ms border/background response                                    |
| File ready            | 160–220 ms small status transition                                       |
| A/B active indicator  | 120–180 ms visual transition; audio fade remains independently scheduled |
| Scroll reveal         | 250–450 ms, only for a small number of supporting elements               |
| Background atmosphere | Very slow, low-contrast, non-distracting; pause when hidden if animated  |

Rules:

- No scroll hijacking or forced scroll snapping.
- No endless movement that competes with the player.
- Do not animate the waveform because there is no real waveform in v0.1.
- Use transform and opacity where possible; avoid expensive blur/filter animations over large areas.
- Honour `prefers-reduced-motion`. Disable parallax and nonessential reveals, and keep only essential state feedback.
- Never delay a seek or A/B switch waiting for a UI animation.

### 6.7 Micro-interactions

Include a considered set of tactile interactions:

- Buttons have a subtle hover, active/pressed and focus-visible state.
- File drop zones respond to drag-over, success and error.
- Theme selection gives a small visual confirmation.
- A/B selection uses a smooth indicator movement or state transition.
- Play/pause icon and accessible label update immediately.
- Disabled states are visibly disabled and explain why where useful.

Do not add click sounds, haptics, particles, custom cursors or pointer trails.

---

## 7. Accessibility requirements

Accessibility is part of v0.1, not a later polish task.

- Use semantic headings, buttons, labels and form controls.
- Each file picker must have a programmatic label tied to its Original/Edited slot.
- Drag-and-drop must have an equivalent keyboard-accessible Choose file button.
- The player controls must be reachable and operable by keyboard.
- A/B controls must expose selected state with `aria-pressed` or equivalent.
- The timeline must be an accessible range input or an equivalently accessible slider with a label, min, max and current value.
- The time display must be readable text; do not depend on colour or position alone.
- Announce significant loading/ready/error changes through a restrained `aria-live` status region. Do not announce every timeupdate tick.
- Provide visible focus indicators with adequate contrast.
- Respect reduced-motion preference.
- Do not make sound autoplay.
- Touch targets should be approximately 44 × 44 CSS px where practical.
- Ensure both themes meet WCAG AA contrast for normal text and controls.
- Avoid placing keyboard shortcuts on common typing keys while focus is in an input, button, select or slider.

### Keyboard baseline

Use native keyboard behaviour for all buttons and range controls. Optional global shortcuts may be added only if they are conflict-safe and documented:

- Space: play/pause only when focus is not inside a text-entry or interactive control that uses Space.
- Left/Right: seek by a small fixed step only when focus is not in a form field or native slider.
- A / B: select Original / Edited only when focus is not inside an interactive/form control.

If shortcuts introduce focus conflicts, omit global shortcuts in v0.1; native accessible controls are mandatory.

---

## 8. Error, loading and empty states

Every meaningful state must be designed and tested. Do not leave the page blank or frozen.

| State                                        | Expected UI                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| No files selected                            | Two inviting, clearly labelled file slots; player disabled with a short explanation                           |
| One file selected                            | Selected slot displays metadata; other slot remains actionable; player explains that both versions are needed |
| Both files loading                           | Per-slot progress/status; no false overall ready state                                                        |
| Both files ready                             | Player enabled; duration and active version visible                                                           |
| Unsupported/corrupt file                     | Error on the relevant slot, with replace/remove option                                                        |
| Play rejected                                | Preserve files and position; show actionable playback-unavailable message                                     |
| One deck unexpectedly errors during playback | Keep the other deck available if possible; never silently change selected version                             |
| Seek pending                                 | Show brief seeking state; do not allow multiple races to corrupt the playhead                                 |
| File replaced                                | Pause and reload safely; show loading until metadata succeeds                                                 |
| File removed                                 | Pause both decks, clean resources and return to incomplete state                                              |
| Different durations                          | Show common-duration note and end at shorter track                                                            |
| Audio ended                                  | Both decks paused at common end; next Play starts at zero                                                     |
| Browser reduced-motion                       | Stable state changes without decorative motion                                                                |
| Theme preference storage unavailable         | Continue in System theme without throwing                                                                     |

Use concise error wording. Technical diagnostics belong in development logs, not in the normal visitor experience.

---

## 9. Suggested repository structure

Create only folders needed for v0.1. Do not scaffold empty folders for cloud, authentication or feedback features.

```text
switchroom/
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml
│  │  └─ deploy.yml                 # Only if deploy secrets/access are available
│  ├─ ISSUE_TEMPLATE/
│  └─ pull_request_template.md
├─ docs/
│  ├─ decisions.md
│  ├─ audio-engine.md
│  ├─ local-development.md
│  ├─ deployment.md
│  └─ browser-support.md
├─ public/
│  ├─ favicon.svg
│  └─ _headers                      # Optional security headers, only after validation
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  └─ providers/
│  ├─ components/
│  │  ├─ layout/
│  │  ├─ audio-file-slot/
│  │  ├─ player/
│  │  └─ ui/
│  ├─ features/
│  │  └─ comparison/
│  ├─ audio/
│  │  ├─ ABAudioEngine.ts
│  │  ├─ audioTypes.ts
│  │  ├─ fileValidation.ts
│  │  └─ timeFormatting.ts
│  ├─ hooks/
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ themes.css
│  │  └─ global.css
│  ├─ test/
│  │  ├─ setup.ts
│  │  └─ fixtures/
│  └─ main.tsx
├─ tests/
│  └─ e2e/
│     ├─ comparison.spec.ts
│     ├─ theme.spec.ts
│     └─ fixtures/
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts                # If a separate config is useful
├─ playwright.config.ts
├─ wrangler.jsonc                  # Or current generated Wrangler config
├─ eslint.config.js
├─ .prettierrc.json
├─ .gitignore
├─ .nvmrc                          # Or .node-version
├─ .env.example                    # Only if the build tool requires non-secret public vars
├─ LICENSE
├─ README.md
├─ CHANGELOG.md
└─ SECURITY.md
```

Do not create `worker/routes`, `auth`, `database`, `storage`, `uploads`, `shares`, `comments`, `feedback` or `cleanup` code in this milestone.

---

## 10. Testing plan

Tests are required throughout implementation. A successful production build is not proof that the audio engine works.

### 10.1 Testing tools

- **Vitest:** pure unit tests and module-level behaviour.
- **React Testing Library:** component behaviour through user-facing controls.
- **user-event:** realistic user interaction simulation.
- **Playwright Test:** end-to-end tests in an actual browser engine.

Use current compatible versions. Keep tests deterministic. Do not rely on external URLs, public audio samples, network audio streams or real client files.

### 10.2 Test fixtures

Generate tiny, self-owned PCM WAV fixtures for browser tests. A checked-in or generated fixture set should include:

- Original: short 440 Hz mono sine tone.
- Edited: short 660 Hz mono sine tone.
- Optional silent WAV to test no-signal/ended behaviour.
- Invalid text file renamed to `.mp3` for failure handling.
- Empty file.

Keep each fixture small (a few seconds or less). Generate the fixture with a small script or commit the resulting generated binary. Record that the sample is synthetically generated and safe to use. Do not include copyrighted songs, voice recordings or client audio in the repository.

### 10.3 Unit tests — pure logic

At minimum test:

- File extension parsing is case-insensitive.
- Supported and unsupported extensions are classified correctly.
- Empty files are rejected.
- Empty browser MIME values do not automatically reject a supported extension.
- MIME/extension mismatch follows the documented warning/rejection policy.
- `formatTime()` handles 0, fractional seconds, minute boundaries, long durations and invalid values.
- Common duration calculation uses the shorter valid duration.
- Seek clamping handles negative, over-duration, `NaN` and infinite values.
- Crossfade scheduling computes the correct outgoing/incoming target gains.
- Interrupted crossfades rebase from current interpolated values instead of jumping.
- Master volume is independent of active A/B version.
- Theme resolution correctly handles System, Dark and Light.
- Theme storage failure falls back safely.

### 10.4 Audio-engine tests

Use dependency injection or small adapters where useful so scheduling/state logic can be tested without relying on jsdom to emulate actual audio playback.

At minimum verify:

1. Engine begins in an empty state.
2. Loading one file leaves the player incomplete.
3. Loading both valid files reaches ready state.
4. Metadata/duration updates are reflected correctly.
5. `play()` requests both decks to start.
6. A rejected `play()` promise pauses/rolls back both decks and exposes an error.
7. `pause()` pauses both decks.
8. `seek()` clamps and applies the target to both decks.
9. Switching while paused changes the selected deck without an audible ramp being required.
10. Switching while playing schedules the two gain ramps over the configured duration.
11. Switching at a nonzero time does not reset the canonical playhead.
12. Repeated switches during the existing transition do not stack invalid ramps.
13. The active and inactive decks remain within the synchronization tolerance before the incoming deck is audible.
14. Master volume changes the shared output gain, not each deck's A/B logic.
15. Removing either file pauses playback and returns the correct state.
16. Replacing a file ignores stale load events from the previous source.
17. End-of-common-duration pauses both decks.
18. Playing after end seeks both decks to zero first.
19. `dispose()` removes listeners, releases object URLs and is safe when called more than once.

### 10.5 Component tests

Verify through visible controls:

- Both file slots have accessible names and browse buttons.
- A file selection displays name, size and a loading/ready state.
- Invalid files show a comprehensible error.
- Replace and Remove work independently for each slot.
- Play is disabled until both files are ready.
- Play/Pause label and icon match the player state.
- Original/Edited active state is visible and exposed to assistive technology.
- Timeline shows readable elapsed/total time.
- Volume and mute controls update their state.
- Theme selector changes theme and remembers the manual choice.
- Reduced-motion preference removes nonessential animation behaviour.

### 10.6 Playwright end-to-end tests

Use local fixture files and the local dev/preview server. At minimum add these E2E flows:

**E2E-01 — Empty start**

- Open app.
- Verify no files are preloaded and the player is disabled.
- Verify the local-only privacy statement is present.

**E2E-02 — Load two valid files**

- Upload generated Original and Edited WAV fixtures.
- Verify both metadata states reach ready.
- Verify player becomes enabled and duration is displayed.

**E2E-03 — Play and switch at a nonzero timestamp**

- Press Play.
- Wait until the playhead is clearly above zero.
- Record the current time.
- Switch to Edited.
- Verify the selected version changes.
- Verify the playhead continues moving and does not reset near zero.
- Switch back to Original and verify the same behaviour.

**E2E-04 — Pause, seek and resume**

- Pause playback and verify the playhead stops advancing.
- Seek to a known position.
- Verify both decks are aligned to that position.
- Resume and verify progress continues.

**E2E-05 — Invalid file**

- Upload the invalid fixture.
- Verify a user-readable validation/load error appears and the app remains responsive.

**E2E-06 — Different durations**

- Load fixtures with different durations.
- Verify the shorter common duration is displayed and an explanatory note appears.

**E2E-07 — Replace and remove**

- Replace one file during or after loading.
- Verify old media is no longer used.
- Remove one file while paused/playing.
- Verify both decks stop and the player returns to incomplete state.

**E2E-08 — Theme and responsive layout**

- Test System, Dark and Light.
- Reload and verify the explicit manual choice persists.
- Test a narrow mobile viewport; confirm no horizontal overflow and all controls remain usable.

**E2E-09 — Reduced motion and keyboard**

- Emulate reduced motion.
- Verify core UI remains usable without nonessential motion.
- Tab through file selection and player controls; verify focus visibility and logical order.

Important: browser automation can verify state, playhead movement, event handling and gain scheduling through test hooks. It cannot by itself prove that a human listener hears a pleasant transition. Include a real manual listening checklist before release.

### 10.7 Browser test matrix

| Browser                                 | v0.1 release checks                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Chrome desktop (current stable)         | Full workflow, WAV/MP3/FLAC/M4A where codecs permit, A/B switching and crossfade |
| Microsoft Edge desktop (current stable) | Full workflow, Windows audio output, file replacement, background tab behaviour  |
| Firefox desktop (current stable)        | Full workflow, WAV/MP3/FLAC; record raw AAC support behaviour                    |
| Safari macOS (current stable)           | AudioContext gesture activation, M4A/AAC/FLAC behaviour, seek and switch         |
| Safari iOS (current stable)             | Touch upload and controls, audio activation, pause/resume and narrow layout      |
| Chrome Android (current stable)         | Upload, playback, responsive layout and interruption recovery                    |

Use Playwright's Chromium project in CI as the required fast gate. Where CI capacity permits, also run Firefox and WebKit projects. Playwright WebKit is useful but is not identical to branded Safari; perform at least one real Safari check before calling the release browser-verified.

### 10.8 Manual listening checklist

The implementing agent must listen to a generated or locally supplied test pair through real speakers/headphones in at least one desktop browser:

- Start with Original, switch to Edited during continuous playback.
- Switch back and forth repeatedly.
- Listen for clicks, pops, gaps, sudden loudness boosts and obvious dropouts.
- Confirm there is no audible restart or jump in programme material.
- Pause during a crossfade, resume and switch again.
- Test with a pair of closely related audio files (ideally a real Original/Edited pair supplied locally by the project owner, but do not commit that pair).
- Confirm volume stays constant when changing versions if both files contain the same signal level.

If no real edited audio pair is available, test with synthetic fixtures and record that real-world listening validation remains a limitation. Do not claim the transition is professionally validated without listening to representative audio.

### 10.9 Performance checks

- No eager full-file `arrayBuffer()` or `decodeAudioData()` path for normal playback.
- No audio bytes in React state or local storage.
- No continuous expensive animation loop when the page is hidden.
- Progress updates should not rerender the entire application at audio frame rate.
- Avoid large external images, autoplay background videos and WebGL.
- Check production bundle size and investigate any unexpectedly large dependency.
- Confirm the page remains responsive while loading/playing a reasonably large local WAV.

---

## 11. Implementation phases

Complete the phases in order. A later phase must not be used to hide a failed earlier phase.

### Phase 0 — Repository and environment audit

**Tasks**

- Inspect current directory, Git status, existing remote and branch state.
- Read any existing project documentation.
- Confirm Node/npm versions and current package manager.
- Confirm whether GitHub and Cloudflare credentials are available without printing secrets.
- Verify current official Cloudflare Vite plugin and Static Assets documentation.
- Identify existing code/assets that should be preserved.
- Record only meaningful initial decisions in `docs/decisions.md`.

**Gate**

A short implementation report exists, and the agent knows whether it is creating a new project or extending an existing one. No user files have been overwritten.

### Phase 1 — Scaffold, tooling and first deployable shell

**Tasks**

- Create or adapt React + TypeScript + Vite app.
- Enable TypeScript strictness; avoid `any` except documented boundary shims.
- Configure lint, format, test and production build scripts.
- Add Cloudflare Static Assets integration and current Wrangler configuration.
- Add CI workflow for install, lint, type-check, unit tests and build.
- Build the first design-token/theme foundation.
- Create a polished but static first page with the final page composition.
- Deploy the shell to Cloudflare as soon as a valid account/repository is available.

**Gate**

Fresh checkout installs cleanly; lint, type-check, tests and production build pass; the deployed shell loads publicly. Do not label this intermediate state `v0.1.0`.

### Phase 2 — File intake and media metadata

**Tasks**

- Implement reusable Original/Edited file slots.
- Add browse and drag/drop paths.
- Implement extension/MIME validation and loading errors.
- Create/revoke object URLs safely.
- Load metadata and show file name, size, format and duration.
- Implement replace/remove flows and stale-load protection.
- Add empty, one-file, loading, ready and error states.

**Gate**

Both local files can be selected independently, validated and loaded without any network upload. Replacing/removing files does not leave stale media or object URLs.

### Phase 3 — Audio engine and real A/B playback

**Tasks**

- Implement the isolated `ABAudioEngine`.
- Add two media elements, source nodes, per-deck gain nodes and master gain.
- Implement AudioContext activation from user gesture.
- Implement play, pause, shared seek, common duration and end handling.
- Implement stable dual-deck synchronization.
- Implement the 180 ms linear-amplitude gain crossfade.
- Implement interrupted-crossfade handling and browser playback failure handling.
- Expose a typed snapshot/subscription contract for React.

**Gate**

Unit tests pass, browser E2E proves continuous playhead and switching, and manual listening confirms a real audible transition rather than a visual-only effect.

### Phase 4 — Player UI and responsive behaviour

**Tasks**

- Connect the engine to the UI through a small hook/provider or controller.
- Add A/B selection, play/pause, timeline, elapsed/total time and volume/mute.
- Add player loading/error/disabled states.
- Add responsive mobile layout and touch interaction.
- Ensure progress updates do not rerender the full app continuously.

**Gate**

The complete main user journey works using only visible UI controls at desktop and mobile sizes.

### Phase 5 — Art direction, motion and accessibility

**Tasks**

- Finish both theme palettes and theme persistence.
- Add a polished type, spacing, surface, border, button and focus system.
- Add atmospheric but subtle background treatment.
- Add page reveal, scroll reveal and tactile click/hover transitions.
- Add reduced-motion handling.
- Complete labels, accessible states, keyboard path and screen-reader announcements.
- Remove unnecessary animation and decorative clutter.

**Gate**

The product looks intentional in both themes, is usable with keyboard/touch, and reduced-motion mode remains fully functional.

### Phase 6 — Test hardening and regression

**Tasks**

- Complete unit, component and Playwright tests listed in Section 10.
- Test rapid switching, replace/remove while playing, duration mismatch, corrupt input and rejected play promises.
- Run browser checks and real manual listening.
- Run production build and preview under the Cloudflare runtime.
- Fix every critical/high-severity issue.
- Check dependency vulnerabilities and remove unnecessary dependencies.

**Gate**

All required CI tests pass; manual listening is documented; no known critical player, privacy or accessibility defect remains.

### Phase 7 — Public release preparation

**Tasks**

- Finalize README, setup/deployment instructions, privacy explanation and supported-format notes.
- Add MIT license unless the project owner has chosen another license. Use `Copyright (c) 2026 Switchroom contributors` as the initial holder text unless an existing repository license should be preserved.
- Add `CHANGELOG.md` entry for `0.1.0` and a concise `SECURITY.md`.
- Add screenshots or a short GIF only if generated from the actual working interface; do not use mock screenshots as proof of functionality.
- Verify `.gitignore` excludes `.env*` secrets, local audio test files, build output and local tooling state.
- Verify no client audio file, secret or credential is committed.
- Configure GitHub Actions deployment only when Cloudflare credentials are available as repository secrets.
- Deploy to the public `workers.dev` address.
- Perform a post-deploy smoke test on the public URL.
- Create tag `v0.1.0` and publish GitHub Release notes only after all gates pass.

**Gate**

The public site is reachable, the main workflow functions on the deployed build, and the repository/tag/release accurately describe the working version.

---

## 12. Required scripts and CI contract

Use script names equivalent to the following; adjust only when the scaffold requires a different conventional name.

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

If Cloudflare's Vite plugin supplies its own preview command, use the official preview command for final runtime verification and document it. The `preview` script must not be misleading: it should run the built output in a way that resembles production.

### CI on pull requests and main

Required CI steps:

1. Checkout.
2. Install the pinned Node LTS version.
3. `npm ci`.
4. `npm run format:check`.
5. `npm run lint`.
6. `npm run typecheck`.
7. `npm run test`.
8. Install Playwright Chromium and run `npm run test:e2e` against the local app/preview.
9. `npm run build`.
10. Upload Playwright report only on failure or as a small useful artifact.

Do not put Cloudflare credentials in the pull-request test job. Deploy only from the protected main branch after all checks pass. Secrets must be GitHub Actions secrets or Cloudflare-managed secrets, never committed.

### Deployment failure behaviour

If the user has not yet authenticated Cloudflare or provided repository secrets:

- Complete and verify all local work.
- Keep the deployment workflow ready but do not fabricate a deployment result.
- Give the exact one-time user action required to authenticate or add the required secrets.
- Do not ask for tokens to be pasted into chat or written to source files.
- Continue to treat the release as **not publicly deployed** until the public URL is tested.

---

## 13. Definition of done — v0.1.0

Every item below is mandatory. A checkbox may be marked complete only after verification.

### Product and functionality

- [ ] A first-time visitor can use the app without registration or login.
- [ ] Original and Edited files can be selected independently.
- [ ] Browse and drag-and-drop both work.
- [ ] WAV, MP3, FLAC, AAC and M4A extensions are accepted for attempted local playback.
- [ ] Codec/browser limitations produce useful warnings/errors rather than silent failure.
- [ ] File name, size, format and duration are displayed.
- [ ] One shared play/pause transport works.
- [ ] One shared timeline seeks both decks.
- [ ] Original/Edited selection changes the audible source.
- [ ] Switching at nonzero playback time does not reset the playhead.
- [ ] Crossfade uses actual Web Audio gain automation.
- [ ] Repeated or interrupted switches do not cause gain spikes or stuck states.
- [ ] Master volume/mute is independent of the selected deck.
- [ ] Shorter common duration and mismatch notice behave correctly.
- [ ] End, replay, replace, remove and error states work.
- [ ] No audio is played before an explicit user gesture.

### Privacy and scope

- [ ] No audio is uploaded or sent to any server.
- [ ] No file bytes or metadata are stored persistently.
- [ ] Object URLs and media resources are cleaned up.
- [ ] Only manual theme preference is persisted locally.
- [ ] No account, database, R2, comments, sharing or later-version placeholder controls are present.
- [ ] The local-only privacy statement is accurate and visible.

### UX and accessibility

- [ ] Dark, Light and System themes work.
- [ ] System mode follows OS preference changes.
- [ ] Manual theme choice persists across reloads.
- [ ] Desktop and mobile layouts are responsive with no horizontal overflow.
- [ ] Core workflow is keyboard operable.
- [ ] File controls and player controls have accessible names/states.
- [ ] Focus is visible.
- [ ] Reduced-motion preference is respected.
- [ ] Empty, loading, ready, error and duration-mismatch states are visually designed.
- [ ] No fake waveform or misleading progress animation exists.

### Engineering and release

- [ ] TypeScript strict type-check passes.
- [ ] ESLint passes.
- [ ] Prettier check passes.
- [ ] Unit/component tests pass.
- [ ] Playwright critical E2E tests pass.
- [ ] Real manual listening checklist is completed and recorded.
- [ ] Production build passes from a clean checkout.
- [ ] Cloudflare production preview passes.
- [ ] README and local development docs are accurate.
- [ ] License, changelog and security contact guidance exist.
- [ ] No secrets or client audio are committed.
- [ ] Public GitHub repository is configured.
- [ ] Public Cloudflare deployment has been smoke-tested.
- [ ] Git tag `v0.1.0` and release notes exist.

---

## 14. Documentation required in the repository

### `README.md`

Include:

- What Switchroom is and what v0.1 does.
- Actual screenshots from the working app.
- Local-only privacy explanation.
- Supported file extensions and codec caveats.
- Browser support expectations.
- Prerequisites and exact local setup commands.
- Test commands.
- Build and deploy commands.
- A clear statement that v0.1 does not upload or save audio.
- Current known limitations.

### `docs/audio-engine.md`

Document:

- Two-deck audio graph.
- Canonical playhead and common-duration policy.
- Crossfade model and default duration.
- AudioContext user-gesture handling.
- Object URL/resource lifecycle.
- Known codec/browser limitations.

### `docs/deployment.md`

Document:

- Cloudflare prerequisites.
- How to authenticate with Wrangler without putting credentials in source.
- How to preview the production build.
- How to deploy.
- Where the public URL is obtained.
- How GitHub Actions deployment secrets are configured if CI deployment is enabled.

### `docs/browser-support.md`

Record tested browser versions, device/OS, working formats, any codec limitations, and manual listening outcomes. Do not label an untested browser/format as supported.

### `CHANGELOG.md`

Add a `0.1.0` entry only after release acceptance passes. Include shipped capabilities and known limitations.

---

## 15. Risks and implementation traps

| Risk                                                       | Required mitigation                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A/B toggle only changes a CSS indicator                    | Verify gain automation and real audible switching                                  |
| Playhead restarts on every switch                          | Keep one canonical transport; run/synchronize both decks                           |
| Two decks drift                                            | Check target deck time before switching and correct drift safely                   |
| AudioContext is suspended                                  | Resume from explicit user gesture; handle rejected promises                        |
| `AudioParam.value` is stale during a scheduled fade        | Track/interpolate active ramps or use supported hold semantics                     |
| Repeated switches stack automation                         | Cancel/rebase existing ramps before scheduling the next one                        |
| Object URLs leak                                           | Centralize ownership and revoke on replace/remove/dispose                          |
| Old metadata event overwrites new file state               | Use per-deck load generation/cancellation token                                    |
| Browser reports no `canPlayType` support for a valid codec | Treat as a hint; attempt load where safe and report actual result                  |
| AAC/M4A codec differs from extension assumption            | Explain container/codec caveat and test actual browser playback                    |
| Mobile playback blocked until touch                        | Create/resume graph in Play gesture and test real mobile browsers                  |
| Large files freeze UI                                      | Do not eagerly decode/read full file; isolate metadata and progress updates        |
| Animation harms usability/performance                      | Keep effects restrained, transform/opacity-focused and reduced-motion-aware        |
| Local privacy claim becomes false                          | No analytics, remote APIs, audio upload, file persistence or third-party audio SDK |
| First release is overbuilt                                 | Follow strict scope and exclude all future-version services/features               |

---

## 16. Agent completion report format

At the end of the milestone, provide a concise but evidence-based report using this structure:

```text
# Switchroom v0.1.0 — Completion Report

## Delivered
- ...

## Public URLs
- GitHub repository: ...
- Production site: ...
- Git release/tag: ...

## Verification
- Format check: PASS/FAIL (command)
- Lint: PASS/FAIL (command)
- Type-check: PASS/FAIL (command)
- Unit/component tests: PASS/FAIL (count)
- Playwright: PASS/FAIL (browser projects and count)
- Production build: PASS/FAIL
- Cloudflare preview/deployment: PASS/FAIL
- Manual listening: completed/not completed + observations
- Manual browser checks: browsers/devices actually tested

## Important implementation decisions
- ...

## Known limitations
- ...

## Remaining user action, if any
- ...

## Release status
- NOT RELEASED / READY FOR RELEASE / RELEASED
```

Do not mark `RELEASED` unless the public deployment and tag are verified.

---

## 17. Official references to consult during implementation

Use these as starting points, then check the current documentation for any API or configuration changes before coding. The web platform and Cloudflare tooling can evolve independently of this plan.

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — static asset deployment and SPA fallback.
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) — current Vite integration.
- [Cloudflare React SPA with an API tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) — React + Vite setup, build, preview and deploy. v0.1 uses only the static application portion; do not add the tutorial's API unless required by a later milestone.
- [Vite static deployment guide](https://vite.dev/guide/static-deploy) — deployment options and Vite build behaviour.
- [MDN: Using the Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API) — media elements, audio nodes and gain control.
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — API overview and compatibility.
- [MDN: Autoplay guide for media and Web Audio APIs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) — user-gesture and autoplay constraints.
- [Motion: `useReducedMotion`](https://motion.dev/docs/react-use-reduced-motion) — adapting animations to accessibility preferences.
- [Vitest guide](https://vitest.dev/guide/) — unit test setup and Vite integration.
- [Playwright browser projects](https://playwright.dev/docs/test-projects) — browser-specific test configurations.
- [Playwright browsers](https://playwright.dev/docs/browsers) — Chromium, Firefox, WebKit and device emulation.
- [Testing Library user-event setup](https://testing-library.com/docs/user-event/setup/) — realistic UI interaction testing.

---

## Final instruction

Deliver **one small, excellent, complete product**: a polished public website whose synchronized A/B audio player genuinely works with local files. Prioritize reliable playback and a clear comparison experience over decorative complexity. Keep the project deliberately local-only in v0.1, verify the audible crossfade, test the real workflows, document codec limitations honestly, and publish only after the release gates pass.

When v0.1.0 is complete, stop. Do not start v0.2 work as part of this task.
