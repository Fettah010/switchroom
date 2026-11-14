# Switchroom v0.4.0 — Local Workspaces and Presentation Polish

**Document type:** Expanded, agent-ready release execution plan  
**Target release:** `v0.4.0`  
**Starting release:** `v0.3.0`  
**Application:** <https://switchroom.ftallfettah.workers.dev/>  
**Repository:** <https://github.com/Fettah010/switchroom>  
**Architecture:** React 19 + TypeScript + Vite + Motion for React + Web Audio API + Cloudflare Workers Static Assets.  
**Release principle:** v0.4 remains a complete, useful, local-first app. It adds local workspace metadata and reusable presentation views, but it does not introduce a cloud backend or client sharing.

---

## 0. Instructions to the implementation agent

You are implementing v0.4 of an existing product. Do not treat this document as permission to redesign the whole application or to implement later roadmap milestones early.

### 0.1 Start with the actual repository state

Before editing:

```bash
git status --short --branch
git log -8 --oneline --decorate
git branch --all --verbose --no-abbrev
git tag --list --sort=-version:refname | head -20
```

Then inspect the current `main` branch, the v0.3.0 tag, the deployment record and all local/untracked work. The user has accepted the current v0.3 direction. Do not discard that work or assume a clean checkout without checking.

Read at least:

- `README.md`
- `CHANGELOG.md`
- `IMPLEMENTATION_LOG.md` if present
- `docs/decisions.md`
- `docs/waveform.md`
- `docs/audio-engine.md`
- `docs/deployment.md`
- `docs/browser-support.md`
- The current v0.3.0 release and its expanded execution plan

Run the existing v0.3 verification suite before implementation and record its real results. If the worktree differs from the online repository, treat the local worktree as potentially containing user work that must be preserved.

### 0.2 Work method

1. Make a short, evidence-based implementation map before coding.
2. Keep the existing audio engine stable. The v0.4 project model must not become a second audio engine or playhead owner.
3. Add storage behind a small repository interface. React components must not call IndexedDB APIs directly.
4. Add one vertical slice at a time: model → persistence → list → editor → reopen/relink → manifest import/export → layouts → preview/settings.
5. Test every vertical slice before beginning the next one.
6. Keep the public app functional throughout. Do not merge a half-built dashboard or settings panel.
7. Update docs and screenshots only after the final UI is real.
8. Publish v0.4.0 only after all acceptance gates pass.

### 0.3 Mandatory constraints

- Preserve React 19, TypeScript, Vite, Motion for React, Web Audio API, the current `ABAudioEngine`, current waveform subsystem, current `RangeControl`, and Cloudflare Workers Static Assets unless a concrete, demonstrated issue requires a small change.
- Prefer native IndexedDB over a new storage framework. Do not add a dependency merely to wrap a small metadata database.
- Do not persist audio bytes, decoded PCM, peak arrays, object URLs, local file paths or file handles.
- Do not add cloud storage, a server API, account system, telemetry or external audio processor.
- Keep privacy language plain and explicit. A local workspace stores metadata, not the audio recordings.
- Do not use filenames as proof that two audio files are identical. Reopening a workspace requires the user to select the original source files again.
- Do not claim that local workspaces are backups. Browser storage can be cleared or evicted; the JSON manifest is the portable metadata backup.
- Do not let workspace persistence errors break the current in-memory A/B player.
- All meaningful UI must work with keyboard, mouse and touch. All nonessential motion must respect `prefers-reduced-motion` and the app-level motion preference.
- Do not add fake or placeholder controls for later versions.

---

## 1. Release mission

### 1.1 Purpose

v0.3 made Switchroom visually useful for comparing two recordings: real A/B waveforms, one shared timeline, seek interaction, a stable transport, custom sliders and coordinated motion.

v0.4 should make it possible to **prepare, name, save and reopen the comparison setup locally**, without uploading the user's audio. It should also let the creator choose how the comparison is presented and preview that presentation locally before a future sharing milestone.

The core user value is:

> “I can organize multiple comparison sessions, reopen one later, restore its settings and presentation, and prepare a clean local review view—while my actual audio files remain under my control.”

### 1.2 Required outcomes

By the end of v0.4, a user can:

1. Create a new local comparison workspace.
2. Give it a title, description, labels and notes.
3. Save its metadata and preferred crossfade duration in IndexedDB.
4. See a recent-workspaces list on the app's home screen.
5. Open an existing workspace after refresh or browser restart.
6. Understand that audio files were not saved and reselect Original and Edited files to resume listening.
7. Export one workspace as a portable JSON manifest.
8. Import a valid manifest as a new local workspace without silently overwriting an existing workspace.
9. Choose among reusable presentation layouts: standard, player-focused, waveform-focused and compact review.
10. Open a local client-preview mode that demonstrates the review presentation without creating a public link or allowing metadata/file management.
11. Configure theme, motion preference, default crossfade and default presentation layout in a small settings panel.
12. Continue comparing audio if IndexedDB is blocked, unavailable or full; only the save/reopen functionality should degrade.

### 1.3 Keep the v0.3 core intact

All current v0.3 functions remain:

- Two local audio slots (Original A and Edited B).
- WAV, MP3, FLAC, AAC and M4A acceptance, subject to browser codec support.
- One shared timeline and playhead.
- Real A/B switching and Web Audio crossfade.
- Waveform analysis and honest fallback states.
- Volume, mute and crossfade controls.
- Theme behaviour, keyboard operation, responsive layouts and reduced motion.

Do not weaken existing waveform, audio, slider or transport tests to make workspace features pass.

---

## 2. Verified v0.3 baseline and architecture to preserve

The current public app and repository were inspected on 2026-11-10. The live URL reports `v0.3.0`. The repository records a v0.3 codebase with:

- `src/audio/ABAudioEngine.ts` and the browser audio host as the single playback authority.
- `usePlayer` for player snapshot state and `usePlayhead` for the high-frequency time subscription.
- `src/waveform/` for independent analysis, worker processing, resource budgets and per-slot state.
- `ComparisonWaveform` and `WaveformCanvas` for the two shared-axis waveform lanes.
- `RangeControl` for timeline, volume and crossfade slider presentation.
- `Reveal` and Motion for React for page and workspace motion.
- `ThemeProvider` and theme utilities for System / Dark / Light selection.
- Vite + Cloudflare Vite plugin and Wrangler for static deployment.

The current documented baseline is 185 Vitest tests, 34 Chromium Playwright specs and 34 Firefox Playwright specs. WebKit on Windows currently skips audio-dependent cases because local media decode is unavailable in that environment. Verify the latest actual counts before using them as a baseline.

### 2.1 Architecture rule: separate the workspace domain from playback

The local workspace is metadata about a comparison, not a new audio engine.

```text
App shell
├── Home / Recent Workspaces
├── Workspace Editor
│   ├── Workspace metadata editor
│   ├── Existing Original / Edited file slots
│   ├── Existing ABAudioEngine provider
│   ├── Existing waveform services and shared timeline
│   └── Presentation mode selector
├── Local Client Preview (view over the same in-memory workspace)
└── Settings panel

LocalWorkspaceRepository
└── IndexedDB (metadata only)
    ├── workspaces
    └── preferences

Manifest service
└── JSON validation / import / export

Existing ABAudioEngine and WaveformService remain independent.
```

The `LocalWorkspaceRepository` reads and writes records. The player engine receives selected `File` objects only from the current browser session. Never let IndexedDB become a direct input to the audio engine.

---

## 3. v0.4 scope contract

### 3.1 Included

**Local workspace management**

- Local workspace entity with title, description, labels, notes and timestamps.
- Per-workspace preferred crossfade duration.
- Per-workspace presentation layout preference.
- Recent local workspace list, sorted by last opened/updated time.
- Create, edit, open, rename, delete and export one workspace.
- Save state that clearly reports `Saving`, `Saved locally`, `Unsaved changes` and storage errors.

**Local persistence**

- IndexedDB stores workspace metadata and app preferences only.
- Database schema versioning and a migration path.
- Safe behaviour for blocked/failed database access, quota errors and unavailable storage.
- A visible way to clear local workspace metadata and reset preferences.

**Portable metadata manifest**

- Export a workspace as a JSON manifest.
- Import and validate a manifest as a new local workspace.
- Manifest schema version, app identifier, export timestamp, metadata and media descriptors.
- No audio bytes, PCM, peaks, object URLs, file paths or cloud credentials in a manifest.

**Presentation**

- Standard layout.
- Player-focused layout.
- Waveform-focused layout.
- Compact review layout.
- Per-workspace layout choice.
- Local client-preview mode over the active workspace.
- A more useful home/landing screen centred on creating and reopening local workspaces.
- A focused settings panel for theme, motion preference, default crossfade and default presentation layout.

### 3.2 Explicitly excluded — do not implement in v0.4

**No cloud or accounts**

- No Worker API, Hono, D1, R2, server endpoints or backend data model.
- No Better Auth, Google/GitHub OAuth, user profiles or sign-in.
- No guest creator tokens, server-side ownership or recovery links.
- No file upload, remote streaming or server-side processing.

**No real client-sharing product**

- No share URL, public/unlisted/private link, password protection or invitation.
- No multi-user access, client account or remote client session.
- No comments, replies, timestamped comments, votes, reactions or review feedback.
- No email, notifications or link analytics.

**No audio-file persistence or new audio tooling**

- Do not store source files, file blobs, PCM, decoded AudioBuffers or object URLs in IndexedDB.
- Do not save `FileSystemFileHandle` values or request permanent file-system permissions.
- No background media reattachment based only on filename.
- No trimming, loop regions, bookmarks, markers, annotations, selection ranges, editing, effects, EQ, normalization, transcoding or export rendering.
- No new audio formats and no universal compressed-codec guarantee.

**No platform expansion**

- No service worker, PWA installation flow, offline asset cache or background sync in this release.
- No framework or router migration solely to create home/editor/preview views.
- No mobile native application or cloud sync.

The v0.4 client preview is a local presentation preview only. It does not give a client access to the project.

---

## 4. Product experience and interaction specification

### 4.1 Home / landing experience

When no workspace is open, the home screen becomes the main entry point. Retain Switchroom's editorial, premium-minimal visual language; do not turn it into a generic admin dashboard.

Required content:

- Switchroom brand and a concise product statement.
- Primary `New comparison` action.
- A recent local workspaces section.
- Each workspace row/card displays title, labels (if any), last-updated/last-opened information, preferred crossfade and whether media will need to be reselected.
- Clear actions: Open, Export, Rename/Edit and Delete.
- Import manifest action.
- Settings access.
- A first-use state that explains local workspace metadata and audio-file handling without a wall of text.

List behaviour:

- Sort recent workspaces by `lastOpenedAt`, then `updatedAt`, newest first.
- Show a compact recent subset initially; allow the user to reach all locally stored workspaces without adding an elaborate project manager.
- Display an honest message when the list is empty.
- Provide a useful storage-error state if IndexedDB cannot be opened.
- Do not fabricate example workspaces or use seeded sample project data in production.

The home screen should keep the `New comparison` action prominent. It should not require the user to create an account or upload anything.

### 4.2 Workspace editor

The current v0.3 comparison workspace becomes the editor view for one local workspace.

Required metadata fields:

| Field               | Requirement                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Title               | Required, default `Untitled comparison`; trim leading/trailing whitespace; 1–120 characters.            |
| Description         | Optional, plain text, up to 2,000 characters.                                                           |
| Labels              | Optional list, maximum 12 labels, maximum 40 characters each; trim and de-duplicate case-insensitively. |
| Notes               | Optional plain text, up to 10,000 characters.                                                           |
| Preferred crossfade | Integer from 80 to 600 ms in 20 ms increments; defaults to the global setting (180 ms initially).       |
| Presentation layout | One of the four supported layout identifiers; defaults to Standard.                                     |

Use a compact metadata editing area that does not push the audio player far below the fold. The title should remain visually prominent, while description, labels and notes can be edited in a secondary panel or drawer.

Save behaviour:

- Save metadata changes to IndexedDB with a short debounce (approximately 400–700 ms) after a user edit, or use an explicit Save action if the current implementation makes autosave unreliable. Choose one consistent behaviour, not both competing save systems.
- Show a truthful save status near the workspace title or metadata panel.
- Do not show `Saved` until the IndexedDB transaction completes successfully.
- If a write fails, preserve in-memory edits and show `Could not save locally` with a retry action.
- Navigating away with a pending write must await/cancel safely or show an unsaved-change warning. Never silently discard user-entered metadata.

Keep file loading/replacing/removing in the existing slots. Do not copy media bytes into the workspace record.

### 4.3 Reopening and relinking audio

This is the most important privacy/expectation boundary in v0.4.

When a workspace is reopened after the page was refreshed or the browser was closed:

- Restore title, description, labels, notes, crossfade preference, presentation mode and recorded media descriptors.
- Do not claim that the original audio has been saved.
- Show both media slots as requiring relink/selection unless the same file objects are still held in the current in-memory session for that same workspace.
- Provide a clear `Choose Original file` / `Choose Edited file` action for relinking.
- Allow the user to relink either side independently.
- Enable Play and waveform comparison only when both actual audio files are loaded and ready, as in v0.3.

A media descriptor may include filename, extension, MIME type, byte size, lastModified timestamp and last-known duration. It is only a reminder/checklist, not proof of file identity.

Never silently attach a newly chosen file solely because its filename matches the saved descriptor. A name match can be shown as a hint, but the user's explicit selection is required. If size, modification time or file name differs, show a non-blocking warning so the user can confirm they chose the intended asset.

When switching from one local workspace to another, do not leave the old workspace's audio accidentally active under the new title. Clear or explicitly retain the current in-memory file pair only when the active workspace identity is unchanged and the UI makes that behaviour clear.

### 4.4 Recent workspace actions

- **Open:** opens the metadata record and loads its preferences; if media is not present in this tab, show relink actions.
- **Rename/Edit:** opens the same metadata editor; do not create a duplicate record.
- **Export:** downloads one `.switchroom.json` manifest for that workspace.
- **Delete:** removes only that metadata record after confirmation. It must not pretend to delete original media from the user's disk.
- **New comparison:** creates a new workspace with global defaults, then opens the editor.

Deletion confirmation must state that only the local Switchroom workspace metadata will be removed. It does not delete source audio files.

Do not add bulk move, folders, project templates, cloud status, team members, or advanced search/filtering in v0.4.

---

## 5. Local persistence architecture

### 5.1 IndexedDB, metadata only

Create a small, versioned database, for example:

- Database name: `switchroom-local`
- Initial schema version: `1`
- Object store: `workspaces`, key path `id`
- Object store: `preferences`, key path `key`

Suggested `workspaces` indexes:

- `updatedAt`
- `lastOpenedAt`

Add indexes only when an actual query needs them. The recent-workspaces screen can fetch and sort a modest local metadata collection without a complex query engine.

Suggested `preferences` entries:

- `motionPreference`
- `defaultCrossfadeMs`
- `defaultPresentationLayout`

Keep the existing theme override in its current localStorage key (`switchroom.theme`). The small pre-paint script in `index.html` reads that key synchronously before React starts; IndexedDB is asynchronous and must not become a second competing source of truth for the theme. Do not duplicate `themeMode` in the IndexedDB preferences store. Use IndexedDB for workspace records and the other non-critical preferences, and document this split explicitly.

**Important:** IndexedDB is asynchronous and transactional. Use `versionchange` for schema upgrades and normal `readonly` / `readwrite` transactions for data access. Handle `blocked`, `versionchange`, request errors and transaction aborts. Close old connections when a database version change is requested. See the official MDN IndexedDB guidance in the references.

### 5.2 Repository abstraction

Introduce a narrow interface such as:

```ts
interface LocalWorkspaceRepository {
  listRecent(limit?: number): Promise<WorkspaceRecord[]>;
  getById(id: string): Promise<WorkspaceRecord | null>;
  create(record: WorkspaceRecord): Promise<void>;
  update(record: WorkspaceRecord): Promise<void>;
  deleteById(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

interface LocalPreferencesRepository {
  get(): Promise<LocalPreferences>;
  update(patch: Partial<LocalPreferences>): Promise<LocalPreferences>;
  reset(): Promise<void>;
}
```

The exact method names can follow the project's style. Keep the interface small and avoid generic CRUD abstractions that obscure IndexedDB transactions.

Requirements:

- No React component opens a database connection directly.
- No audio engine module imports the workspace repository.
- Repository methods return typed values and normalised errors.
- A failed write never produces a success indicator.
- Read and write operations use transactions with explicit completion/error handling.
- The repository can be tested with an injected storage adapter or deterministic fake.
- Browser tests must also exercise the actual IndexedDB implementation.

### 5.3 Data model

A first-pass data model can be:

```ts
type PresentationLayout = 'standard' | 'player-focused' | 'waveform-focused' | 'compact-review';

interface MediaDescriptor {
  fileName: string;
  extension: string | null;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  durationSeconds: number | null;
}

interface WorkspaceRecord {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  labels: string[];
  notes: string;
  preferredCrossfadeMs: number;
  presentationLayout: PresentationLayout;
  originalMedia: MediaDescriptor | null;
  editedMedia: MediaDescriptor | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

interface LocalPreferences {
  motionPreference: 'system' | 'reduced';
  defaultCrossfadeMs: number;
  defaultPresentationLayout: PresentationLayout;
}
```

This is a proposal; the agent may refine naming, but the persisted meaning and exclusions must remain. Timestamps should be ISO 8601 strings in UTC. Use `crypto.randomUUID()` for local IDs in supported secure browser contexts; provide a tested fallback only if the runtime matrix requires it.

**Never add these properties to a persisted workspace record:**

- `File`, `Blob`, `ArrayBuffer`, `Float32Array`, `AudioBuffer` or `AudioData`.
- Object URL, `blob:` URL or media element source.
- Absolute file path, directory path or drive letter.
- `FileSystemFileHandle` or other persistent filesystem handle.
- Raw waveform samples or peak arrays.
- Audio engine, AudioContext or MediaElement instance.
- Auth tokens, cookies, cloud IDs, presigned URLs or future share tokens.

A TypeScript type is not the security boundary by itself. Add tests that inspect actual stored values and imported/exported JSON to verify that prohibited media-bearing fields cannot enter storage.

### 5.4 Storage failures and quota behaviour

The app must distinguish:

- IndexedDB unavailable/blocked.
- Database upgrade blocked by another open tab.
- Read failure.
- Write transaction failure.
- `QuotaExceededError` or storage denial.
- Corrupt/unsupported stored record.

The comparison player remains usable in the current tab if storage fails. Show a small, accessible warning and a retry path. Do not crash the app or lose already-selected in-memory audio.

Use `navigator.storage.estimate()` only as optional diagnostic context; do not show a made-up “remaining space” meter or rely on the estimate as a guarantee. Browser quota and eviction rules vary. Do not request persistent storage automatically or imply that metadata is guaranteed to remain forever.

### 5.5 Clear local data

The Settings panel must provide a clearly labelled `Clear local workspaces` action.

- Confirm before deleting records.
- Explain that the action deletes saved Switchroom metadata and local preferences only.
- Explain that it does not delete the user's actual audio files.
- After confirmation, delete workspace metadata and reset IndexedDB preferences to defaults; also reset only Switchroom's `switchroom.theme` key to System.
- Do not clear unrelated browser storage, origin storage, Cache Storage or files on disk.
- Ensure the app returns to a safe home/first-run state after clearing.

---

## 6. Workspace manifest import/export

### 6.1 Manifest purpose

A manifest is a portable description of one local comparison setup. It is not an audio archive, backup of the audio recordings, or a shareable client review link.

Use a clear extension such as `.switchroom.json`.

### 6.2 Suggested manifest format

```json
{
  "app": "switchroom",
  "manifestVersion": 1,
  "exportedAt": "2026-11-10T12:00:00.000Z",
  "workspace": {
    "title": "Mix comparison — chorus revision",
    "description": "Compare the revised chorus balance.",
    "labels": ["mix", "chorus"],
    "notes": "Check the vocal level around the second refrain.",
    "preferredCrossfadeMs": 180,
    "presentationLayout": "waveform-focused",
    "originalMedia": {
      "fileName": "original.wav",
      "extension": "wav",
      "mimeType": "audio/wav",
      "sizeBytes": 64000000,
      "lastModified": 1794300000000,
      "durationSeconds": 337.2
    },
    "editedMedia": null
  }
}
```

The sample is illustrative; do not hardcode sample data into the app. Export only the fields defined by the manifest schema. Do not include a local database ID if imported copies should always receive a new local ID; if an origin ID is useful for reference, use an explicitly named optional `sourceWorkspaceId` field and never use it to overwrite by default.

### 6.3 Export behaviour

- Export one selected workspace at a time.
- Validate and normalise the record before serialisation.
- Produce readable JSON with UTF-8 encoding.
- Use a safe filename derived from the title; remove path separators/control characters and keep a sensible length.
- Include the manifest version and export timestamp.
- Revoke the generated JSON object URL after the download is initiated and no longer needed.
- Show an honest confirmation that the manifest contains settings/metadata, not the audio.

### 6.4 Import behaviour

- Accept a user-selected `.json` manifest; do not fetch arbitrary remote URLs.
- Enforce a conservative file-size cap (for example 1 MiB) before reading.
- Parse JSON with error handling.
- Validate `app`, `manifestVersion`, required fields, enum values, string lengths, label count/length, timestamps and crossfade range/step.
- Ignore unknown optional fields safely, but reject unsupported future manifest versions with a clear message.
- Normalise whitespace and labels after validation.
- Do not render imported notes/descriptions as HTML. Render plain text only.
- Generate a new local workspace ID on import.
- If a workspace with equivalent title/metadata already exists, do not silently overwrite it. Import as a new copy or give the user a clear collision choice.
- Never import audio bytes or assume files can be restored from a manifest.
- Once imported, show the workspace as needing local media selection where descriptors exist.

### 6.5 Manifest tests

Cover:

- Valid minimal manifest.
- Full manifest with all fields.
- Missing required field.
- Wrong app identifier.
- Unsupported future version.
- Malformed JSON.
- Oversized manifest.
- Invalid crossfade value or step.
- Invalid layout enum.
- Too many/too-long labels.
- Long strings and whitespace normalisation.
- HTML/script-looking text remains inert plain text.
- Duplicate import creates a distinct workspace rather than silently overwriting.
- Imported descriptor does not automatically claim the media is present.
- No Blob/File/ArrayBuffer/URL/path is present in export.

---

## 7. Presentation layout system

### 7.1 Shared principles

The four modes are reusable arrangements of the same v0.3 controls and data, not different player implementations. There must still be one audio engine, one shared timebase, the same two waveforms and the same canonical seek operation.

Keep a cohesive design system across all modes. Do not make every mode a different theme or a new page builder.

### 7.2 Standard layout

- Default mode.
- Balanced file slots, player controls and waveform.
- Best general-purpose editing/comparison view.
- Closest to the accepted v0.3 workspace composition.

### 7.3 Player-focused layout

- Make the transport and A/B version selector the dominant area.
- Keep waveform and file identity accessible but visually secondary.
- Avoid hiding necessary status, duration mismatch or relink information.
- Do not introduce a mini-player or a second playback control set.

### 7.4 Waveform-focused layout

- Give the two waveform lanes more vertical room and visual priority.
- Preserve their common time axis, active version indication, playhead and pointer seeking.
- Keep the transport and timeline slider reachable without scrolling through excessive content.
- Do not add zoom, pan, region selection, per-channel rendering or editing tools.

### 7.5 Compact review layout

- Reduce vertical space for the title/description, file identity rows and player controls.
- Keep both Original/Edited identity labels visible.
- Keep playback, A/B switch, seek, volume and status accessible.
- Avoid shrinking hit targets below accessible touch/keyboard requirements.
- Suitable for a narrower browser panel or a compact presentation, not a separate mobile-only product.

### 7.6 Layout switching

- Provide one clear `Layout` control with an accessible label and four named choices.
- Update the active workspace immediately.
- Persist the chosen layout in that workspace record.
- Do not persist a separate local layout copy that can conflict with the workspace choice.
- On narrow screens, adapt each layout while keeping controls reachable. The selected layout is a preference, not permission to cause horizontal overflow.
- Check transitions between modes for layout jumps; use short, reduced-motion-aware transitions. Do not animate the audio canvas in a way that delays seek.

---

## 8. Local client-preview mode

### 8.1 Purpose

The client-preview mode lets the creator inspect how the current local comparison will look when presented cleanly. It is a local view, not a sharing mechanism.

### 8.2 Required behaviour

- Enter preview from an open workspace.
- Show the current title and optional description.
- Show Original and Edited identity and the shared waveform/timeline.
- Keep the playback controls needed for a listener: Play/Pause, A/B selection, seek, volume and audible-version state.
- Apply the selected presentation layout.
- Hide or disable creator-only metadata editing, file replacement/removal, import/export and workspace management while preview is active.
- Provide a prominent but restrained `Exit preview` action.
- If one or both audio files need to be reselected, show a clear missing-media state rather than a fake working preview.

### 8.3 Truthful local-only boundaries

Use copy such as `Local preview — this view has not been shared`. Make it clear that:

- No URL was created.
- No other person can access the current preview.
- No audio was uploaded.
- No comments, votes or review feedback are collected.

Do not build a public route, invite flow, guest session, read-only bearer token or client-side permission model in v0.4. Those belong to later sharing milestones.

### 8.4 Preview state rules

- Preview mode is ephemeral UI state, not a separate saved workspace.
- Exiting preview returns to the same editor and active workspace.
- The selected playback position may continue normally while preview is open; do not create a second playhead.
- A workspace switch, deletion or media relink while in preview must exit or safely update preview with a clear state.
- Preview must not mutate workspace metadata.

---

## 9. Settings panel

### 9.1 Included settings

Keep the panel small. It is not a general-purpose configuration dashboard.

| Setting                     | Values                                                        | Default / behaviour                                                                                                                           |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme                       | System / Dark / Light                                         | Preserve the existing System default and current theme behaviour.                                                                             |
| Motion                      | System / Reduced                                              | System follows `prefers-reduced-motion`; Reduced forces nonessential motion off. Never force full motion when the OS requests reduced motion. |
| Default crossfade           | 80–600 ms, 20 ms steps                                        | 180 ms initially; applies to new workspaces. Existing workspace values remain unchanged.                                                      |
| Default presentation layout | Standard / Player-focused / Waveform-focused / Compact review | Standard initially; applies to new workspaces. Existing workspace layout remains unchanged.                                                   |

### 9.2 Explicitly do not add

- Saved volume, mute state, playhead position, audio output device selection or audio file selection.
- Keyboard shortcut editor.
- Cloud account or privacy settings for future server features.
- Advanced waveform controls.
- Per-device sync or browser profile migration.

### 9.3 Persistence and precedence

- Global motion, crossfade and layout defaults live in the IndexedDB preferences repository.
- Theme remains exclusively in the existing `switchroom.theme` localStorage key and is read by the pre-paint theme script/provider.
- Workspace-specific crossfade and layout override global defaults.
- Changing a global default must not rewrite existing workspace records.
- Changing an active workspace's crossfade or layout updates that workspace record, not the global default.
- Make this precedence visible in labels/help text so users understand why a saved workspace may use a different duration or layout from Settings.

---

## 10. Detailed implementation phases

The order below is intentional. Do not begin presentation layout work before workspace persistence and relinking are reliable.

### Phase 0 — Repository audit and v0.3 release baseline

**Tasks**

1. Inspect local and remote Git state, v0.3.0 tag, latest deployment and any uncommitted user changes.
2. Read the current architecture and v0.3 notes.
3. Run the v0.3 baseline checks.
4. Capture current screenshots in dark/light and 360 px mobile.
5. Confirm the only existing persisted preference and list all browser storage writes.
6. Produce a short map of which current components become Home, Editor, Preview and Settings.

**Acceptance**

- No user changes discarded.
- Baseline build and tests are recorded.
- The agent can explain the current file lifecycle and audio engine boundary.
- Existing audio/waveform behaviour is unchanged at the end of this phase.

### Phase 1 — Define and validate workspace domain models

**Tasks**

1. Add typed `WorkspaceRecord`, `MediaDescriptor`, `PresentationLayout`, `LocalPreferences` and manifest types.
2. Add pure validators and normalisers for all fields.
3. Define ID and timestamp helpers.
4. Define crossfade range/step validation using existing audio constants rather than duplicating magic numbers.
5. Define the rule that media descriptors are metadata only and are never authoritative file identity.
6. Define schema and manifest version numbers separately: IndexedDB database version controls storage migrations; `manifestVersion` controls portable JSON compatibility.

**Acceptance**

- All allowed fields have explicit types and limits.
- Invalid values are rejected or normalised deterministically.
- Tests prove that no audio-bearing field exists in the persisted model.
- No UI or storage implementation has been coupled to `ABAudioEngine`.

### Phase 2 — Implement the IndexedDB repository

**Tasks**

1. Create `src/workspaces/` or a similarly isolated domain folder.
2. Add a database opener and schema version 1.
3. Create the `workspaces` and `preferences` object stores and only the necessary indexes.
4. Implement repository interfaces for create/list/get/update/delete/clear and preferences get/update/reset.
5. Add transaction-completion handling; do not report success when a request succeeds but its transaction later aborts.
6. Handle database `blocked`, `versionchange`, open errors and unavailable IndexedDB.
7. Ensure connections close safely on application teardown or version change.
8. Preserve the existing pre-paint theme behaviour: `switchroom.theme` remains in localStorage, while motion/crossfade/layout preferences use IndexedDB.
9. Add deterministic tests through a fake storage port or injected repository adapter.

**Acceptance**

- CRUD works for metadata records.
- Recent list is sorted correctly.
- Storage errors become typed/visible errors.
- Existing v0.3 file loading and playback tests still pass.
- Inspection of actual database values confirms no audio bytes, blob URLs or file handles are stored.

### Phase 3 — Build the local home screen and recent list

**Tasks**

1. Add a simple app-level view model for Home, Workspace Editor and Local Preview. Do not introduce a routing dependency unless the existing architecture genuinely requires it.
2. Make Home the default entry when no workspace is active.
3. Add `New comparison`.
4. Add recent workspace rows/cards using real IndexedDB records.
5. Add Open, Rename/Edit, Export and Delete actions as the related workflows become available; disable/unavailable actions must not be fake buttons.
6. Add empty, loading, error and no-storage states.
7. Keep the premium editorial visual language and avoid a generic SaaS project dashboard.
8. Reuse existing design tokens, components and icon set.

**Acceptance**

- Empty-state and recent-list states are understandable.
- Recent list reflects real saved metadata after reload.
- Open and Delete actions are real and correctly scoped.
- No dummy workspaces or hardcoded sample projects appear in production.
- Mobile list actions remain touch-accessible.

### Phase 4 — Workspace creation, metadata editor and save state

**Tasks**

1. `New comparison` creates a workspace record with generated ID and defaults.
2. Build a focused metadata editor for title, description, labels and notes.
3. Add plain-text length limits and validation feedback.
4. Add preferred crossfade duration and presentation-layout selection.
5. Implement one consistent save model (debounced autosave or explicit Save; prefer debounced autosave with visible status if it is reliable).
6. Implement pending-write cancellation/flush on navigation.
7. Add a meaningful failure state and retry without losing in-memory form edits.
8. Apply the workspace's preferred crossfade to the existing engine when the workspace opens.
9. Do not persist the current media files or player volume/playhead.

**Acceptance**

- Metadata survives a full refresh.
- Save status never claims success before transaction completion.
- Long strings, empty titles and invalid labels are handled.
- Switching the global default does not overwrite existing workspace preferences.
- Play/Pause and A/B behaviour are unchanged.

### Phase 5 — Reopen, media relink and workspace lifecycle

**Tasks**

1. Reopen a stored workspace and restore only its metadata/preferences.
2. Render saved media descriptors with an honest `Choose file again` state.
3. Add separate relink actions for Original and Edited.
4. Keep selected `File` objects in memory only for the active session.
5. Track which active workspace owns the current in-memory files.
6. When switching workspace identity, clear or safely detach the old media pair so audio from Workspace A cannot appear under Workspace B.
7. Update media descriptors after the user explicitly loads the matching files.
8. Show filename/size/time mismatch hints without silently rejecting otherwise valid user-selected files.
9. Add safe workspace deletion and rename behaviour.

**Acceptance**

- A workspace reopened after a browser restart never pretends that audio bytes were restored.
- Both sources can be relinked independently.
- The user can compare again after relinking both playable files.
- Workspace switching never leaks the prior workspace's file pair into the new workspace.
- File replacement/removal still cancels waveform analysis correctly.

### Phase 6 — Portable workspace manifest

**Tasks**

1. Define the v1 manifest schema and a documented example.
2. Implement a pure serializer from `WorkspaceRecord` to manifest; use an allowlist of fields.
3. Implement import validation, normalisation and error messages.
4. Implement export as `.switchroom.json` with a safe filename.
5. Implement import through a user-selected file input.
6. Generate a new workspace ID on import.
7. Handle duplicate titles/metadata without silently overwriting.
8. Show a clear post-import notice that media must be selected again.
9. Revoke generated object URLs for JSON exports.

**Acceptance**

- Exported JSON can be re-imported into a clean browser profile.
- All metadata and preferences are restored.
- No actual media is included.
- Malformed, oversized, unsupported and hostile-looking text data cannot crash the app or execute markup.
- Duplicate imports never silently replace a user's workspace.

### Phase 7 — Presentation layout presets

**Tasks**

1. Add a reusable `PresentationLayout` selector.
2. Implement Standard, Player-focused, Waveform-focused and Compact review.
3. Use existing components and the same audio engine across all modes.
4. Persist the selected mode per workspace.
5. Add responsive adaptations for each mode.
6. Keep controls visible/reachable; do not hide error states or accessibility labels.
7. Add reduced-motion-aware transitions between modes.
8. Test all modes with no media, one file, two files, waveform preparing, waveform fallback and playback active.

**Acceptance**

- All four modes are genuinely distinct and useful.
- Every mode preserves the same canonical playhead and engine operations.
- Layout changes do not interrupt audio or reset seeking.
- No horizontal overflow at 360, 390, 768, 1024 and 1440 px.
- The selected layout is restored when that workspace is reopened.

### Phase 8 — Local client preview and home/editor motion polish

**Tasks**

1. Add `Preview` / `Exit preview` to an active workspace.
2. Keep preview local and read-only for project metadata and file-management actions.
3. Preserve listener controls: Play/Pause, A/B, seek, volume and status.
4. Apply the selected presentation layout in preview.
5. Show an unambiguous local-only banner; no share URL or remote-access claim.
6. Rework the home/landing page with restrained motion and clear `New comparison` / Recent Workspaces hierarchy.
7. Use existing Motion for React and `Reveal` patterns; do not add a new motion dependency.
8. Respect app-level motion preference and OS reduced-motion preference.
9. Avoid repeating the same content in editor and preview where it makes preview feel like a duplicate dashboard.

**Acceptance**

- Preview is reachable from an active workspace and exits back to that same workspace.
- Metadata cannot be edited in preview; no public link is created.
- Playback remains the same engine and playhead.
- Preview correctly displays missing-media states.
- Entrance transitions are smooth without making the home screen feel slow or hiding content from assistive technology.

### Phase 9 — Settings panel and preference precedence

**Tasks**

1. Add a compact settings surface/drawer/dialog using existing design components.
2. Wire Theme: System / Dark / Light to the existing theme provider.
3. Wire Motion: System / Reduced.
4. Add default crossfade duration (80–600, 20 ms steps).
5. Add default presentation layout.
6. Apply global defaults only when creating a new workspace.
7. Keep workspace-specific crossfade/layout independent of global defaults.
8. Preserve the pre-paint theme behaviour: `switchroom.theme` remains in localStorage, while motion/crossfade/layout preferences use IndexedDB.
9. Add `Clear local workspaces` with clear, scoped confirmation.
10. Add settings loading/error/retry states.

**Acceptance**

- All settings survive reload as specified.
- Theme does not flash unnecessarily.
- Existing workspaces retain their own settings when global defaults change.
- `Clear local workspaces` clears only Switchroom-owned metadata/preferences and leaves source audio files untouched.
- Motion setting never overrides an OS reduced-motion request in the direction of more motion.

### Phase 10 — Regression, accessibility, documentation and release

**Tasks**

1. Run full unit, component, E2E, format, lint, type-check and build gates.
2. Test real IndexedDB in Chromium, Firefox and WebKit UI paths.
3. Test reopen/relink after refresh and a separate browser session.
4. Test import/export, collision handling and corrupted manifests.
5. Test storage blocked/quota/read/write failures.
6. Test all presentation layouts, settings and client preview at desktop and narrow widths.
7. Test keyboard, focus, screen-reader names/status and reduced motion.
8. Recheck that no audio, waveform data or private metadata is sent over the network.
9. Refresh screenshots and documentation.
10. Build and smoke through the Cloudflare Workers runtime.
11. Deploy to the existing public Worker and verify the exact `v0.4.0` build.
12. Publish tag and GitHub release only after public verification succeeds.

**Acceptance**

- The public URL serves v0.4.0 and the visible release/version metadata agrees.
- All local workspace and manifest flows work in the deployed static app.
- Core v0.3 A/B playback/waveform behaviour is unchanged.
- Documentation describes metadata-only persistence precisely.

---

## 11. Suggested source structure and component boundaries

The exact filenames can follow current conventions, but keep the following responsibilities separate.

```text
src/
  workspaces/
    workspaceTypes.ts
    workspaceValidation.ts
    workspaceDefaults.ts
    workspaceRepository.ts
    indexedDbWorkspaceRepository.ts
    workspaceService.ts
    workspaceManifest.ts
    workspaceManifestValidation.ts
    workspaceRepository.test.ts
    workspaceManifest.test.ts
  app/
    providers/
      WorkspaceProvider.tsx
      PreferencesProvider.tsx
    ...existing providers...
  features/
    home/
      HomePage.tsx
      RecentWorkspaces.tsx
      WorkspaceCard.tsx
    workspace/
      WorkspaceEditor.tsx
      WorkspaceMetadataEditor.tsx
      RelinkMediaNotice.tsx
      WorkspaceSaveStatus.tsx
    presentation/
      PresentationLayoutSelector.tsx
      ClientPreview.tsx
    settings/
      SettingsPanel.tsx
  components/
    ...existing player, waveform, slot, motion and layout components...
```

Guidelines:

- Keep storage logic inside the workspace domain.
- Keep validation pure and independent from React.
- Keep manifest parsing independent from IndexedDB.
- Keep workspace metadata state separate from `ABAudioEngine` snapshots.
- Use one provider or service context to expose repository operations and active workspace state.
- Avoid creating global state for every form field if local component state is enough.
- Avoid importing `File` objects into workspace persistence modules except to derive a safe `MediaDescriptor`.
- The `ClientPreview` should consume the existing workspace/player contexts, not clone them.

---

## 12. Data lifecycle and state transitions

### 12.1 New workspace

```text
Home
  └─ New comparison
       └─ Create metadata record with defaults
            └─ Open Workspace Editor
                 ├─ Edit title/description/labels/notes
                 ├─ Select Original file (File remains in memory)
                 ├─ Select Edited file (File remains in memory)
                 └─ Compare with existing v0.3 engine/waveform system
```

### 12.2 Reopen after refresh

```text
Home
  └─ Open saved workspace record from IndexedDB
       ├─ Restore metadata and preferences
       ├─ Show saved media descriptors
       ├─ Mark Original as requiring file selection
       └─ Mark Edited as requiring file selection
            └─ User selects both source files
                 └─ Existing player/waveform flow becomes ready
```

### 12.3 Export/import

```text
Workspace record
  └─ Allowlisted metadata serializer
       └─ JSON manifest download

User-selected JSON manifest
  └─ Size check + parse + schema validation
       └─ Normalisation + new local ID
            └─ New IndexedDB record
                 └─ Workspace opens with media descriptors only
```

### 12.4 Workspace switching

When a user switches workspace identity, make the transition explicit. The old file pair must not remain active under the new workspace. Either clear the player engine's loaded files or maintain a deliberately scoped in-memory session map; choose the simpler, safer approach. Do not persist media merely to make switching faster.

### 12.5 Preview

```text
Workspace Editor
  └─ Local Preview
       ├─ Same workspace metadata (read only)
       ├─ Same in-memory file objects
       ├─ Same ABAudioEngine and playhead
       └─ Exit Preview → same editor state
```

---

## 13. Accessibility and responsive requirements

- All home-screen actions are keyboard reachable with visible focus.
- Workspace metadata fields have visible labels, hint text and validation messages.
- Labels are editable without requiring drag-and-drop.
- Recent-workspace actions have descriptive accessible names (for example, `Export <workspace title>`).
- Delete requires explicit confirmation and a clear cancel action.
- Settings panel uses a semantic dialog/drawer pattern with correct focus entry, focus return and Escape handling.
- Preview mode has an accessible name, clear mode status and an obvious exit control.
- Save states use an appropriate polite status announcement; do not announce every keystroke noisily.
- Import parse/validation errors are announced and associated with the file input or import dialog.
- No text is inserted with `dangerouslySetInnerHTML`; notes, labels and descriptions are plain text.
- Layout mode controls use native buttons/radio semantics.
- Respect `prefers-reduced-motion` and the app-level `Reduced` preference.
- No hover-only content or action.
- No horizontal scroll at 360, 390, 768, 1024 and 1440 px.
- Minimum practical touch target around 44 CSS px for important interactive controls.
- Compact layout must not shrink text or controls to illegible sizes.

---

## 14. Performance, reliability and privacy rules

### 14.1 Performance

- Workspace records are small metadata objects; never store large audio blobs.
- Use asynchronous IndexedDB; do not use localStorage for workspace collections.
- Avoid rerendering the waveform canvases on every keystroke in metadata fields.
- Avoid rebuilding the entire recent list on every playhead tick.
- Keep the current separate playhead subscription.
- Keep presentation transitions primarily transform/opacity and avoid layout animation on every audio state update.
- Do not add a heavy project dashboard library or new animation framework.

### 14.2 Privacy

The privacy statement must evolve from “audio stays in this browser” to explain local metadata as well:

- Audio files remain selected in the current browser tab/session and are not uploaded or saved by Switchroom.
- Workspace titles, descriptions, labels, notes, media descriptors, motion preference and default crossfade/layout settings are stored locally in IndexedDB. The theme override remains in the existing `switchroom.theme` localStorage key for pre-paint behaviour.
- A JSON manifest contains metadata only; it does not contain the audio.
- Importing a manifest does not restore audio bytes.
- No account, analytics or server-side project storage exists in v0.4.

Do not say “nothing is stored” once local workspace metadata is persisted. Be precise about exactly what is local and what is not stored.

### 14.3 No accidental network transfer

- No audio, notes or workspace metadata should be transmitted to a remote endpoint.
- The app should only request its normal static assets from the configured host.
- Do not add third-party analytics, fonts, storage SDKs or telemetry.
- Add a browser test that inspects network requests during create, save, edit, export, import, relink, preview and settings flows.

### 14.4 Storage is not guaranteed permanent

IndexedDB is user-agent-managed storage and can be unavailable, blocked or evicted. Show `Saved locally in this browser`, not `Backed up` or `Permanently saved`. Encourage manifest export for portable metadata backup. Do not request persistent storage permission automatically.

---

## 15. Test plan

### 15.1 Unit tests

Workspace model and validation:

- Create default record.
- ID/timestamp generation.
- Title trimming and required-title validation.
- Description/notes maximum lengths.
- Label trimming, de-duplication and limits.
- Crossfade range and step validation.
- Layout enum validation.
- Media descriptor sanitisation and optional fields.
- Prohibited media-bearing fields rejected or omitted.

Repository:

- Create, list, get, update, delete and clear.
- Recent sort order and limit.
- Read/write transaction error propagation.
- `blocked`, `versionchange`, database open failure and quota error paths.
- Database schema migration from version 1 to the next implemented version (when such a version exists).
- Concurrent update behaviour across tabs where practical.

Manifest:

- Round-trip export/import.
- Validation and normalisation.
- Malformed and oversized JSON.
- Unsupported manifest version.
- Duplicate import creates a new ID.
- No audio bytes/path/blob/URL/file handle in exported JSON.
- Plain text notes are inert.

### 15.2 Component tests

- Home empty state, loading state, recent list and storage failure.
- Workspace card actions and accessible names.
- Metadata editor validation and save status.
- Relink-required state after reopen.
- Each source relinked independently.
- Save failure retains typed values and retry works.
- Four presentation layouts render correct classes/semantics.
- Client preview hides metadata/file management while preserving player controls.
- Settings values and precedence.
- Clear local workspaces confirmation/cancel/success.

### 15.3 Playwright end-to-end tests

1. First visit shows Home and `New comparison`.
2. Create a workspace and edit all metadata fields.
3. Reload; the workspace is still listed and metadata is restored.
4. Open it; media descriptors show the correct relink state.
5. Select Original and Edited files; v0.3 playback and waveforms become usable.
6. Change preferred crossfade; reload and confirm it is restored.
7. Change a global default; existing workspace values remain unchanged.
8. Create a second workspace; global defaults apply to the new workspace.
9. Switch workspaces; the prior file pair cannot play under the new workspace identity.
10. Export manifest; inspect file content and verify no audio data.
11. Import manifest into a clean browser context; verify metadata restored and media needs selection.
12. Import duplicate; ensure no silent overwrite.
13. Open each layout and confirm no overflow.
14. Enter Local Preview; verify read-only presentation and functioning A/B playback.
15. Exit preview and return to the same editor state.
16. Test theme and motion settings after reload.
17. Test `Clear local workspaces` cancel and confirm paths.
18. Simulate storage unavailable/blocked/write failure and ensure current-tab player remains usable.
19. Emulate reduced motion and verify entrance/transition behaviour.
20. Assert no audio/workspace/notes payloads leave the browser.

### 15.4 Regression checks

All v0.3 audio and waveform tests must remain:

- A/B switching and crossfade in both directions.
- Shared timeline and waveform seeking.
- Playhead stays synced.
- Duration mismatch clipping.
- Waveform fallback preserves playback.
- Large WAV analysis and low-memory fallback.
- Replace/remove cancellation and stale-result protection.
- Volume, mute and crossfade behaviour.
- Slider geometry.
- Transport stability.
- Themes, focus, keyboard and reduced motion.

---

## 16. Documentation and repository updates

Update these documents to describe v0.4 accurately:

### `README.md`

- Project status becomes v0.4.0 only after successful release.
- Describe local workspaces and recent list.
- Explain that only metadata is saved in IndexedDB.
- Explain that audio must be selected again after reopening.
- Describe manifest export/import and its metadata-only nature.
- Describe presentation layouts and local preview mode.
- Update tests and browser support counts from actual results.
- Remove statements claiming that absolutely nothing is stored; state the local metadata exception clearly.

### `CHANGELOG.md`

Add v0.4.0 sections for Added, Improved, Fixed, Verified and Known Limitations. Do not list future planned work as shipped.

### New `docs/local-workspaces.md`

Document:

- Workspace model and metadata fields.
- IndexedDB schema and migration policy.
- What is and is not stored.
- Reopen/relink workflow.
- Browser storage limitation and manifest backup.
- Clear-data behaviour.

### New `docs/workspace-manifest.md`

Document:

- Manifest version 1.
- Field schema and validation limits.
- Example manifest.
- Import/export rules and collision behaviour.
- Explicit statement that audio is never embedded.

### `docs/decisions.md`

Add the v0.4 architecture decisions and explain why the workspace repository is isolated from the audio engine.

### `docs/browser-support.md`

Add actual IndexedDB, import/export, workspace reload and settings verification results. Keep skipped/unavailable environments explicit.

### Screenshots

Regenerate:

- Home with recent local workspaces.
- Workspace Editor in Standard or Waveform-focused layout.
- One alternate layout.
- Local Client Preview.
- Settings panel in Dark and Light themes.
- 360 px narrow layout.

Use actual app states and no seeded fake customer content in production. Test-only fixtures are fine in screenshot automation, but label them as test fixtures and never persist them in real user storage.

---

## 17. Release quality gate

### 17.1 Clean install and static checks

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
```

### 17.2 Browser tests

```bash
npm run test:e2e
npx playwright test --project=firefox
npx playwright test --project=webkit --workers=3
```

Record browser versions and skipped specs. WebKit audio skips on Windows must remain labelled as skips, not successes.

### 17.3 Production build and Workers preview

```bash
npm run build
npm run preview
npm run smoke
```

Add a dedicated workspace smoke path or extend the existing script to verify:

- Expected `v0.4.0` version.
- Home renders with no sample workspaces.
- Create/edit/save metadata works.
- Refresh retains metadata.
- Reopen marks media as requiring reselection.
- Local manifest export/import works.
- Player is usable after both files are reselected.
- Client preview is local-only and has no share URL.
- No audio/metadata network request occurs.

### 17.4 Manual verification

- Manual create/save/reopen/relink/export/import.
- Two separate workspaces with different crossfade/layout values.
- Browser restart and second tab behaviour.
- Storage blocked/quota error path.
- Each presentation mode at desktop and narrow widths.
- Local preview with both files loaded and with one/both missing.
- Theme and reduced-motion settings.
- Existing A/B listening pass and 80/180/600 ms crossfade checks.

### 17.5 Deploy and publish

1. Confirm the working tree and selected branch.
2. Ensure all release files use `0.4.0` consistently.
3. Merge/push only the fully verified release work to `main`.
4. Run production build and Workers preview.
5. Deploy to the existing `switchroom` Cloudflare Worker using the repository's documented Wrangler workflow.
6. Verify the actual public URL and footer/version metadata.
7. Run public smoke tests against the deployed URL.
8. Check the public page manually in a real desktop browser.
9. Create/push tag `v0.4.0` and publish the GitHub release only after steps 5–8 pass.
10. Record the deployed Worker version ID and release URL.

Do not claim deployment or release publication until the corresponding tool/command has confirmed success.

---

## 18. Definition of Done — v0.4.0

### Local workspace management

- [ ] User can create a local workspace.
- [ ] User can edit title, description, labels and notes.
- [ ] User can set a workspace-specific crossfade duration and presentation layout.
- [ ] User can view recent workspaces after a full browser refresh.
- [ ] User can open, rename/edit, export and delete a workspace.
- [ ] Workspace save state is truthful and storage failures do not lose the in-memory form state.

### Media privacy and reopen

- [ ] Audio files are not persisted in IndexedDB/localStorage/sessionStorage/Cache Storage.
- [ ] Reopened workspace restores metadata but clearly requires audio-file reselection.
- [ ] Media descriptors are reminders only and never auto-attach a file based on filename.
- [ ] Switching workspace identity cannot play the wrong workspace's previous files.
- [ ] Existing v0.3 playback/waveform behaviour is preserved after relinking.

### Manifest

- [ ] User can export a metadata-only `.switchroom.json` manifest.
- [ ] User can import a valid manifest as a new local workspace.
- [ ] Malformed, oversized and unsupported manifests fail safely.
- [ ] Duplicate imports do not silently overwrite.
- [ ] No audio data, file paths, object URLs or credentials appear in exported JSON.

### Presentation and settings

- [ ] Standard, Player-focused, Waveform-focused and Compact review modes work.
- [ ] Each mode preserves one audio engine, shared timeline and waveform seek.
- [ ] Local Client Preview is read-only for metadata/file management and is not remotely accessible.
- [ ] Theme, motion, default crossfade and default layout preferences work.
- [ ] Global defaults do not overwrite existing workspace settings.
- [ ] Clear local workspaces is scoped, confirmed and accurately described.

### Quality and release

- [ ] Keyboard, focus, screen-reader and reduced-motion checks pass.
- [ ] Responsive layouts pass at agreed widths.
- [ ] IndexedDB failure does not break the local player.
- [ ] No audio or project data is transmitted to remote servers.
- [ ] All existing v0.3 regressions and new v0.4 tests pass.
- [ ] README, changelog, workspace and manifest documentation are accurate.
- [ ] Production build, Workers preview, local smoke and public smoke pass.
- [ ] Live URL reports v0.4.0.
- [ ] Git tag and GitHub release are published only after public verification.
- [ ] No v0.5+ cloud/account/sharing/feedback functionality has been added.

---

## 19. Required agent completion report

The agent must finish with a concrete report containing:

1. Starting branch, commit, tag and worktree state.
2. v0.3 baseline test/build results.
3. Final workspace and preference data models.
4. IndexedDB schema version, object stores and migration behaviour.
5. Confirmation of exactly which values are stored in IndexedDB and localStorage.
6. Evidence that no audio bytes, PCM, waveform peaks, object URLs, file handles or file paths are persisted.
7. Home/recent list flows completed.
8. Workspace create/edit/save/reopen/relink flows completed.
9. Manifest schema, validation cases and import/export tests.
10. Layout-mode and local-preview results.
11. Settings and clear-local-data results.
12. Automated test counts, browser versions and skipped tests.
13. Manual browser/device checks and any remaining limitations.
14. Preview/deployment/public smoke results and deployed Worker version ID.
15. Tag and GitHub release URL.
16. Explicit statement that no v0.5+ features were introduced.

---

## 20. Technical references

Use official documentation as the implementation source for browser storage and keep the code aligned with the current supported browser matrix:

- [MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN — Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [MDN — IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
- [MDN — Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN — Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)
- [Motion for React documentation](https://motion.dev/docs/react)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

The key storage design points are: IndexedDB operations are asynchronous and transactional; schema changes use a version upgrade; open connections must handle version changes/blocked upgrades; browser storage quotas and eviction differ; and local metadata storage must never be described as a permanent backup.

---

## 21. Final instruction

Deliver a complete v0.4.0 that lets creators save and reopen comparison **setups**, not audio files. Build a thoughtful local workspace home, metadata persistence, portable JSON manifests, clear relinking, reusable presentation layouts, local client preview and a small settings panel.

Keep the v0.3 audio engine, waveform implementation and accepted visual direction. Keep all data local. Stop before cloud projects, authentication, client sharing, comments or feedback. The v0.4 release must stand on its own and remain useful even when browser storage is unavailable.
