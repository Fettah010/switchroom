# Switchroom Workspace Manifest Specification

Switchroom v0.4.0 defines a portable, lightweight manifest format (`.switchroom.json`) that allows users to export, import, share, and backup comparison workspaces without uploading audio files to cloud servers.

## Specification Overview

- **File Extension:** `.switchroom.json` (or `.json`)
- **MIME Type:** `application/json`
- **File Size Ceiling:** 1 MiB (1,048,576 bytes) max. Files exceeding this ceiling are rejected immediately before JSON parsing.
- **Current Schema Version:** `1`

## Security & Privacy Invariants

The manifest is designed with zero-trust security and absolute privacy:

1. **No Binary Audio Data:** The manifest MUST NOT contain audio blobs, base64 data, PCM audio buffers, or peak vectors.
2. **No Credentials or Secrets:** The manifest MUST NOT contain authentication tokens, API keys, passwords, or session IDs.
3. **No Filesystem Paths:** The manifest MUST NOT contain absolute filesystem directories from the exporting device.
4. **Collision Resistance:** Upon import, Switchroom always generates a fresh local workspace ID, preventing accidental overwrites or collisions with existing local comparisons.

## Manifest Schema (Version 1)

```typescript
interface WorkspaceManifest {
  /** Manifest format specification version. Must be 1. */
  manifestVersion: 1;

  /** ISO 8601 timestamp representing when the manifest was exported. */
  exportedAt: string;

  /** Application and version string that created this file. */
  generator: string;

  /** Workspace metadata. */
  workspace: {
    /** Comparison title (1–120 characters). */
    title: string;

    /** Client review description or context (up to 2000 characters). */
    description: string;

    /** Internal engineering notes or change log (up to 5000 characters). */
    notes: string;

    /** Categorization tags (up to 12 tags, max 30 chars each). */
    labels: string[];

    /** Preferred transition duration in milliseconds (80–600 ms, step 20 ms). */
    crossfadeMs: number;

    /** Selected presentation layout. */
    presentationLayout: 'standard' | 'player-focused' | 'waveform-focused' | 'compact-review';

    /** Metadata descriptor for the Original (A) audio file. */
    originalMedia: MediaDescriptor | null;

    /** Metadata descriptor for the Edited (B) audio file. */
    editedMedia: MediaDescriptor | null;
  };
}

interface MediaDescriptor {
  name: string;
  size: number;
  type: string;
  durationSec?: number;
}
```

## Example Manifest

```json
{
  "manifestVersion": 1,
  "exportedAt": "2026-11-14T01:00:00.000Z",
  "generator": "Switchroom v0.4.0",
  "workspace": {
    "title": "Acoustic Session Mix Check",
    "description": "Comparing the dry mix against the analog-summed revision with stereo bus compression.",
    "notes": "Check bass clarity at chorus transition around 01:15.",
    "labels": ["acoustic", "analog-sum", "revision-2"],
    "crossfadeMs": 220,
    "presentationLayout": "waveform-focused",
    "originalMedia": {
      "name": "Session_Dry_Mix_v1.wav",
      "size": 48312000,
      "type": "audio/wav",
      "durationSec": 182.4
    },
    "editedMedia": {
      "name": "Session_AnalogSum_v2.wav",
      "size": 48312000,
      "type": "audio/wav",
      "durationSec": 182.4
    }
  }
}
```

## Import Validation Process

When a manifest file is dropped or selected in Switchroom:

1. **Size check:** Validates file size is under 1 MiB.
2. **JSON parsing:** Validates JSON syntax.
3. **Schema version check:** Validates `manifestVersion === 1`.
4. **Prohibited keys check:** Rejects any payload containing prohibited keys (`audioBuffer`, `blob`, `file`, `token`, `secret`, `password`, `key`, `path`).
5. **Sanitization:** Sanitizes strings, clamps numbers to valid ranges, strips unauthorized properties, and generates a new local UUID for the workspace.
6. **Persistence:** Saves the imported workspace into the local IndexedDB database and opens it in the workspace editor.
