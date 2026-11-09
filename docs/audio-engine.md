# Audio engine

Switchroom's playback engine lives in [`src/audio/ABAudioEngine.ts`](../src/audio/ABAudioEngine.ts). It is framework-independent: the React layer subscribes to its snapshot store, and tests replace the browser with a deterministic fake host.

## Two-deck graph

Each version owns one HTML media element and one Web Audio gain node. Both decks are wired in parallel:

```text
Original <audio> ── MediaElementSource ──> Original gain ─┐
                                                          ├──> Master gain ──> destination
Edited   <audio> ── MediaElementSource ──> Edited   gain ─┘
```

- The deck gains implement the A/B crossfade. Normally one is at `1` and the other at `0`.
- The master gain implements volume and mute and is independent of the selected version.
- Both media elements play simultaneously during playback. The inaudible deck stays running at gain `0`, already positioned for the next switch, so switching never restarts the programme.
- The graph is created lazily the first time the user presses Play. File selection alone creates no `AudioContext`.

The engine depends on the small interfaces in [`audioTypes.ts`](../src/audio/audioTypes.ts), not directly on DOM classes. [`audioHost.ts`](../src/audio/audioHost.ts) is the browser adapter; [`src/test/fakeAudioHost.ts`](../src/test/fakeAudioHost.ts) is the deterministic test adapter.

## Transport state model

The snapshot exposes separate `activeVersion` (what the user selected), `audibleVersion` (what is actually carrying audio) and `switchingTo` (the target of an in-progress switch). `status` is derived from those fields:

| Status        | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `empty`       | Neither slot has a file.                                                 |
| `incomplete`  | Exactly one slot has a file.                                             |
| `loading`     | At least one deck is reading metadata.                                   |
| `ready`       | Both decks are loaded and playback has not started yet.                  |
| `starting`    | Play was requested and the context/media start is still pending.         |
| `playing`     | Playback is running on a settled deck.                                   |
| `switching`   | A target deck is aligning or fading; `switchingTo` names the target.     |
| `paused`      | Both files are ready and playback has started at least once.             |
| `interrupted` | The browser or OS stopped audio; an explicit Play is required to resume. |
| `error`       | A deck failed, or a global playback/switch error was reported.           |

The interface never treats `activeVersion` as proof that the target is audible. The **Audible** label follows `audibleVersion`, and it changes only when the incoming fade actually starts. While a switch is pending, the target version shows a small switching indicator and the status copy says “Switching to …”.

## Canonical playhead and common duration

There is one canonical playhead, clamped to the shared duration:

- If playing, the time comes from the deck that is currently audible.
- If paused, the time comes from the settled selected deck, which equals the audible deck after a pause.
- The shared duration is `min(original.duration, edited.duration)` when both are valid.
- A mismatch notice appears when the durations differ by more than 50 ms.
- The animation-frame ticker publishes the playhead to the timeline separately from the main snapshot, so only the timeline re-renders during playback.
- Playback ends when the playhead reaches the shared duration (with a 30 ms tolerance). Replaying from the end seeks both decks to zero first.

Both files can be any length. Switchroom does not pad the shorter file or extend the comparison beyond the common duration.

## Seeking

- A seek clamps the target to the common duration and applies it to every ready deck, whether paused or playing.
- Seeking while playing keeps both decks converged and does not reset the fade bookkeeping.
- A seek during an alignment-pending switch cancels that alignment, keeps the currently audible deck coherent, and re-requests the same target version at the new position.
- A seek during an active fade seeks both decks and lets the scheduled fade continue.
- A later `canplay` event after a seek does not reset the deck. Only the first transition to ready may move a paused deck to zero.

## Switching and synchronization

`switchTo(version)` keeps the current time rather than restarting:

1. Record the canonical time.
2. Set `activeVersion` and `switchingTo` immediately so the UI responds.
3. If paused, cancel any pending switch, snap the gains to the new targets and make the selected version both active and audible.
4. If playing, compare the target deck's element time with the canonical time. If they differ by more than 50 ms, seek the target and wait for its `seeked` event (up to 600 ms).
5. If the target is paused, start it.
6. Re-check drift against the audible deck immediately before the fade.
7. Set `audibleVersion` to the target and schedule the crossfade.
8. Clear `switchingTo` when the scheduled fade completes.

If alignment or restart fails, the engine restores the previous audible version, restores its gains and shows a specific error instead of leaving a silent or half-muted state.

A monotonically increasing switch sequence token invalidates older asynchronous switches when the user switches rapidly. A late switch checks the token before every state mutation, so a reversal cannot schedule a stale fade or overwrite the newer target. A fade already in progress is rebased from the current interpolated gain, so rapid reversals do not stack ramps or jump.

Pausing during an alignment-pending switch settles on the previously audible deck. Pausing during a fade settles on the target, because the target has already become audible.

## Crossfade model

- **Range:** 80–600 ms (`MIN_CROSSFADE_MS` / `MAX_CROSSFADE_MS`), changed with the Crossfade slider in 20 ms steps.
- **Default duration:** 180 ms (`DEFAULT_CROSSFADE_MS`).
- **Change policy:** the setting is session-only. Changing it while a fade is in progress lets that fade finish at its scheduled duration; the new value applies to the next switch.
- **Curve:** linear amplitude, from the current interpolated gain to the target. The two sides are complementary, so the summed gain is 1 throughout a normal switch.
- **Scheduling lead:** 5 ms, so automation never starts in the past.
- **Bookkeeping:** the engine keeps the scheduled ramp (`startValue`, `endValue`, `startTime`, `endTime`) and interpolates it itself. `AudioParam.value` is not reliable while automation is scheduled.
- **Interrupted fades:** a new fade starts from the currently interpolated gain and cancels/rebases the automation.
- **Pause and load:** pausing, loading a file, removing a file or a failed load snaps the deck gains immediately to the selected version's targets. Resuming starts a fresh schedule from a known state.
- **Reduced motion:** the preference affects decorative Motion animations only. The audio crossfade remains, because it is a functional part of A/B listening rather than decoration.

The pure math is in [`crossfade.ts`](../src/audio/crossfade.ts) and is covered directly by unit tests.

## Operation cancellation

Two monotonically increasing tokens coordinate asynchronous work:

- `playSequence` invalidates a pending or in-flight Play when Pause, Replace, Remove or Dispose occurs. A late-resolving `play()` promise checks the token and pauses the element again instead of leaving media running.
- `switchSequence` invalidates pending switches when another switch, a seek, Pause, Replace, Remove or Dispose occurs.

Each deck also has a `generation` counter. Load listeners and timeout callbacks capture their generation and ignore events from a superseded file. That prevents a slow replacement or late metadata event from affecting the current selection.

`dispose()` is idempotent: it increments both tokens, cancels the switch completion timer, stops the ticker, removes lifecycle listeners, pauses elements, revokes object URLs, disconnects nodes and closes the context.

## User-gesture handling

Browsers block audio until a user gesture. Switchroom respects that:

- File intake never creates or resumes an `AudioContext`.
- `play()` is invoked from the Play button click/keyboard activation.
- The engine creates the graph at that point, resumes the context if it is suspended or interrupted, and only starts media elements once the context is running.
- If the browser rejects playback, the engine pauses both decks, restores a consistent state and surfaces: “Audio could not start. Press Play again to retry.”

## Interruption policy

The engine distinguishes a normal pause from a browser/OS interruption:

- Our own pause paths set `isPlaying = false` before pausing the elements, so their `pause` events are ignored.
- A media `pause` event while `isPlaying` is true is treated as an interruption, **unless** the playhead is at the common end. Firefox pauses an element at its end before the ticker or `ended` event observes it; that case finishes playback normally.
- An `AudioContext` `statechange` away from `running` while playing or starting triggers reconciliation: the ticker stops, both decks pause, the selected version settles on the audible deck, the playhead is preserved, `interrupted` becomes true and the status becomes `interrupted`.
- The context becoming `closed` is fatal for the session and produces a reload message.
- Recovery is explicit. Pressing Play resumes the context, restarts both decks at the preserved position and clears the interruption state.
- While a tab is hidden, the ticker pauses and the playhead is published once. Returning to the tab, or a `pageshow` restore, restarts the ticker and republishes the playhead. Playback is not silently restarted after an interruption.

## File intake, metadata and resource lifecycle

Validation happens before any media element is touched:

- Exactly one file per slot.
- A supported extension: `.wav`, `.mp3`, `.flac`, `.aac`, `.m4a`.
- A non-zero file size.
- A plausible audio MIME family, while still allowing a blank or generic type (for example `application/octet-stream`) when the extension is supported, and `video/mp4` for M4A containers.

After validation:

1. Pending transport work is invalidated and playback halts.
2. The old deck media is released and its object URL is revoked.
3. The deck is marked loading, and the surviving deck is seeked to zero.
4. A per-deck generation counter increments.
5. New `loadedmetadata`, `durationchange`, `canplay` and `error` listeners are attached for that generation only.
6. A new object URL is created and assigned to the media element.
7. A 15 s metadata timeout (`DEFAULT_METADATA_TIMEOUT_MS`) is started. It is cleared when the deck settles ready, fails, is replaced, is removed or the engine is disposed.

`loadedmetadata` and `canplay` both settle a deck once a valid duration is available. `canplay` can fire again after a seek, so it only resets a freshly loaded paused deck to zero. `durationchange` updates a later duration change and clamps the playhead if the common duration shrinks.

Stale metadata events are ignored because listeners check the generation. Replacing, removing or failing a file revokes that deck's URL immediately. A failed deck does not block the other slot's metadata display, and Play stays disabled until the failed deck is replaced or removed.

## Codec and browser limitations

- The browser decides whether a file can be decoded. `canPlayType` is treated as a hint; a negative answer produces a warning but still attempts the load.
- WAV/MP3 are the safest cross-browser choices. FLAC is broadly supported in current desktop Chromium/Firefox. AAC/M4A depends on the platform's codec support and the container's actual codec.
- The Playwright WebKit build on Windows used for local verification reports WAV support but does not decode local audio in that environment. This is an environment limitation, not a Switchroom format policy; audio flows are verified in Chromium and Firefox and must be verified manually in branded Safari.
- Very large files are not decoded eagerly. Only metadata is read until playback, keeping the UI responsive.

## Diagnostics hook

In development builds only, `window.__switchroom` exposes `{ engine, getContext }`. `engine.getDeckDiagnostics()` returns `currentTime`, `paused`, `gain`, `ready` and `playAttempts` for each deck; `getContext()` returns the lazily created audio context. Playwright uses these to assert alignment, gain automation, start counts and interruption recovery. The hook is compiled out of production (`import.meta.env.DEV`), and the production smoke test asserts that it is absent.
