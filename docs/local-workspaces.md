# Local Workspaces in Switchroom

Switchroom v0.4.0 introduces local workspaces. Workspaces allow audio engineers and producers to name comparisons, store client review notes, track change logs, configure presentation layouts, and customize transition durations across sessions without compromising privacy.

## Architecture & Storage Model

Switchroom's storage engine is local-first, privacy-preserving, and offline-capable:

```text
┌────────────────────────────────────────────────────────┐
│                      Switchroom UI                     │
└───────────────────────────┬────────────────────────────┘
                            │
              WorkspaceProvider & Hooks
                            │
               LocalWorkspaceRepository
              ┌─────────────┴─────────────┐
              ▼                           ▼
IndexedDbWorkspaceRepository    InMemoryWorkspaceRepository
   (switchroom-local DB)         (Transient / Private Mode)
```

### IndexedDB Database Specification

- **Database Name:** `switchroom-local`
- **Schema Version:** `1`
- **Object Stores:**
  1. `workspaces`: stores `WorkspaceRecord` items.
     - Primary key: `id` (string, generated UUID or cryptographically random identifier).
     - Index: `updatedAt` (integer, epoch timestamp in milliseconds).
     - Index: `createdAt` (integer, epoch timestamp in milliseconds).
  2. `preferences`: stores user preferences.
     - Primary key: `id` (string; default key is `local-preferences`).

### In-Memory Fallback

When IndexedDB is blocked, unsupported, or restricted by strict private-browsing configurations, Switchroom seamlessly falls back to `InMemoryWorkspaceRepository`. The user is notified with an inline storage alert, and full comparison functionality remains accessible for the active session.

## Strict Local Privacy Guarantees

Switchroom is built on an unconditional privacy contract:

> **Your audio files and decoded sound never leave your device and are never written to browser databases.**

Specifically:

- **No audio payloads:** `Blob`, `File`, `ArrayBuffer`, decoded PCM, or waveform peak arrays are never serialized to IndexedDB.
- **No filesystem paths:** Switchroom never captures or persists absolute local directory paths.
- **Media descriptors only:** To facilitate reopening, Switchroom saves non-sensitive media descriptors:
  - `name`: filename (e.g., `Master_v2.wav`)
  - `size`: byte size (e.g., `45123048`)
  - `type`: MIME type (e.g., `audio/wav`)
  - `durationSec`: duration in seconds (e.g., `184.2`)

## The Truthful Relink Workflow

Because audio binaries are never stored in browser databases, refreshing the page or reopening a saved comparison leaves the audio player unloaded.

Rather than hiding this limitation behind fragile browser blob caches or deceptive state, Switchroom embraces truthful UX:

1. When reopening a workspace, all metadata (title, client description, internal engineering notes, tags, presentation layout, crossfade duration) is loaded immediately.
2. A **Relink Media Notice** appears, listing the expected file names and sizes for both the Original and Edited slots.
3. The file slots display placeholder cards indicating which file is needed.
4. When the user drops or selects the corresponding files, Switchroom verifies the file descriptors, restores the active timeline, generates waveform previews, and enables playback.

## Clearing Local Data

The Settings dialog provides a "Clear local workspaces" option with double confirmation. Invoking this action:

- Deletes the IndexedDB database (`switchroom-local`).
- Clears local workspace and preference state in memory.
- Leaves audio files on your disk completely untouched.
