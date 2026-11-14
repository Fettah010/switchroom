# Switchroom v0.5.0 — AI Agent Implementation Instructions

> **Purpose:** This document is the execution specification for implementing Switchroom v0.5.0. It expands the v0.5 milestone in `Switchroom_Open_Source_Audio_Review_Plan.md` into a bounded, testable engineering task.
>
> **Release theme:** Private cloud projects and optional creator accounts, without breaking the local-first audio comparison experience.
>
> **Authority:** Follow the existing product plan for product intent and architecture. This document clarifies the v0.5 implementation. It does not authorize features assigned to later milestones or external production actions.

---

## 1. Mission and definition of success

Implement a complete v0.5 cloud-project workflow on top of the existing Switchroom application.

A creator must be able to:

1. Continue using the existing local A/B comparison workflow without signing in or contacting the cloud backend.
2. Explicitly choose **Save to cloud** for a local comparison.
3. Continue as a guest or sign in with Google/GitHub when those providers are configured.
4. Create and manage a private cloud project.
5. Upload the Original and Edited audio files directly from the browser to a private Cloudflare R2 bucket.
6. See real upload progress, cancel an in-progress upload, retry a failed upload, and understand whether each asset is pending, uploading, ready, or failed.
7. Reopen an owned cloud project from another browser when signed in, or from a saved owner-recovery link when using guest access.
8. Edit project metadata, see its expiry date, replace an audio asset safely, and delete the project.

The release is successful only when the complete flow works end-to-end in a deployed-compatible build and the previous local-only functionality still works when cloud services are unavailable.

### Product invariant

**A cloud project is private storage owned by its creator in v0.5. It is not yet a client-shareable review page.**

Do not reinterpret “cloud project” as permission to implement client access, public links, download sharing, comments, votes, or collaboration.

---

## 2. Source decisions that must be preserved

The parent product plan establishes the following decisions. Treat them as requirements, not suggestions:

- Frontend: React + TypeScript + Vite.
- UI: Tailwind CSS with custom CSS tokens/components, following the existing Switchroom visual direction.
- Backend: Cloudflare Worker + Hono.
- Static assets and Worker are deployed together using the Cloudflare Vite integration already selected by the project.
- Database: Cloudflare D1 (SQLite), used for metadata only.
- Audio storage: private Cloudflare R2 Standard bucket. Never put audio bytes in D1.
- Authentication: Better Auth integrated with D1.
- OAuth providers: Google and GitHub. They are optional for local use and must be optional in the cloud workflow when guest mode is selected.
- Upload method: browser-to-R2 direct upload using short-lived, object-scoped S3-compatible presigned PUT URLs. Do not proxy audio bytes through the Worker.
- Initial maximum file size: **100 MB per audio file**.
- Supported user-facing formats remain WAV, MP3, FLAC, AAC and M4A, subject to actual browser codec support.
- Cloud retention choices: **1, 7, 14, 30, 60 or 90 days**, default **30 days**.
- The v0.5 release stores the expiry timestamp and displays a countdown. Scheduled deletion is a v0.9 feature; do not claim that v0.5 automatically purges expired objects.
- Per-user and per-guest project/storage caps must be enforced. Their numeric values are not specified in the parent plan; do not silently invent production quota values. See the unresolved-decision gate in Section 18.
- Local comparison must remain usable without login, upload, database availability, or cloud credentials.
- No paid service, paid API, hidden trial, or unexpected billable dependency may be introduced.

### Existing project is the source of truth

Before coding, inspect the actual repository. The parent plan's suggested directory tree is a target shape, not a command to recreate an existing project. Preserve established naming, routing, component patterns, state management, validation libraries, package manager, lint configuration, test framework, and deployment setup whenever they are sound.

Do not replace the existing application with a new scaffold just because it is easier for the agent.

---

## 3. Strict v0.5 scope

### 3.1 Included functionality

| Area             | Required in v0.5                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local experience | Preserve all existing v0.1–v0.4 local comparison and workspace behavior.                                                                                                        |
| Cloud API        | Hono Worker routes for creator authentication integration, project CRUD, upload sessions, upload finalization/cancellation, and owner-authorized asset playback.                |
| Database         | Additive D1 migrations for cloud projects, audio assets, and upload sessions, plus Better Auth's required tables/migrations.                                                    |
| Authentication   | Better Auth session handling and optional Google/GitHub sign-in.                                                                                                                |
| Guest ownership  | Distinct high-entropy owner capability, securely stored as a hash, with a user-controlled recovery link.                                                                        |
| Dashboard        | Private creator project list, create/open/edit/delete, upload status, storage/expiry information.                                                                               |
| Cloud save       | Explicit and informed user action; no automatic uploads.                                                                                                                        |
| Storage          | Private R2 bucket; direct presigned PUT upload; server-side completion verification.                                                                                            |
| Upload UX        | Real progress, cancellation, safe retry from the beginning, per-file failure states.                                                                                            |
| Owner preview    | Owner-only temporary GET access so the creator can reopen and compare their own cloud assets. This is an enabling requirement for “reopen a cloud project,” not client sharing. |
| Retention        | Store selected retention period and `expires_at`; show date/countdown; do not implement scheduled purge.                                                                        |
| Quotas           | Centralized server-enforced quota policy; numeric production values require an explicit decision if none exist.                                                                 |
| Documentation    | Environment variable reference, local setup, Cloudflare resource setup, OAuth callback setup, security notes, and v0.5 limitations.                                             |

### 3.2 Explicitly excluded — do not build these early

The following belong to later releases and must not be implemented as part of v0.5:

- **v0.6:** public/unlisted/private client share links, invite tokens, client review pages, password-protected sharing, share-link creation/revocation, client guest access, share-page playback authorization.
- **v0.7:** client preference votes, comments, replies, guest client identities, moderation, feedback summaries.
- **v0.8:** client download UI/API, download permission workflows, multipart/resumable uploads, large-file upload tiers, loudness matching.
- **v0.9:** scheduled expiry scans, Cron-based deletion jobs, Turnstile integration, full abuse/rate-limit system, production storage-budget automation, final security hardening milestone.
- **v1.0:** final stable-release polish, broad public launch ceremony, and full product documentation sign-off.

Do not create empty pages, fake controls, disabled-but-prominent future-feature buttons, placeholder share dialogs, or speculative database tables for those features.

### 3.3 Allowed enabling work

Some small pieces are necessary to make v0.5 work and are allowed even if they support a later concept:

- Owner-authorized temporary GET playback URLs for a creator's own cloud assets.
- A private-by-default project visibility field or equivalent, without exposing share modes in the UI.
- Safe project/asset status fields needed to handle partial uploads and deletion.
- Minimal cleanup of an upload explicitly cancelled by the user or encountered as expired while that project is being accessed.
- A guest-to-account claim action if the existing auth flow can support it safely without broadening account features.

These are implementation enablers only. They do not authorize client-facing access or additional product behavior.

---

## 4. Non-negotiable agent conduct

The agent is expected to inspect, implement, test, and document the milestone. It must not exceed the following boundaries.

### 4.1 Do not assume or rewrite

- Do not assume the repository is empty or matches the suggested tree.
- Do not rewrite working local audio logic, the visual system, or routing unless a concrete compatibility issue requires a narrowly scoped change.
- Do not replace the selected stack or add another backend/database/auth/storage vendor.
- Do not add a state-management framework, UI component library, ORM, upload library, or validation library without first checking what the repository already uses and demonstrating why the addition is necessary.
- Do not refactor unrelated code while implementing cloud persistence.
- Do not change existing user-facing terminology without a clear consistency reason.

### 4.2 Do not create unauthorized external side effects

Unless the user has explicitly authorized the action, do not:

- Create, delete, or modify production Cloudflare resources.
- Enable billing, paid upgrades, or usage-based services.
- Change production DNS, custom domains, OAuth application settings, or account security settings.
- Run destructive migrations against production data.
- Delete user data, existing R2 objects, existing D1 databases, or production buckets as a cleanup shortcut.
- Push directly to `main`, publish a public release, create a GitHub release/tag, or deploy to production.
- Change repository visibility, license, or public contribution/security settings.

Local development resources and isolated preview resources may be used only when their ownership, cost, and destructive impact are understood. If required secrets or provider resources are missing, implement the code and setup documentation, then report the exact missing configuration. Never fabricate credentials or pretend OAuth works without a real provider configuration.

### 4.3 Never weaken security to make a test pass

- Never make the R2 bucket public.
- Never return R2 access keys or Better Auth secrets to the browser.
- Never store raw owner capabilities, share tokens, passwords, OAuth secrets, or presigned URLs in the database, source code, logs, analytics, or permanent client storage.
- Never treat an opaque project ID as proof of ownership.
- Never let a guest client capability manage a project. In v0.5 there is no client capability at all.
- Never trust client-supplied owner IDs, file sizes, MIME types, roles, expiry dates, or storage totals.
- Never mark an asset ready merely because the browser says an upload finished.
- Never make a fake progress indicator or pretend a cloud save has succeeded.

---

## 5. Initial inspection and implementation strategy

Complete this inspection before changing code:

1. Read the root README, package manifest, lockfile, environment examples, Cloudflare config, current deployment config, existing docs, and recent changelog entries.
2. Run the current app and note the real routes and local comparison flow.
3. Identify the current project/workspace model introduced in v0.4, including how local metadata and file references are stored.
4. Identify the audio engine's file-loading interface and determine the smallest adapter needed to load owner-authorized cloud URLs. Do not modify the audio engine's core transport behavior unless required.
5. Inspect existing backend/Worker structure, if present. Preserve it and add only the missing Hono routes/services.
6. Check whether D1, R2, Better Auth, and Cloudflare Vite integration are already configured. Do not duplicate bindings or migrations.
7. Inspect dependency versions and verify current official documentation for the APIs/packages used. Pay special attention to Cloudflare Worker runtime compatibility, R2 S3 presigning, D1 migration behavior, Better Auth D1 integration, OAuth callbacks, and browser upload progress.
8. Record which existing features and tests must remain unchanged.
9. Produce a brief implementation map, then proceed with the smallest vertical slice. Do not stop at a plan when the repository and required configuration permit implementation.

### Implementation principles

- Work incrementally: one working vertical slice at a time.
- Keep React UI, application services, Worker routes, auth, D1 access, and R2 signing separated.
- Reuse current abstractions and naming conventions.
- Validate every API input on the server.
- Make state transitions explicit and idempotent.
- Keep Worker CPU work small. Never parse, decode, transcode, or proxy full audio files in a Worker.
- Do not eagerly decode long audio into `AudioBuffer` merely to store or replay cloud files.
- Keep optional cloud-only code from making the local app's initial bundle or startup significantly heavier.

---

## 6. Target architecture and boundaries

```text
Browser
  ├─ Existing local comparison/workspace experience
  │    └─ Local File objects remain local unless the user chooses Save to cloud
  │
  ├─ Creator dashboard and cloud-save UI
  │    ├─ Hono API requests (same-origin)
  │    └─ Direct upload via short-lived presigned PUT URL ─────────┐
  │                                                               │
  └─ Owner-only playback via short-lived presigned GET URL        │
                                                                  ▼
Cloudflare Worker + Hono                                     Private R2 bucket
  ├─ Better Auth/session verification                           ├─ Original object
  ├─ Project ownership and quota checks                          └─ Edited object
  ├─ Project CRUD
  ├─ Upload-session lifecycle
  ├─ Presigned URL creation
  ├─ R2 object HEAD verification
  └─ Owner-only playback authorization
          │
          ├────────────── D1: project/asset/upload metadata
          └────────────── Better Auth tables
```

### Trust boundaries

- The browser is untrusted. It can request actions but cannot authorize itself.
- The Worker is the only component allowed to read/write D1 or use R2 credentials.
- The browser may receive a time-limited URL for one specific R2 object and one specific operation only.
- D1 stores metadata and hashes, not audio content or raw credentials.
- R2 remains private. Do not configure public bucket access or public custom domains for these objects.
- A project is owner-only in v0.5. Every project and asset API must verify the current account session or the guest owner capability.

### Suggested service separation

Adapt to existing repository conventions; do not create all these files if the project already has equivalent modules.

- `worker/routes/auth` — Better Auth handler integration.
- `worker/routes/projects` — owner-scoped project CRUD.
- `worker/routes/uploads` — upload initialization, completion, cancellation.
- `worker/routes/owner-assets` — owner-only temporary playback URLs.
- `worker/services/auth` — session and guest-owner authorization.
- `worker/services/projects` — project access, lifecycle and quota logic.
- `worker/services/r2` — object-key creation, presigning, HEAD, DELETE.
- `worker/services/uploads` — upload-session state transitions and verification.
- `worker/db` — prepared statements/repositories and schema-specific types.
- `src/features/cloud-projects` — dashboard and project screens.
- `src/features/uploads` — direct upload client and progress state.
- `src/lib/api` — typed same-origin API client and error handling.

Do not put R2 signing code in React components or project SQL in route handlers.

---

## 7. Authentication and ownership

### 7.1 Signed-in creator

- Integrate Better Auth with the existing Cloudflare Worker and D1 bindings.
- Support Google and GitHub OAuth only when the required provider IDs/secrets are configured.
- Use the current Better Auth-supported Cloudflare/D1 integration and migrations; do not hand-roll OAuth, callback validation, password storage, or session signing.
- Use server-side session verification for every protected request.
- The frontend may read the current session through the supported Better Auth client, but the Worker must independently verify the session for every protected API request.
- Do not require sign-in for local comparison.
- Do not add email/password, magic links, outbound email, client accounts, or account notifications in v0.5.

If one OAuth provider is configured but the other is not, show only the configured provider. If neither is configured, explain that sign-in is not configured and preserve guest access. Do not show a provider button that can only fail.

### 7.2 Guest creator mode

Guest ownership is a separate project-management capability. It is not a share link and must never be reused as a client token.

Required behavior:

1. On guest project creation, generate a cryptographically random, high-entropy owner capability using a secure platform random source.
2. Store only a cryptographic hash of the capability in D1. Because the capability is generated with high entropy, a cryptographic hash is suitable for lookup; do not use a password hash with a deliberately slow cost for this random secret.
3. Return the recovery link/secret only during creation. It must not be recoverable from the database or returned again by normal project-list APIs.
4. Present a clear, blocking-but-not-coercive **Save your project-owner link** step. Explain that it grants full management access and must be treated like a password.
5. Do not silently save the raw capability in `localStorage`, IndexedDB, analytics, logs, or ordinary project metadata.
6. The recovery link must not expose the secret in the URL path or query string. Prefer a URL fragment so the browser does not send the secret in the initial HTTP request or normal referrer header.
7. On opening the recovery link, the client reads the fragment, exchanges the capability with the Worker, and then removes the secret from the visible browser URL/history using the appropriate navigation API.
8. The Worker verifies the hash and establishes a secure, project-scoped owner session. Prefer an `HttpOnly`, `Secure`, appropriately `SameSite` cookie scoped to the project API path, with a bounded lifetime no later than the project expiry. The owner-recovery link remains the durable recovery mechanism.
9. Redact the exchange request body and any capability-bearing header from logs and error reports.
10. Apply same-origin/CSRF protections to state-changing requests that use the owner session.

The exact cookie/session implementation must be checked against current Cloudflare Worker and Better Auth runtime behavior. Keep it small and scoped. Do not introduce a general-purpose session database or a new auth vendor merely to support guest owner access.

### 7.3 Guest project listing

A guest has no account-wide identity, so do not pretend the server can list all guest-owned projects from an authenticated user session.

- On the current browser, keep a local index of guest project IDs and non-secret display metadata so the dashboard can show projects already accessed in that browser.
- The local index is a convenience, not proof of ownership. Every project request must still pass the project-scoped owner session check.
- A saved owner-recovery link can restore one project on another browser/device.
- Do not store the raw recovery capability in the local index.
- If a guest clears browser data and loses the recovery link, explain that the project may be unrecoverable. Do not invent an account-recovery mechanism.

If the existing application already implements a secure guest session/index, preserve it rather than adding a second system.

### 7.4 Claiming a guest project

If implemented in v0.5, claiming must be an explicit user action:

- Require a valid guest owner session and an authenticated Better Auth session in the same browser.
- Show which project will become associated with the signed-in account.
- On success, set `owner_user_id` to the authenticated user and clear/revoke the guest owner capability.
- Do not allow a client/share token to claim a project.
- Do not silently merge projects or transfer ownership across accounts.
- If the existing application cannot safely support this in the milestone, leave it out and document it as a deferred v0.5 sub-item rather than introducing a weak ownership transition.

---

## 8. D1 data model and migrations

Use D1 for metadata only. The exact column names should fit existing conventions, but the following semantics are required.

### 8.1 `projects`

One row per cloud comparison project.

| Field                       | Required meaning                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                        | Opaque, cryptographically random project ID. It is an identifier, never an access credential.          |
| `owner_user_id`             | Better Auth user ID for signed-in ownership; nullable for guest-owned projects.                        |
| `owner_capability_hash`     | Hash of guest owner capability; nullable for account-owned projects. Never store the raw capability.   |
| `title`                     | Validated display title.                                                                               |
| `description`               | Optional bounded text.                                                                                 |
| `status`                    | Explicit lifecycle state, at minimum distinguishing incomplete, ready, deleting, and expired projects. |
| `visibility`                | Default private. Do not expose public/unlisted modes in v0.5.                                          |
| `created_at` / `updated_at` | Consistent UTC timestamps.                                                                             |
| `expires_at`                | Derived server-side from creation/retention choice.                                                    |
| `retention_days`            | One of 1, 7, 14, 30, 60, 90.                                                                           |
| `deleted_at`                | Nullable tombstone timestamp if the implementation needs retryable deletion.                           |

Use a constraint or application invariant ensuring exactly one owner mode is active: account ownership or guest capability ownership. Do not allow an ownerless project to become an ordinary accessible project.

### 8.2 `audio_assets`

At most one active asset per project role: `original` and `edited`.

| Field         | Required meaning                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | Opaque asset ID.                                                                                                                  |
| `project_id`  | Parent project.                                                                                                                   |
| `role`        | Strict enum: `original` or `edited`.                                                                                              |
| `object_key`  | Server-generated R2 object key; never derived from a user filename.                                                               |
| `filename`    | Sanitized display filename only.                                                                                                  |
| `mime_type`   | Validated/normalized media MIME family.                                                                                           |
| `size_bytes`  | Verified from R2 object metadata at completion.                                                                                   |
| `duration_ms` | Optional client-inspected media duration; do not treat it as trusted server-verified codec metadata.                              |
| `codec`       | Optional best-effort client metadata; do not claim server verification unless bytes were actually inspected by a trusted process. |
| `status`      | At least `pending`, `uploading`, `ready`, `failed` or an equivalent explicit lifecycle.                                           |
| `checksum`    | Optional only when a reliable supported checksum flow is implemented. Do not invent a checksum from an ETag.                      |
| timestamps    | Creation/update timestamps.                                                                                                       |

Add a uniqueness rule for `(project_id, role)` so a project cannot end up with two active Original assets or two active Edited assets.

### 8.3 `upload_sessions`

One row per attempted direct upload. This table enables cancellation, retry, and idempotent finalization.

| Field                     | Required meaning                                                                 |
| ------------------------- | -------------------------------------------------------------------------------- |
| `id`                      | Opaque upload-session ID.                                                        |
| `project_id` / `asset_id` | Parent project and target slot.                                                  |
| `object_key`              | Random, unique temporary/final object key created by the Worker.                 |
| `expected_size`           | Declared bytes, validated against the 100 MB limit.                              |
| `expected_mime`           | Server-approved content type.                                                    |
| `expires_at`              | Upload-session expiry; separate from project expiry.                             |
| `status`                  | Explicit state such as `created`, `completed`, `cancelled`, `expired`, `failed`. |
| timestamps                | Creation, completion and update times.                                           |

Store enough information to make `complete` and `cancel` idempotent. Avoid storing signed URLs; they are short-lived credentials and can be regenerated after reauthorization.

### 8.4 Auth tables

Use Better Auth's generated/supported D1 schema and migration workflow. Do not manually duplicate Better Auth's user, session, account, or verification tables. Check the actual installed Better Auth version and follow its current schema requirements.

### 8.5 Database rules

- Add migrations; never edit an already-applied migration to change its meaning.
- Use foreign keys where supported and appropriate indexes for owner lookup, project expiry, upload-session state, and asset role lookup.
- Use prepared statements/bound parameters only.
- Validate all values before writes.
- Store UTC timestamps in one consistent representation.
- Use explicit constraints for enums, file size, role and retention values where practical.
- Do not assume Postgres interactive transaction semantics. D1 is SQLite and uses supported batch/atomic patterns.
- Make multi-step operations idempotent and recoverable if a Worker invocation fails between R2 and D1 operations.
- Do not add comments, votes, share links, participant tables, or download records in v0.5.

### 8.6 Project state rules

Use explicit server-owned state transitions. A reasonable minimal lifecycle is:

- `draft`: project exists but the two required asset slots are not both ready.
- `uploading`: one or more upload sessions are active.
- `ready`: Original and Edited assets are both verified and ready.
- `expired`: project expiry has passed; do not accept new uploads or normal playback.
- `deleting`: owner initiated deletion and cleanup is in progress or needs retry.

Adapt names to the existing model, but preserve these distinctions. Derive/reconcile project state from asset and upload-session state where appropriate; do not trust a client-supplied status.

An incomplete project is not playable as a complete A/B comparison. The UI should identify which slot is missing or failed.

---

## 9. Cloudflare R2 storage and object-key design

### 9.1 Private bucket

- Use a private R2 bucket with no public bucket access.
- Configure CORS for the exact production origin and exact known preview/local development origins needed by the project. Do not use `*` for allowed origins in production.
- Allow only required methods and headers for the direct PUT and owner playback flows.
- Expose the response headers the browser needs for media playback/progress diagnostics, including range-related headers where the chosen R2/browser flow requires them.
- Recheck current Cloudflare documentation and test actual browser behavior before declaring CORS complete.

### 9.2 Object keys

- Generate object keys on the server using opaque IDs/random values.
- Include a project/asset namespace only if it does not expose secrets; opaque IDs are preferred.
- Never concatenate a raw user filename into an R2 object key.
- Sanitize the filename separately for display and future download use.
- Do not return object keys to the browser unless a narrowly justified diagnostic requires it. The browser should receive the presigned URL, not the bucket layout.

### 9.3 Presigned URL rules

For every URL:

- Scope it to one exact object and one HTTP method.
- Bind the expected content type for PUT when supported by the signing approach.
- Use a short, configured expiry. Choose a TTL that supports realistic 100 MB uploads on the intended network while limiting bearer-token exposure; document the chosen value and why.
- Do not persist the URL in D1 or long-term browser storage.
- Do not put it in logs, analytics, error messages, or changelog examples.
- Do not reuse a PUT URL for another object or method.
- Do not treat the URL as an authorization system after it has been issued; it is a temporary bearer credential.

Use a Worker-compatible SigV4 implementation such as the lightweight approach already selected in the source plan, after verifying current compatibility. The R2 Workers binding does not itself create S3 presigned URLs. Do not ship R2 access keys or signing secrets to the browser.

---

## 10. Direct upload workflow

### 10.1 User-facing flow

1. The creator selects **Save to cloud**. This is an explicit action with a brief explanation that both audio files will be uploaded to private cloud storage.
2. The UI shows project title, retention choice, and the two file names/sizes before the upload begins.
3. The creator selects guest or sign-in ownership.
4. The client creates the cloud project through the Worker.
5. The client requests an upload session for Original and then Edited (sequential or controlled parallelism; do not overwhelm low-end devices or network connections).
6. The Worker authorizes the owner, validates file size/type/quota/project state, reserves a unique object key and returns a short-lived PUT URL.
7. The browser uploads directly to R2.
8. The browser reports real uploaded bytes and the current upload state.
9. After the PUT succeeds, the client calls the completion endpoint.
10. The Worker performs an R2 HEAD check and compares the actual object metadata against the session's expected size and content type.
11. Only after successful verification does the Worker mark the asset ready.
12. When both slots are ready, mark the project ready and show a cloud-saved confirmation.

The user must be able to cancel the process and understand whether a partial project remains in the dashboard.

### 10.2 Client-side preflight

Before requesting a session:

- Check that the file is non-empty and no larger than 100 MB (104,857,600 bytes).
- Check the extension and reported MIME as an early usability filter.
- Inspect actual media metadata/playability using the existing v0.1–v0.2 mechanisms where possible.
- Keep the current codec limitation messaging. Do not claim that extension alone proves WAV/MP3/FLAC/AAC/M4A codec compatibility.
- Do not change, convert, compress, normalize, or re-encode the file.
- Do not send file bytes to the Worker for validation.

Client checks are for user experience only. The Worker must independently validate all server-relevant values.

### 10.3 Upload progress

- Show actual byte progress from the transfer mechanism.
- Do not use a looping animation or guessed percentage as upload progress.
- Standard `fetch()` does not reliably expose upload progress in all browsers; use `XMLHttpRequest` upload progress or another browser-tested mechanism if actual progress is required.
- Show bytes sent / total bytes and a percentage when total bytes is known.
- Distinguish `preparing`, `uploading`, `verifying`, `ready`, `failed`, and `cancelled` states.
- Do not report 100% until server-side completion verification has succeeded. Use a separate “Verifying” state after transfer reaches 100%.
- Make progress updates lightweight; do not rerender the whole app for every byte event.

### 10.4 Cancellation

Cancellation must handle both the browser transfer and server-side session:

1. Abort the active browser request.
2. Call the Worker cancellation endpoint when possible.
3. Mark the upload session cancelled idempotently.
4. Delete the temporary R2 object if it exists; a not-found result is success.
5. Keep any previously verified asset intact when the user was replacing an asset.
6. Update the UI to show that the upload was cancelled, not completed.

If the network disappears before the cancellation request succeeds, the UI must report that cancellation is pending/uncertain rather than falsely claiming that R2 cleanup completed. A later project refresh may retry the cleanup.

### 10.5 Retry

- v0.5 supports retrying a failed upload from byte zero. Resumable/multipart upload is explicitly v0.8.
- Reauthorize and create a fresh upload session or safely reuse a still-valid unused session according to its state.
- Never assume an expired presigned URL remains valid.
- Do not create duplicate ready assets when a completion request is repeated.
- Use bounded retries for transient errors; do not retry validation, permission, quota, or unsupported-file errors indefinitely.
- Preserve any already-verified other asset.

### 10.6 Server-side completion verification

The Worker must:

- Recheck the owner capability/session.
- Confirm the upload session belongs to the requested project and asset role.
- Confirm the session is valid, not expired/cancelled/completed in an incompatible way, and belongs to a project that is not expired/deleting.
- Perform R2 HEAD for the exact server-generated object key.
- Verify object existence, actual byte size, and content type against the authorized session.
- Reject missing, too-large, zero-byte, or mismatched objects.
- Change the asset to ready only after verification.
- Make repeated completion requests safe and deterministic.

Be precise about what is verified: HEAD metadata verifies object existence/size/content type, not the actual codec or complete media validity. Do not label this “server codec validation.”

### 10.7 Replacing an existing asset

Replacing Original or Edited must not destroy the currently valid asset before the new upload is verified.

- Upload the replacement to a new temporary object key.
- Keep the current ready asset playable during upload.
- After the new object passes completion verification, atomically update the asset metadata in D1 using supported D1 batch/atomic patterns.
- Only then delete the old R2 object.
- If old-object deletion fails, retain enough safe state for a retry and do not roll the new asset back to a broken state.
- Ensure a cancelled/failed replacement leaves the original asset untouched.

If this repository's existing model makes replacement substantially more complex, keep the UI action unavailable until the safe flow is implemented; do not implement an unsafe overwrite-in-place shortcut.

### 10.8 Abandoned sessions

Cron-based global cleanup is v0.9. For v0.5:

- Explicitly cancelled sessions should be cleaned immediately where possible.
- Expired sessions encountered while a project is opened or another upload is initiated should be marked expired and their temporary object should be deleted idempotently.
- Keep cleanup bounded per request; never scan/delete the entire bucket in a normal dashboard request.
- Document that global scheduled cleanup is not part of v0.5.
- Do not add a Cron Trigger early unless it is already an established repository requirement and the user explicitly approves the scope change.

---

## 11. Owner-only playback for reopened cloud projects

The v0.5 acceptance criteria require a creator to save and reopen a cloud project from another browser. Therefore an owner needs a way to stream their own cloud assets back into the existing comparison player.

This is not a client-review feature.

### Requirements

- Add an owner-only route that issues a short-lived R2 GET URL for one asset role.
- Re-check account ownership or guest owner capability on every URL request.
- Confirm the project is not expired/deleting and the requested asset is ready.
- Never issue a playback URL for a project based only on its ID.
- Preserve support for HTTP byte-range requests so the existing audio player can seek without downloading the entire file where the platform supports range playback.
- Configure R2 CORS/exposed headers for the actual browser media workflow.
- Keep the bucket private; do not use permanent public URLs.
- Refresh a signed GET URL through the Worker after expiry/failure when practical, preserving the current playhead where possible.
- Avoid downloading the entire file into JavaScript memory. Pass the temporary URL to the existing media-element-based audio engine.
- Do not create a client-facing `/api/share/*` route or a public review page.

Suggested route shape, subject to existing conventions:

```text
GET /api/projects/:projectId/assets/:role/playback
```

The response should contain only the short-lived playback URL and minimal metadata needed by the player. It must not expose R2 credentials, permanent object keys, owner hashes, or unrelated project metadata.

### Playback behavior

- Load Original and Edited via owner-authorized playback URLs.
- Continue using the same canonical timeline and synchronized A/B engine already built in earlier versions.
- Show a clear error if either asset is missing, still uploading, expired, or inaccessible.
- A temporary URL refresh must not reset the playhead or unexpectedly switch the active version.
- If range playback does not work in a target browser, report the limitation and investigate CORS/object response behavior. Do not silently fall back to loading arbitrarily large audio files fully into memory.

---

## 12. API contract

Use existing route conventions where present. The following is the minimum logical surface, not permission to expose unneeded endpoints.

| Method and route                              | Purpose                                                                        | Access                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| `GET /api/health`                             | Minimal health/build status; no secrets or private metadata.                   | Public                                   |
| `/api/auth/*`                                 | Better Auth endpoints and OAuth callbacks.                                     | Better Auth rules                        |
| `GET /api/projects`                           | List projects owned by the signed-in user.                                     | Signed-in creator                        |
| `POST /api/projects`                          | Create an account-owned or guest-owned private project.                        | Signed-in creator or guest creation flow |
| `GET /api/projects/:id`                       | Read one owned project, assets' non-secret metadata, upload states and expiry. | Account owner or guest owner             |
| `PATCH /api/projects/:id`                     | Update allowed metadata/retention fields.                                      | Account owner or guest owner             |
| `DELETE /api/projects/:id`                    | Delete an owned project and its R2 objects safely.                             | Account owner or guest owner             |
| `POST /api/uploads/init`                      | Validate and create an upload session; return short-lived PUT URL.             | Account owner or guest owner             |
| `POST /api/uploads/:id/complete`              | Verify R2 object and finalize asset.                                           | Same owner as session                    |
| `POST /api/uploads/:id/cancel`                | Cancel session and remove temporary object.                                    | Same owner as session                    |
| `GET /api/projects/:id/assets/:role/playback` | Owner-only temporary GET URL for a ready asset.                                | Account owner or guest owner             |
| `POST /api/projects/:id/owner-access`         | Exchange guest recovery capability for a project-scoped owner session.         | Possession of valid guest capability     |
| `POST /api/projects/:id/claim`                | Optional explicit guest-to-account claim.                                      | Guest owner + signed-in user             |

Do not implement these v0.6+ routes in this milestone:

```text
/api/share/*
/api/projects/:id/links
/api/projects/:id/vote
/api/projects/:id/comments
/api/comments/:id/replies
/api/share/:token/download/*
/api/uploads/multipart/*
```

### API behavior rules

- Define request/response schemas and stable machine-readable error codes.
- Use consistent status codes; do not return stack traces or SQL errors to clients.
- Validate params, body, method, content type, origin, file size, role, retention, ownership and project state.
- Enforce authorization in the Worker/service layer, not solely in React route guards.
- Use `Cache-Control: no-store` for private project responses, owner-access exchange, and presigned URL responses.
- Do not include raw guest capabilities, owner hashes, R2 credentials, object keys, or signed URLs in generic error messages.
- Avoid leaking whether another user's project ID exists. Unauthorized and nonexistent project responses should be indistinguishable where appropriate.
- Make create/finalize/cancel/delete operations idempotent where retries are expected.
- Keep API payloads small. Never send audio bytes through JSON or the Worker API.

### Suggested stable error codes

Use the project's existing conventions if available. Otherwise establish a compact set:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `PROJECT_EXPIRED`
- `PROJECT_NOT_READY`
- `INVALID_INPUT`
- `UNSUPPORTED_MEDIA`
- `FILE_TOO_LARGE`
- `QUOTA_EXCEEDED`
- `UPLOAD_SESSION_EXPIRED`
- `UPLOAD_NOT_FOUND`
- `UPLOAD_VERIFICATION_FAILED`
- `STORAGE_UNAVAILABLE`
- `CONFLICT`
- `INTERNAL_ERROR`

Return user-safe messages separately from these codes.

---

## 13. Project creation, editing, retention and deletion

### 13.1 Creation

- Require a non-empty validated title or use the existing local workspace title.
- Accept an optional bounded description.
- Accept only the retention presets 1, 7, 14, 30, 60, or 90 days.
- Default to 30 days.
- Compute `expires_at` on the server in UTC. Ignore any client-supplied computed expiry.
- Default visibility to private. No visibility picker is required in v0.5.
- Initialize the Original/Edited asset slots in a state that clearly represents missing assets, or create the asset records when the upload sessions start. Use one consistent approach.
- Return the project metadata and, for a new guest project only, the one-time recovery link.

### 13.2 Editing

The creator may edit:

- Project title.
- Project description.
- Retention preset/expiry, provided the project is not already irreversibly deleted.
- Original and Edited assets through the safe replacement flow.

Do not expose share settings, password options, client permissions, comment settings, votes, or download controls in v0.5.

A retention change must recompute `expires_at` on the server. Make the effect visible before saving. Do not allow an invalid arbitrary timestamp from the browser.

### 13.3 Expiry behavior in v0.5

The source plan deliberately schedules automatic physical purge for v0.9. Be transparent about this limitation:

- Persist and display the selected expiry date/countdown in v0.5.
- Do not claim that objects are automatically deleted in v0.5.
- At/after the expiry time, mark the project expired and block new uploads and normal owner playback. The owner must still be able to see an expiry/deletion notice and explicitly delete the project if needed.
- Do not silently extend retention.
- Explain in the product's retention/help text that scheduled background deletion is not active in this release and will be introduced with the retention-automation milestone.
- Never present “expired” as equivalent to “the bytes have already been erased.”

If the project plan is later updated to change this staged-retention behavior, follow the updated approved plan rather than inventing a different policy.

### 13.4 Manual deletion

Manual deletion is required in v0.5 and must handle partial failure safely:

1. Verify owner access.
2. Mark the project `deleting` so no new upload/playback operation can start.
3. Collect the project's known R2 object keys from D1; never accept object keys from the browser.
4. Delete each object idempotently. A not-found object is already deleted and should count as success.
5. If one or more deletions fail, keep a tombstone/records sufficient to retry safely and show a clear failure state. Do not claim deletion completed.
6. Once all objects are deleted, remove dependent upload/asset/project records in a safe order, or retain only a minimal tombstone if required by the current schema.
7. Repeated delete attempts must be safe.

Do not build a general background deletion queue or Cron worker in v0.5. A manual retry path is sufficient for the scoped workflow.

---

## 14. Quota and storage accounting

The parent plan requires per-user and per-guest project/storage caps, but does not supply numeric values. This is a real product decision, not something the agent should hide in code.

### Required implementation behavior

- Centralize all quota settings in one typed server-side policy module/configuration source.
- Enforce quotas on the Worker for project creation and upload-session initialization/finalization. Client-only limits are not enforcement.
- Count verified ready assets and active upload reservations so concurrent uploads cannot simply bypass the storage limit.
- Recheck quota at finalization, not only at initialization.
- Reserve space before issuing an upload URL where practical; release the reservation on cancellation, expiry, failure, or successful conversion to a verified asset.
- Account for replacement uploads without double-counting the currently active asset and the replacement incorrectly.
- Enforce the 100 MB per-file cap independently of account/guest quotas.
- Keep the quota calculations bounded and indexed. Do not scan the entire R2 bucket per API request.
- Present current usage and the limit in the dashboard only when the source data is reliable.

### Numeric limits must not be fabricated

First inspect the repository, existing environment config, and any previously approved product settings. If the account/guest project-count or aggregate-storage caps are still unspecified:

1. Implement the quota policy interface and enforcement path.
2. Use clearly named required configuration values rather than magic numbers scattered across handlers.
3. For local tests, use test-only fixture values.
4. Do not activate public cloud writes with unlimited/zero/placeholder quotas.
5. Report the specific missing numbers and ask for approval before enabling production writes.

Do not infer provider free-tier capacity to be an individual user's quota. Do not set a hidden default that could cause unexpected storage use or block normal users.

---

## 15. Creator dashboard and user experience

The dashboard should feel like the same product as the existing local comparison workspace, not a generic admin console.

### 15.1 Required screens/states

- Cloud projects list.
- Create cloud project / Save to cloud flow.
- Project detail/editor.
- Guest owner-recovery confirmation.
- Upload progress and verification states.
- Partial project state when only one slot is ready.
- Fully ready project state.
- Project expired state.
- Project deletion confirmation and deletion-failure/retry state.
- Sign-in/guest choice where relevant.
- No cloud configuration/temporarily unavailable state.

### 15.2 Dashboard project row/card

Show only useful metadata:

- Project title.
- Original/Edited asset completion status.
- Created/last-updated date if available.
- Expiry date/countdown.
- Upload or failure status when relevant.
- Clear open/manage/delete actions.

Do not add artificial charts, team counts, analytics, billing panels, activity feeds, client avatars, or decorative dashboard statistics.

### 15.3 Save-to-cloud confirmation

Before uploading, clearly state:

- Which Original and Edited files will be uploaded.
- Their sizes and the 100 MB per-file limit.
- That the audio is being copied to private cloud storage.
- The selected retention preset and expiry date.
- Whether the project is guest-owned or account-owned.
- Whether any file failed preflight.

No cloud upload may begin merely because the user opened a project, signed in, or visited the dashboard.

### 15.4 Guest recovery UI

- Display the owner-recovery link clearly and make copying it easy.
- Explain that anyone possessing it may manage/delete the project.
- Require an explicit acknowledgement that the user has saved it before dismissing the recovery step, but do not falsely claim that the app can recover a lost link.
- Do not send it by email; email delivery is not in scope.
- Do not store a duplicate raw secret for convenience.

### 15.5 Visual direction

Preserve the existing Switchroom design system:

- Premium minimal/editorial audio-instrument feel.
- Existing typography, spacing, dark/light/system tokens, subtle borders and restrained signal accent.
- Responsive desktop and mobile layouts.
- Real progress, meaningful state labels and clear error recovery.
- Motion is subtle and respects `prefers-reduced-motion`.
- Keyboard focus and accessible labels remain clear.

Do not introduce a separate visual language for the cloud dashboard. Do not redesign the landing page as part of this milestone unless a small navigation entry is required.

### 15.6 Accessibility and interaction

- All controls must be keyboard reachable and have visible focus.
- File selection and upload status must be announced meaningfully to assistive technology.
- Do not rely on color alone for upload/asset state.
- Provide clear labels for project title, description, retention, Original and Edited.
- Confirm destructive deletion and identify the project by title.
- Prevent accidental double-submission while a create/finalize/delete request is in progress.
- Respect reduced-motion settings.

---

## 16. Local-first compatibility and failure isolation

Cloud functionality is additive. The local product must not become dependent on the cloud backend.

### Required invariants

- Local comparison must load and play two local files without auth or cloud API calls.
- Local workspace metadata must continue to save/open/import/export as implemented in v0.4.
- No local media file is uploaded until the user explicitly invokes Save to cloud and confirms.
- Cloud API errors must not erase or invalidate local `File` objects or local workspace metadata.
- If Better Auth, D1, R2, OAuth, or Cloudflare configuration is unavailable, local comparison still works.
- A cloud outage must not prevent the landing page or local compare route from rendering.
- A failed cloud save must preserve the user's local comparison and explain whether a partial cloud project was created.
- Do not silently switch a failed cloud operation into a local-only success state. Report which state is saved where.

### Failure handling

Design visible and recoverable behavior for:

- Missing OAuth credentials.
- OAuth callback failure.
- Expired/invalid Better Auth session.
- Lost/invalid guest owner capability.
- D1 unavailable.
- R2 unavailable.
- CORS rejection.
- Presigned URL expired.
- Browser/network interruption during PUT.
- Worker timeout after R2 PUT but before finalization.
- Object missing at completion.
- HEAD size or content-type mismatch.
- Quota exhausted.
- Project expired during an upload.
- Partial project deletion.
- Audio playback URL expiration during a long listening session.

Never discard a working local comparison because one of these cloud operations failed.

---

## 17. Security and privacy acceptance requirements

These are release gates, not optional polish.

### Authentication and ownership

- [ ] Better Auth session is verified server-side for every account-protected route.
- [ ] Guest owner capabilities are cryptographically random and stored only as hashes.
- [ ] Owner recovery link is shown only at creation and the secret is not logged.
- [ ] Guest capability cannot be used as a client share token or vice versa.
- [ ] Project IDs are never treated as authorization.
- [ ] Every project read/write/upload/playback/delete checks ownership.
- [ ] Owner access is revoked or transferred safely when a guest project is claimed by an account.

### Storage and upload

- [ ] R2 bucket is private.
- [ ] R2 credentials/signing secrets exist only in Worker secrets/bindings.
- [ ] Presigned URLs are short-lived, exact-object and method-scoped.
- [ ] No permanent public object URL is returned.
- [ ] Upload path does not proxy audio through the Worker.
- [ ] File size and content type are checked server-side.
- [ ] Filenames are sanitized and never used as object keys.
- [ ] Asset becomes ready only after R2 HEAD verification.
- [ ] Temporary/replacement objects are cleaned safely on cancel/failure where possible.
- [ ] Range playback is tested without making the bucket public.

### API and privacy

- [ ] State-changing routes enforce same-origin/CSRF protection appropriate to the auth/cookie model.
- [ ] Cookies use Secure, HttpOnly, and a deliberately chosen SameSite policy in production.
- [ ] Private API responses and presigned URL responses use no-store caching where appropriate.
- [ ] Request bodies, headers, logs and error telemetry are redacted for secrets and signed URLs.
- [ ] No project content or client audio is sent to third-party analytics.
- [ ] No public/share route exists in v0.5.
- [ ] No secrets are committed to the repository or included in built frontend assets.

### Deletion and expiry

- [ ] Project expiry is calculated server-side.
- [ ] Expired projects cannot accept new uploads or normal owner playback.
- [ ] Manual deletion blocks new operations before object deletion begins.
- [ ] Partial deletion remains retryable.
- [ ] UI does not claim that scheduled purge is active in v0.5.

Do not weaken a requirement to fit a Worker CPU budget. If a security control is not compatible with the current runtime, stop and present a safe alternative.

---

## 18. Decisions that require explicit approval if not already established

The parent plan intentionally leaves some implementation/product values open. Resolve them by inspecting the repository and existing settings first. Do not ask for decisions that are already documented.

| Decision                             | Agent behavior                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Signed-in project-count cap          | Reuse an already approved value; otherwise centralize the setting and request an approved production value.     |
| Guest project-count cap              | Reuse an already approved value; otherwise centralize the setting and request an approved production value.     |
| Signed-in aggregate storage cap      | Reuse an already approved value; otherwise centralize the setting and request an approved production value.     |
| Guest aggregate storage cap          | Reuse an already approved value; otherwise centralize the setting and request an approved production value.     |
| OAuth provider credentials/callbacks | Document exact setup; never invent credentials or alter provider settings without approval.                     |
| R2/D1 resource IDs and bindings      | Reuse approved resources; request approval before creating or changing production resources.                    |
| Guest recovery session lifetime      | Use a security-reviewed, documented bounded lifetime; do not silently choose an unusually long-lived cookie.    |
| Retention disclosure                 | Keep the v0.5 distinction between expiry and physical purge explicit; do not imply v0.9 cleanup already exists. |

When a decision is unresolved, continue implementing independent parts. Gate only the production-sensitive feature that depends on that value. Present a concise recommendation and its trade-off instead of silently choosing.

---

## 19. Implementation sequence

Implement in this order. Each step must leave the existing app runnable.

### Phase A — Repository and runtime baseline

- [ ] Inspect repo, current app behavior, package manager, build, tests, existing Cloudflare setup and environment conventions.
- [ ] Run existing checks and save the baseline result.
- [ ] Verify current official docs/package compatibility for Workers, Hono, D1, R2 presigning, Better Auth, Google/GitHub OAuth, and browser upload progress.
- [ ] Record required bindings and secrets without creating production resources.
- [ ] Add only missing dependencies; update the lockfile using the existing package manager.
- [ ] Ensure the local app still builds before feature work.

### Phase B — D1 and Worker foundation

- [ ] Add additive migration(s) for `projects`, `audio_assets`, and `upload_sessions`.
- [ ] Add Better Auth migrations using its supported current workflow.
- [ ] Add typed Worker environment/bindings for D1, R2 and auth configuration.
- [ ] Add Hono middleware for request IDs, safe error handling, origin checks and redacted logging.
- [ ] Add health/version endpoint without exposing secrets.
- [ ] Add repository/service functions using prepared statements.
- [ ] Add schema and API validation tests.

### Phase C — Authentication and guest ownership

- [ ] Integrate Better Auth with D1 and the Worker runtime.
- [ ] Configure Google/GitHub provider handling with optional credentials.
- [ ] Add a current-session endpoint/client integration if required by the existing app.
- [ ] Implement server-side account-owner resolution.
- [ ] Implement guest capability generation, hash storage, one-time recovery link, token exchange and scoped owner session.
- [ ] Implement the guest local project index without storing raw secrets.
- [ ] Test access denial for wrong account, wrong guest secret, missing cookie, expired project and guessed project ID.

### Phase D — Project CRUD and retention metadata

- [ ] Implement account-owned and guest-owned project creation.
- [ ] Implement account project list and guest current-browser project list integration.
- [ ] Implement owner-scoped read and metadata update.
- [ ] Validate retention presets and compute expiry server-side.
- [ ] Implement project state derivation/reconciliation.
- [ ] Implement safe manual delete with retryable partial-failure handling.
- [ ] Add UI for dashboard, create/edit, expiry status, and delete confirmation.

### Phase E — Direct R2 uploads

- [ ] Configure private R2 bucket binding and exact-origin CORS documentation/configuration.
- [ ] Implement object-key generation and Worker-side presigning.
- [ ] Implement upload-session creation with ownership, file, project and quota checks.
- [ ] Implement browser direct PUT with genuine byte progress.
- [ ] Implement cancellation and bounded retry.
- [ ] Implement R2 HEAD verification and idempotent completion.
- [ ] Implement safe replacement that preserves the old asset until the new one is ready.
- [ ] Add upload state UI for both asset slots.
- [ ] Verify no audio bytes pass through the Worker API.

### Phase F — Owner cloud reopen/playback

- [ ] Implement owner-only short-lived GET URL issuance.
- [ ] Verify ready asset, project expiry and ownership on every request.
- [ ] Test byte-range requests/seek behavior with the current player and R2 CORS.
- [ ] Adapt the existing audio source interface to use temporary URLs without changing core synchronization/crossfade behavior.
- [ ] Handle signed URL refresh without resetting the playhead.
- [ ] Verify an account owner can reopen a project from a second browser.
- [ ] Verify a guest can reopen one project from its saved recovery link on another browser.

### Phase G — Integration, documentation and release gate

- [ ] Run all previous local/audio/workspace tests.
- [ ] Run new D1/Worker/R2/auth/upload/ownership tests.
- [ ] Run desktop/mobile checks in both themes and reduced-motion mode.
- [ ] Verify a cloud outage does not break local comparison.
- [ ] Verify all quota values and production secrets are configured or explicitly gated.
- [ ] Update README, `.env.example`, local development, deployment, storage/retention, and security docs.
- [ ] Update changelog with only verified behavior.
- [ ] Produce a completion report listing implemented items, tests, setup still required, decisions awaiting approval, known limitations, and deployment state.

---

## 20. Required test plan

Tests should use isolated local/test D1 and R2-compatible bindings or mocked adapters where appropriate. Never run destructive tests against real user data.

### 20.1 Project and ownership tests

- Signed-in creator creates, lists, opens, edits, and deletes their project.
- Signed-in creator cannot read or modify another user's project.
- Guest creator creates a project and receives a recovery link exactly once.
- Stored database value is a hash, not the raw guest capability.
- Guest can reopen through the recovery link in a clean browser context.
- Invalid, altered, missing, or revoked guest capability is rejected.
- Project ID guessing alone grants no access.
- Guest dashboard index contains no raw owner secret.
- A claimed guest project becomes account-owned and old guest access is revoked, if claim is implemented.
- Project expiry blocks prohibited operations at the cutoff.

### 20.2 Auth tests

- Configured Google OAuth flow reaches the correct callback and session state.
- Configured GitHub OAuth flow reaches the correct callback and session state.
- Missing provider config does not expose a broken login button.
- Invalid/expired session is rejected by the Worker.
- Sign-out invalidates the relevant session.
- Local comparison still works with all auth config absent.

Where external OAuth cannot be exercised in CI, test the integration boundaries/mocks and document the exact manual provider verification still required. Do not report a live OAuth flow as tested if it was not.

### 20.3 Upload tests

- Reject zero-byte file.
- Reject file above 100 MB.
- Reject unsupported extension/MIME combination according to the existing supported-format policy.
- Validate the two roles and prevent duplicate active Original/Edited assets.
- Reject upload init for unauthorized, expired, deleting, or quota-exhausted projects.
- Confirm browser PUT targets the presigned R2 URL, not the Worker.
- Verify byte progress is based on actual transfer events.
- Cancel an upload and verify the session/object cleanup path.
- Retry an expired URL using a valid new session.
- Worker rejects missing object at completion.
- Worker rejects unexpected object size/content type.
- Repeated completion request is idempotent.
- Failed/cancelled upload never becomes ready.
- Failed replacement leaves the old asset intact.
- Successful replacement changes the active object only after verification.
- Simulate Worker failure after successful PUT and ensure the project can recover by retrying completion.

### 20.4 Playback tests

- Owner can receive a temporary playback URL for a ready asset.
- Non-owner cannot receive a playback URL.
- Guest without the recovery capability cannot receive a playback URL.
- Missing/failed asset cannot be played.
- Expired project cannot obtain a normal playback URL.
- Audio seeking/range requests work in supported target browsers.
- Expired signed URL can be refreshed without resetting current time where supported.
- A/B switching remains synchronized and crossfade behavior is unchanged.

### 20.5 Deletion and retention tests

- Manual delete removes both known R2 objects and D1 records.
- Missing R2 object is treated as already deleted.
- Partial R2 deletion failure leaves retryable state.
- Repeated delete request is safe.
- Expiry date is calculated on the server from the allowed preset.
- v0.5 UI clearly states that scheduled physical purge is not yet active.
- No Cron Trigger or background purge is introduced as part of this milestone.

### 20.6 Regression, UX and performance tests

- Existing local A/B player tests continue to pass.
- Existing local workspace import/export/save/open behavior continues to pass.
- Local comparison makes no auth/cloud request during ordinary local use.
- Cloud backend unavailable: local comparison continues to work.
- Responsive dashboard works at narrow mobile widths and desktop widths.
- Dark, light, system themes remain correct.
- Keyboard-only upload and project management flow works.
- Reduced-motion behavior is respected.
- No repeated whole-page rerender for every upload-progress event.
- Worker does not process audio bytes or perform expensive transcoding/decoding.
- New dependencies do not create an unjustified bundle-size increase.

---

## 21. Definition of done for v0.5.0

Do not mark the milestone complete until every applicable item below is verified.

### Functional

- [ ] Existing local A/B comparison and local workspace features still work.
- [ ] Cloud save starts only after explicit user action and confirmation.
- [ ] Guest and configured signed-in creator flows both work.
- [ ] Project list/create/open/edit/delete work with server-side ownership checks.
- [ ] Guest owner recovery link is shown once, works on another browser, and is not stored raw by the app.
- [ ] Both audio assets upload directly to private R2.
- [ ] Each file is capped at 100 MB server-side.
- [ ] Upload progress reflects actual bytes and has clear verifying/error/cancel states.
- [ ] Failed/incomplete uploads are not ready/playable.
- [ ] Retry and cancellation work without corrupting an existing good asset.
- [ ] Reopened cloud projects can be previewed by their owner through temporary authorized URLs.
- [ ] Retention presets and expiry countdown work.
- [ ] Expiry and physical deletion are described honestly.
- [ ] Local use is unaffected by cloud failures.

### Security

- [ ] Private R2 bucket; no public object access.
- [ ] No R2/Auth secret in frontend bundle, Git history, logs or client storage.
- [ ] Owner and upload capabilities are scoped and checked server-side.
- [ ] Presigned URLs are short-lived and narrowly scoped.
- [ ] D1 writes use validation and prepared statements.
- [ ] Project deletion is safe and retryable.
- [ ] No client-sharing or future-milestone permissions accidentally exist.

### Engineering quality

- [ ] Clean install/build succeeds using the repository's lockfile and documented commands.
- [ ] Formatting, lint, type-check, unit, integration and relevant end-to-end tests pass.
- [ ] Existing tests pass without being weakened or deleted to accommodate the new code.
- [ ] Migrations apply to an isolated clean D1 database.
- [ ] Environment variables and Cloudflare bindings are documented.
- [ ] No production resource was modified without approval.
- [ ] No fake controls, mock progress, TODO-only routes, or unhandled errors remain in the v0.5 user path.
- [ ] Changelog and setup documentation match actual behavior.

### Release status

The agent may call the code **v0.5.0 implementation-complete** when the local build and test gates pass. It may call the public release **deployed** only after an authorized deployment has actually succeeded and the deployed URL has been smoke-tested. Do not create a tag or publish a release without authorization.

---

## 22. Final agent report format

At completion, report in this structure. Be factual; do not claim untested behavior.

### Implemented

- List each completed feature and the relevant routes/modules/screens.

### Verification

- Commands run and pass/fail results.
- Automated test coverage added.
- Browsers/devices manually checked.
- OAuth flows actually exercised, or clearly marked as not exercised.
- R2 direct-upload and range-playback verification results.

### Configuration still required

- Exact environment variable names.
- Required D1/R2 bindings and CORS origins.
- OAuth callback URLs and credentials still to be configured.
- Any quota values awaiting approval.

### Not implemented (intentionally)

- List later-milestone functionality that remains out of scope, especially client sharing, comments/votes, downloads, multipart uploads, and Cron deletion.

### Known limitations and risks

- Browser codec limitations.
- Retention/purge distinction in v0.5.
- Any incomplete provider/browser verification.
- Any partial failure or cleanup limitation.

### Deployment state

- `local only`, `preview deployed`, or `production deployed` — use only the state that actually occurred.
- Include URL only if deployment was authorized and verified.
- State explicitly whether any production resources or data were changed.

### Next required user decision

- Ask only for the specific unresolved product/configuration decision that blocks the next action. Do not present a long questionnaire if only one decision is needed.

---

## 23. Final instruction to the coding agent

Implement **only v0.5.0** as defined here, using the existing Switchroom repository and the parent product plan as context.

The goal is a reliable private cloud-project workflow, not a broad platform rewrite. Preserve the local-first app, keep cloud storage private, make uploads direct and verifiable, give guest owners a recoverable but securely scoped management capability, and enforce ownership on every server request.

Prefer the smallest complete implementation over speculative abstraction. Make every state visible and recoverable. Verify each claim. Do not silently invent product decisions, add paid services, expose private storage, implement future releases early, or perform external production actions without authorization.

When a requirement is ambiguous, inspect the existing code and source plan first. If it is still genuinely undecided, isolate the ambiguity, continue independent work, and request only the approval needed to finish that specific part safely.
