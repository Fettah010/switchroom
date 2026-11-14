# Implementation decisions

This document records the decisions that shaped v0.1 through v0.3 and the trade-offs behind them. The acceptance contracts are the expanded v0.2 and v0.3 plans; this is the engineering rationale.

## Static single-page app, no Worker entry

Switchroom is a Vite React SPA deployed as Cloudflare Workers Static Assets. There is deliberately no `worker/` folder, API route, Hono app, database or storage binding.

- [`wrangler.jsonc`](../wrangler.jsonc) points at the built assets and sets `not_found_handling` to `single-page-application`.
- `@cloudflare/vite-plugin` builds the client and makes `vite preview` exercise the Workers runtime.
- This keeps the privacy claim simple: there is no server-side code that could receive audio.

## Framework-independent audio engine

`ABAudioEngine` knows nothing about React. It exposes `subscribe` / `getSnapshot` / `subscribeToTime` and receives an `AudioHost` for media elements, Web Audio, object URLs and animation frames.

Consequences:

- Unit tests run deterministically against `src/test/fakeAudioHost.ts` without real audio or timers.
- The React layer uses `useSyncExternalStore`, and the playhead has a separate subscription so high-frequency time updates do not re-render the whole app.
- The browser adapter is the only place that touches concrete DOM APIs.

## Real dual-deck playback

Both files play simultaneously, each through its own gain node. The inaudible deck keeps running at gain `0`.

This costs a second media decode during playback, but it is the only way to switch instantly without seeking or restarting at the moment of the click. The alternative — starting the inactive deck on demand — would introduce a seek/start latency right where the crossfade needs continuity.

## Common duration instead of padding

The shared timeline uses the shorter of the two valid durations. Comparison stops there and the interface explains why.

Padding the shorter file or extending past its end would either invent silence or let the shorter deck end early while the other continues, breaking the promise of a synchronized A/B. A mismatch is treated as normal and designed for, not as an error.

## Adjustable linear-amplitude crossfade

- 180 ms remains the default because it is long enough to mask the switch and short enough to feel immediate.
- The user can choose 80–600 ms in 20 ms steps. The range covers a near-instant edit check through a deliberately soft transition without allowing a fade so long that the A/B comparison loses its point.
- Linear amplitude keeps the implementation auditable and the two gain curves complementary (`A + B = 1` during a normal switch).
- The engine keeps its own ramp bookkeeping because `AudioParam.value` is unreliable while automation is scheduled.
- Interrupted fades rebase from the current interpolated gain rather than restarting from an endpoint, avoiding jumps and stacked automation.
- Changing the duration during a fade does not reschedule that fade. The current fade completes at its original duration and the new value applies to the next switch, which avoids an audible discontinuity mid-transition.
- The value is session-only. Persisting it would add a second browser preference for a setting that is cheap to adjust, and the product contract allows only the theme key.
- Pausing snaps gains to the selected deck's targets; resuming starts from a known state.

Loudness normalization is out of scope. If the two source files have different levels, the crossfade will audibly reflect that.

## Status model separates selected, audible and pending

v0.2 adds `starting`, `switching` and `interrupted`, and tracks `activeVersion`, `audibleVersion` and `switchingTo` separately.

A single selected-version flag could not describe a target that is still aligning, a fade that has not started, or a deck that the browser has paused underneath the app. The expanded model lets the interface say “Switching to Edited…” and keep the **Audible** label truthful until the fade actually begins. `incomplete` remains distinct from `empty`, `loading`, `ready`, `paused`, `playing` and `error`.

## Operation tokens instead of a state-machine rewrite

Pending Play, switch alignment, fade completion and file loading are asynchronous. Rather than replace the engine with a formal state machine, v0.2 uses two monotonically increasing tokens (`playSequence`, `switchSequence`) plus a per-deck load generation.

Every asynchronous continuation checks the relevant token before mutating state. Pause, Replace, Remove and Dispose increment the tokens, so a late `play()` or `seeked` result cannot resurrect stale work. This keeps the existing two-deck architecture and its tests intact while making cancellation explicit and auditable.

## Seek semantics during switches

- A seek while playing applies to both ready decks, so the silent deck stays aligned.
- A seek during alignment cancels the pending alignment and re-requests the same target at the new position. Continuing to align to the old position would fade into the wrong part of the recording.
- A seek during an active fade seeks both decks and lets the fade continue. The target is already audible, so restarting the switch would add latency without improving synchronization.
- A paused seek updates both elements and the snapshot. A post-seek `canplay` event must not reset the deck, which was a v0.2 regression caught by the paused-seek E2E test.

## End-of-media pause is not an interruption

Browsers pause a media element when it reaches the end. In Firefox that `pause` event can arrive before the animation-frame ticker or the `ended` event observes the end. v0.2 checks the playhead against the common duration in the pause handler: at the end it finishes playback normally; anywhere else it treats the pause as a browser/OS interruption. This avoids a false “Your browser interrupted audio playback” message at the end of every Firefox comparison.

## Bounded metadata loading

A local metadata read normally completes quickly, but a corrupt or unsupported container can leave a slot loading forever. v0.2 adds a 15 s default timeout, injectable through `AudioEngineOptions.metadataTimeoutMs` for tests. The timeout is generation-guarded and cleared on ready, failure, replacement, removal and disposal. Fifteen seconds is deliberately generous for large local files while still giving the user a recoverable error instead of an indefinite spinner.

## Interruption recovery is explicit

An `AudioContext` state change away from `running`, or an unexpected media pause, stops playback and sets `interrupted`. The app does not silently resume, because a browser suspension often means the user or OS took audio away deliberately. The preserved playhead and an explicit Play action give the user a predictable recovery path. A closed context is treated as unrecoverable until reload.

## v0.2 did not add a backend, waveform engine or workspace

The v0.2 scope was reliability and precision for the local A/B player. Adding uploads, accounts, a saved library, share links, comments, waveforms or scheduled jobs would change the privacy model and the architecture for features that were not part of this release. The static SPA and two-deck engine were retained because they still satisfy the product: local files, instant switching and a shared timeline.

## v0.3: waveforms, motion, sliders and layout stability

### Waveform subsystem separate from the playback engine

`ABAudioEngine` remains the source of truth for the playhead, decks and Web Audio graph. Waveform computation is a separate subsystem (`src/waveform/`) that receives the local `File`, derives compact downsampled peaks and never owns a playhead or a second timeline.

- Playback readiness is independent from waveform readiness; Play never waits for waveform analysis.
- Waveform work is cancellable and generation-safe (replace/remove/dispose invalidate in-flight requests).
- Common PCM WAV is parsed directly in a Dedicated Worker; non-WAV codecs are decoded on the main thread (size/memory bounded) then reduced to peaks in the worker.
- WebCodecs/`AudioDecoder` is optional and feature-detected; no FFmpeg/WASM.
- Bounded resource policy: 256 MB direct-read WAV / 32 MB compressed-input / ~240 MB decoded-PCM ceilings on desktop, lower on ≤ 4 GB devices; up to 2400 buckets.
- Large or unsupported files fall back to a plain timeline; playback stays available.
- Canvas renderer; peaks never uploaded or persisted.

### Motion

Motion for React (`motion/react`) drives entrance reveals for the header, workspace heading, both file slots (short stagger), player and waveform, and the footnote/footer. Uses `viewport={{ once: true }}` and `opacity`/`transform` only so no layout is triggered. `useReducedMotion` is respected: entrance appears immediately with no travel animation. The audio crossfade is functional, not decoration, and is unaffected by reduced motion.

### Slider system

Timeline, master volume and crossfade share one custom-skinned native `input[type="range"]` family (`.range-control`) with shared rail/fill/thumb/focus tokens, touch-friendly 44 px hit areas, and monospaced tabular readouts. Crossfade min/max/default remain 80/600/180 ms; the setting stays session-only.

### Layout stability

The Play/Pause button keeps fixed geometry across Play / Starting… / Pause via a fixed icon box and reserved label width. The player top uses an intentional grid (transport + version selector) rather than unconstrained flex-wrap, so status-label changes do not move adjacent controls. The bottom status area has a reserved height.

## Theme handling

- CSS custom properties define the palette; `data-theme="dark|light"` selects it.
- A tiny blocking script in `index.html` applies the stored/system theme before paint to avoid a flash.
- `ThemeProvider` reads `localStorage` once, follows `matchMedia` while in System mode, and writes only on an explicit manual choice.
- Storage failures are caught; the app falls back to System instead of breaking.

The theme choice remains the only persisted data in v0.2. The crossfade duration is intentionally session-only.

## Visual direction and typography

The interface uses a locally available serif display stack for the editorial headline and a system sans stack for controls. No web fonts are requested, so the privacy claim does not depend on a third-party font CDN and first paint is not blocked by font downloads.

The crossfade motif is an inline SVG diagram, not a fake waveform. There are no simulated meters, progress sparklines or generated waveforms that could imply analysis the app does not perform.

## Motion

Motion for React drives restrained entrance transitions and the inline motif. Every nonessential animation checks `useReducedMotion`. The audio crossfade is not disabled by reduced motion because it is functional, not decorative.

## No global keyboard shortcuts

Space, A/B and arrow shortcuts were considered and intentionally omitted. A local-first tool is often used alongside a DAW or another player, and global shortcuts would steal keys from the focused application or conflict with browser and assistive-technology commands.

Instead:

- Every control is a native button or range input.
- Tab order is logical.
- The hidden file input is removed from the tab order (`tabIndex={-1}`); the visible dropzone/Replace control is the keyboard target.
- A skip link jumps to the comparison workspace.
- Status changes use a polite live region.

## Development diagnostics

`window.__switchroom.engine` exists only under `import.meta.env.DEV`. It lets Playwright assert real element times and interpolated gains without adding production surface. The production smoke test asserts the hook is absent.

## React StrictMode and engine disposal

StrictMode intentionally mounts, unmounts and remounts components in development. Disposing the engine synchronously in an effect cleanup would leave the remounted provider holding a disposed engine. Disposal is therefore deferred to a zero-delay timer that the remount clears; a real unmount still releases object URLs, nodes and the `AudioContext`.

## v0.4: local workspaces, manifest import/export, presentation layouts and settings

### IndexedDB for local-first metadata persistence

Switchroom v0.4 introduces local comparison workspaces without requiring a cloud backend or account system.

- Database: `switchroom-local`, schema version 1.
- Object stores: `workspaces` (keyPath `id`, indexes on `updatedAt` and `createdAt`), `preferences` (keyPath `id`).
- Fail-safe fallback: If IndexedDB is blocked or throws a `SecurityError` (e.g. strict private browsing containers), `InMemoryWorkspaceRepository` takes over gracefully with a clear banner, allowing full comparison in the active tab.

### Truthful relinking vs. storing audio in browser databases

A critical design choice in v0.4 was whether to persist audio blobs or decoded PCM in IndexedDB or CacheStorage. We deliberately rejected storing audio files in browser storage:

1. **Quota & Performance:** Two uncompressed 24-bit 96 kHz WAV stems can easily exceed 400 MB. Storing such large blobs in IndexedDB triggers quota exceptions, memory bloat, and browser tab crashes.
2. **Privacy & Sandboxing:** Users expect that when they close an incognito tab or clear cache, their private audio is not secretly retained in an opaque browser database.
3. **Truthful UX:** Switchroom adopts a transparent contract. Metadata (title, description, engineering notes, labels, layout, crossfade) is remembered; when reopened, a clear Relink Media Notice displays expected filenames and sizes so the user can re-select the files in seconds.

### Portable `.switchroom.json` manifest format

To allow sharing session notes and configurations between machines or colleagues without uploading audio to a server, v0.4 defines the `.switchroom.json` manifest:

- Size bounded: 1 MiB ceiling checked before JSON parsing to protect against memory attacks.
- Strict validation: version 1 schema enforcement, character limits, number clamping.
- Prohibited key checks: assertions guarantee no `audioBuffer`, `blob`, `token`, `secret`, or `path` keys exist in the payload.
- Import isolation: imported workspaces always receive a new locally unique ID, preventing accidental overwrites.

### Single-tree presentation layouts

The 4 layouts (`standard`, `player-focused`, `waveform-focused`, `compact-review`) are driven by CSS attributes (`data-layout="..."`) on the workspace root rather than duplicate component trees. This ensures audio engine listeners and component lifecycle remain unbroken during layout switches.

### Client preview mode

A distraction-free presentation view for client listening sessions. In preview mode, administrative and editing controls (metadata inputs, notes drawer, manifest export, settings) are hidden, leaving only the presentation banner, playback controls, version switcher, and waveform timeline.

## Test strategy

- **Vitest + Testing Library**: pure crossfade math, validation, formatting, theme resolution, engine state machine with a fake host, and component accessibility/state behaviour. v0.2 adds deterministic coverage for operation cancellation, paused seeking, post-seek `canplay`, end-of-media pause, metadata timeout, generic MIME types, fade interruption and crossfade duration changes. v0.3 adds WAV header/peak parsing, the worker reply-port handshake, resource budgeting, waveform lifecycle, shared-duration clipping and waveform rendering states.
- **Playwright**: real browser, real Web Audio, real `MediaElement` playback and generated local WAV fixtures. Gains are sampled over time to prove the crossfade passes through intermediate values rather than snapping. v0.2 covers startup cancellation, rapid reversal, seek-while-playing, pause during a fade, AudioContext suspension recovery, generic MIME acceptance, repeated replace/remove cycles and the crossfade slider. v0.3 adds real canvas pixels, shared-axis seeking at several fractions, mismatch clipping, playhead sync, slider fill/thumb geometry and the fallback path.
- **Generated fixtures**: deterministic sine tones, a shorter pair, an empty file, a text file with an unsupported extension and text masquerading as `.mp3`. No external samples, licences or downloads are involved.
- **WebKit on Windows**: that Playwright build cannot decode local audio in this environment, so the audio-flow specs skip there with an explicit message instead of pretending to pass. Chromium is the required CI gate; Firefox runs locally and in the full matrix.

## Deliberate exclusions

v0.2 does not include accounts, uploads, server storage, share links, comments, voting, analytics, waveforms, persistent file libraries, saved workspaces, scheduled jobs, global hotkeys, service workers or placeholder controls for later milestones. Those are product decisions, not missing wiring.
