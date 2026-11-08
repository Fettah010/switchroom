# Implementation decisions

This document records the decisions that shaped v0.1 and the trade-offs behind them. The acceptance contract is the expanded v0.1 plan; this is the engineering rationale.

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

## 180 ms linear-amplitude crossfade

- 180 ms is long enough to mask the switch and short enough to feel immediate.
- Linear amplitude keeps the implementation auditable and the two gain curves complementary (`A + B = 1` during a normal switch).
- The engine keeps its own ramp bookkeeping because `AudioParam.value` is unreliable while automation is scheduled.
- Interrupted fades rebase from the current interpolated gain rather than restarting from an endpoint, avoiding jumps and stacked automation.
- Pausing snaps gains to the selected deck's targets; resuming starts from a known state.

Loudness normalization is out of scope. If the two source files have different levels, the crossfade will audibly reflect that.

## Status model includes `incomplete`

The plan's suggested states were expanded with `incomplete`: exactly one slot has a file. This is distinct from `empty` (no files), `loading` (metadata in flight), `ready` (both loaded, never played), `paused`, `playing` and `error`. The UI copy can then tell the user precisely which slot is missing.

## Theme handling

- CSS custom properties define the palette; `data-theme="dark|light"` selects it.
- A tiny blocking script in `index.html` applies the stored/system theme before paint to avoid a flash.
- `ThemeProvider` reads `localStorage` once, follows `matchMedia` while in System mode, and writes only on an explicit manual choice.
- Storage failures are caught; the app falls back to System instead of breaking.

The theme choice is the only persisted data in v0.1.

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

- **Vitest + Testing Library**: pure crossfade math, validation, formatting, theme resolution, engine state machine with a fake host, and component accessibility/state behaviour.
- **Playwright**: real browser, real Web Audio, real `MediaElement` playback and generated local WAV fixtures. Gains are sampled over time to prove the crossfade passes through intermediate values rather than snapping.
- **Generated fixtures**: deterministic sine tones, a shorter pair, an empty file, a text file with an unsupported extension and text masquerading as `.mp3`. No external samples, licences or downloads are involved.
- **WebKit on Windows**: that Playwright build cannot decode local audio in this environment, so the audio-flow specs skip there with an explicit message instead of pretending to pass. Chromium is the required CI gate; Firefox runs locally and in the full matrix.

## Deliberate exclusions

v0.1 does not include accounts, uploads, server storage, share links, comments, analytics, waveforms, persistent file libraries, global hotkeys, service workers or placeholder controls for later milestones. Those are product decisions, not missing wiring.
