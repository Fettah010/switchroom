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

## Canonical playhead and common duration

There is one canonical playhead. It is read from the audible deck, clamped to the shared duration:

- If playing, the time comes from the deck that is currently audible.
- If paused, the time comes from the snapshot's current time.
- The shared duration is `min(original.duration, edited.duration)` when both are valid.
- A mismatch notice appears when the durations differ by more than 50 ms.
- Seeking sets both deck elements to the same clamped target.
- The animation-frame ticker publishes the playhead to the timeline separately from the main snapshot, so only the timeline re-renders during playback.
- Playback ends when the playhead reaches the shared duration (with a 30 ms tolerance). Replaying from the end seeks both decks to zero first.

Both files can be any length. Switchroom does not pad the shorter file or extend the comparison beyond the common duration.

## Switching and synchronization

`switchTo(version)` keeps the current time rather than restarting:

1. Record the canonical time.
2. Update the selected version in the snapshot so the UI responds immediately.
3. If paused, snap the gains to the new targets.
4. If playing, compare the target deck's element time with the canonical time. If they differ by more than 50 ms, seek the target and wait for its `seeked` event (up to 600 ms).
5. If the target is paused, start it.
6. Schedule the crossfade.
7. If alignment or restart fails, restore the previous audible version, restore its gains and show a specific error instead of leaving a silent or half-muted state.

A monotonically increasing switch sequence token invalidates older asynchronous switches when the user switches rapidly.

## Crossfade model

- **Default duration:** 180 ms (`DEFAULT_CROSSFADE_MS`).
- **Curve:** linear amplitude, from the current interpolated gain to the target. The two sides are complementary, so the summed gain is 1 throughout a normal switch.
- **Scheduling lead:** 5 ms, so automation never starts in the past.
- **Bookkeeping:** the engine keeps the scheduled ramp (`startValue`, `endValue`, `startTime`, `endTime`) and interpolates it itself. `AudioParam.value` is not reliable while automation is scheduled.
- **Interrupted fades:** a new fade starts from the currently interpolated gain and cancels/rebases the automation. Repeated switching therefore does not stack ramps or produce jumps.
- **Pause and load:** pausing, loading a file, removing a file or a failed load snaps the deck gains immediately to the selected version's targets. Resuming starts a fresh schedule from a known state.
- **Reduced motion:** the preference affects decorative Motion animations only. The audio crossfade remains, because it is a functional part of A/B listening rather than decoration.

The pure math is in [`crossfade.ts`](../src/audio/crossfade.ts) and is covered directly by unit tests.

## User-gesture handling

Browsers block audio until a user gesture. Switchroom respects that:

- File intake never creates or resumes an `AudioContext`.
- `play()` is invoked from the Play button click/keyboard activation.
- The engine creates the graph at that point, resumes the context if it is suspended and only starts media elements once the context is running.
- If the browser rejects playback, the engine pauses both decks, restores a consistent state and surfaces: “Your browser blocked audio playback. Press Play again.”

## File intake and resource lifecycle

Validation happens before any media element is touched:

- Exactly one file per slot.
- A supported extension: `.wav`, `.mp3`, `.flac`, `.aac`, `.m4a`.
- A non-zero file size.
- A plausible audio MIME family, while still allowing a blank type and `video/mp4` for M4A containers.

After validation:

1. Playback halts and the old deck media is released.
2. The old object URL is revoked.
3. A per-deck generation counter increments.
4. New `loadedmetadata`, `durationchange` and `error` listeners are attached for that generation only.
5. A new object URL is created and assigned to the media element.

Stale metadata events are ignored because listeners check the generation. `dispose()` is idempotent and revokes every object URL, disconnects nodes, pauses elements and closes the context. Replacing, removing or failing a file also revokes that deck's URL immediately.

## States

The snapshot status is one of:

| Status       | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `empty`      | Neither slot has a file.                                       |
| `incomplete` | Exactly one slot has a file.                                   |
| `loading`    | At least one deck is reading metadata.                         |
| `ready`      | Both decks are loaded and playback has not started yet.        |
| `playing`    | Playback is running.                                           |
| `paused`     | Both files are ready and playback has started at least once.   |
| `error`      | A deck failed, or a global playback/switch error was reported. |

A failed file never blocks the other slot's metadata display. The failed deck shows a slot-specific error and Play remains disabled until it is replaced or removed.

## Codec and browser limitations

- The browser decides whether a file can be decoded. `canPlayType` is treated as a hint; a negative answer produces a warning but still attempts the load.
- WAV/MP3 are the safest cross-browser choices. FLAC is broadly supported in current desktop Chromium/Firefox. AAC/M4A depends on the platform's codec support and the container's actual codec.
- The Playwright WebKit build on Windows used for local verification reports WAV support but does not decode local audio in that environment. This is an environment limitation, not a Switchroom format policy; audio flows are verified in Chromium and Firefox and must be verified manually in branded Safari.
- Very large files are not decoded eagerly. Only metadata is read until playback, keeping the UI responsive.

## Diagnostics hook

In development builds only, `window.__switchroom.engine` exposes the engine. `getDeckDiagnostics()` returns `currentTime`, `paused`, `gain` and `ready` for each deck; Playwright uses it to assert alignment and gain automation. The hook is compiled out of production (`import.meta.env.DEV`), and the production smoke test asserts that it is absent.
