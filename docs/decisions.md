# Implementation decisions

This document records the decisions that shaped v0.1 and v0.2 and the trade-offs behind them. The acceptance contract is the expanded v0.2 plan; this is the engineering rationale.

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

## Test strategy

- **Vitest + Testing Library**: pure crossfade math, validation, formatting, theme resolution, engine state machine with a fake host, and component accessibility/state behaviour. v0.2 adds deterministic coverage for operation cancellation, paused seeking, post-seek `canplay`, end-of-media pause, metadata timeout, generic MIME types, fade interruption and crossfade duration changes.
- **Playwright**: real browser, real Web Audio, real `MediaElement` playback and generated local WAV fixtures. Gains are sampled over time to prove the crossfade passes through intermediate values rather than snapping. v0.2 covers startup cancellation, rapid reversal, seek-while-playing, pause during a fade, AudioContext suspension recovery, generic MIME acceptance, repeated replace/remove cycles and the crossfade slider.
- **Generated fixtures**: deterministic sine tones, a shorter pair, an empty file, a text file with an unsupported extension and text masquerading as `.mp3`. No external samples, licences or downloads are involved.
- **WebKit on Windows**: that Playwright build cannot decode local audio in this environment, so the audio-flow specs skip there with an explicit message instead of pretending to pass. Chromium is the required CI gate; Firefox runs locally and in the full matrix.

## Deliberate exclusions

v0.2 does not include accounts, uploads, server storage, share links, comments, voting, analytics, waveforms, persistent file libraries, saved workspaces, scheduled jobs, global hotkeys, service workers or placeholder controls for later milestones. Those are product decisions, not missing wiring.
