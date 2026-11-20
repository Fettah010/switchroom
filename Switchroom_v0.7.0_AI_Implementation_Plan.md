# Switchroom v0.7.0 — AI Agent Implementation Plan

> **Release:** `v0.7.0`  
> **Purpose:** Implementation brief for an AI coding agent  
> **Parent specification:** `Switchroom_Open_Source_Audio_Review_Plan.md`  
> **Scope:** Client feedback and reliable, resumable R2 uploads  
> **Rule:** Implement only this release. Do not treat this document as permission to redesign or expand the whole product.

---

## 1. Release outcome

Deliver two complete capabilities while preserving the working v0.6 product:

1. **Client feedback:** a client can choose Original or Edited, add a comment at a point in the shared timeline, and reply to an existing comment. Guests can do this without an account. The creator can respond, moderate feedback, and see a concise preference/activity summary.
2. **Reliable cloud uploads:** the creator can upload files larger than the old 100 MiB application limit using direct-to-R2 multipart uploads, resume completed parts after interruption, pause/cancel safely, and see honest progress. Small files may continue using the existing single-PUT path.

Both capabilities must be secure, tested, deployable, and usable on the existing v0.6 interface. The work is complete only when the acceptance gates in this document pass.

## 2. Authority, assumptions and agent rules

Use this document together with the parent roadmap. Before coding, inspect the repository and the actual v0.6 implementation. The repository is authoritative for existing names, frameworks, routes, conventions and working behaviour; the parent roadmap is authoritative for product requirements; this document adds implementation detail only for v0.7.0.

When these sources appear to conflict:

1. Do not silently change a confirmed product requirement.
2. Do not break an existing v0.6 contract merely to simplify the new feature.
3. Prefer the smallest additive change that satisfies the release.
4. Record a material unresolved decision in the implementation notes before making a product-level choice.

**Do not assume the suggested repository tree or route names already exist.** Discover the real project structure first. Reuse existing packages, patterns, UI components, auth helpers, storage abstractions and test tooling where they are sound. Do not replace them wholesale.

### Non-negotiable constraints

- Keep local comparison and v0.6 client listening usable without an account.
- Keep guest feedback available; do not force client sign-in.
- Never upload local audio automatically. Cloud upload remains an explicit creator action.
- Never proxy audio bytes through the Worker. The browser uploads directly to private R2 using narrowly scoped, short-lived authorization.
- Never expose R2 credentials, raw R2 object keys, raw owner capability secrets, guest identity secrets or permanent public object URLs to the browser.
- Never trust client-supplied project ownership, participant IDs, role, quota, file size, MIME type, timestamp, ETag list or permission flags without server-side validation.
- Do not introduce an application-defined per-file maximum. Enforce actual R2/provider limits and existing project/account/global aggregate quotas.
- A multipart strategy threshold chooses a transfer method only; it must never reject a file by itself.
- Keep D1 interactions compatible with SQLite/D1. Do not assume interactive Postgres transactions.
- Do not add paid services, a new storage provider, a new authentication provider, email, billing or analytics.
- Do not add v0.7.5 visual redesign, v0.8 downloads/linked storage, or v0.9 project-retention automation.
- Do not claim completion based on code inspection alone. Run the tests and the relevant manual checks.

---

## 3. Scope boundary

### Included in v0.7.0

**Feedback**

- Preferred-version vote: `original` or `edited`.
- Guest display-name identity and optional signed-in client identity.
- Project-scoped participant identity.
- Timestamped comments using the common A/B timeline.
- Clicking a comment timestamp seeks the existing player.
- One reply level initially; replies can include creator responses.
- Creator moderation/delete controls.
- Project-level feedback enable/disable setting.
- Server-side validation, bounded comment length, basic rate limits and anti-spam handling.
- Creator dashboard summary of vote counts and recent comment activity.
- Clear empty, loading, submitting, submitted and error states in both themes.

**Uploads and storage accounting**

- Preserve the existing single-PUT upload path for files suited to it.
- Add direct-to-R2 multipart upload for files selected by a configurable strategy threshold or required by R2 technical limits.
- Remove the old fixed 100 MiB application per-file cap when multipart is ready.
- Bounded part concurrency, retry of failed parts, pause, resume, cancel, complete and abort.
- Safe persistence of upload-session state for recovery.
- Server-side reservation/release against project, account and Switchroom-wide aggregate storage budgets.
- Verify completed object size and content type; do not trust the browser's declared values.
- Account for in-flight reservations when deciding whether new storage can be accepted.
- Show storage use and upload progress honestly; stop new R2 writes gracefully before the configured Switchroom budget is exceeded.
- Keep long-file playback on media elements and waveform work memory-bounded, retaining the timeline fallback.

### Explicitly excluded

- The v0.7.5 workspace redesign, layout presets, broad visual refresh or screenshot/README presentation work.
- Google Drive or Dropbox integration, provider adapters or external storage selection.
- Client download workflow changes (v0.8).
- Project expiry scheduler, full project deletion jobs, and v0.9 production-hardening programme. Upload-session cleanup required for multipart uploads is still included.
- Nested replies, reactions, mentions, attachments, comment editing, notification emails or real-time collaboration.
- New public discovery, indexed upload library or public music hosting.
- Audio transcoding, loudness matching, waveform redesign or a rewrite of the A/B engine.
- Any new pricing, billing, subscription or paid infrastructure.

If an implementation appears to require excluded work, stop and explain the dependency. Do not quietly pull the later release into v0.7.0.

---

## 4. Entry gate: inspect the existing v0.6 product

Before implementation, inspect and report:

1. Current branch, commit, release tag and whether the working tree is clean.
2. How to run the app, Worker, migrations, tests and local D1/R2 development environment.
3. Existing project, asset, share-link, participant, comment, vote, upload-session and quota schema. Some tables may not exist yet despite appearing in the target data model.
4. Existing guest-owner capability flow, Better Auth session handling, guest client access and share-link permission checks.
5. Existing upload-init, single-PUT, complete and cancel behaviour, including how the Worker signs URLs and verifies R2 objects.
6. Existing UI locations for the review page, creator dashboard, project settings and upload progress.
7. Existing formatter, lint, type-check, unit, integration and browser test commands.
8. Existing storage accounting and the configured Switchroom R2 budget. Identify whether in-flight bytes are already reserved.

Run the current test/build suite before changing anything and record the baseline. Fix a pre-existing failure only when it blocks a v0.7 requirement; otherwise document it separately and do not turn this release into a general cleanup project.

**Entry condition:** v0.6 guest listening, share authorization, local comparison and existing small-file upload must have a reproducible baseline. If the current release is not working, report the blocker and isolate the minimum prerequisite fix before implementing new features.

---

## 5. Architecture boundaries

Keep responsibilities separated using the repository's existing structure:

- **UI:** renders feedback and upload state; it must not own authorization or quota decisions.
- **Domain/services:** validate feedback rules, resolve participants, coordinate vote/comment operations, select upload strategy and manage upload state transitions.
- **Worker API:** authenticates or resolves scoped guest identity, validates every write, checks permissions, reserves quota, signs part URLs and finalizes/aborts uploads.
- **D1:** stores metadata, participant identity references, comments, votes, upload sessions and quota reservations. Never store audio bytes.
- **R2:** stores private audio objects and multipart parts. Never make the bucket public to simplify the feature.

Use existing abstractions where possible. Keep route handlers thin. Avoid duplicating the same permission or quota logic across endpoints.

## 6. Feedback implementation

### 6.1 Participant identity

A participant is scoped to one project. Support:

- **Guest:** asks for a display name before the first feedback write. Create a cryptographically random project-scoped guest identity; send it only through an appropriately configured `Secure`, `HttpOnly`, `SameSite` cookie. Store only a cryptographic hash server-side.
- **Signed-in client:** associate the authenticated user with a project participant record. Enforce one current participant identity per project/user.
- **Creator:** creator responses and moderation must be authorized through the existing owner session or distinct owner capability. A client share token or participant cookie must never grant creator permissions.

Do not treat a guest display name as a verified identity. Normalize and validate it using a single shared server-side schema. Do not accept a `participant_id`, `user_id`, `isOwner` or role from the client as proof of identity.

Inspect the current `participants` model before changing it. In particular, decide how a guest project owner is represented when the creator replies. Use the smallest safe additive change; do not merge the owner capability with a client guest token.

### 6.2 Preferred-version vote

- Allowed values are exactly `original` and `edited`.
- One current vote per participant/project. Re-submitting the same choice is idempotent; changing the choice updates that participant's vote rather than creating a second vote.
- Enforce uniqueness in the database as well as in service logic, using the repository's D1 migration conventions.
- Count votes from persisted vote records, not client-submitted counters.
- The UI must show the current participant's selection and a clear confirmation/error state.
- Do not expose private participant identity data in the dashboard summary.

The parent plan permits an owner preview vote. Preserve existing behaviour if implemented; otherwise do not invent an owner voting mode without documenting why it is needed.

### 6.3 Comments and replies

- Store comment timestamps as integer milliseconds on the common comparison timeline.
- A timestamp, when present, must be a finite non-negative integer and fall within the valid shared duration. Use the existing common-duration rule; do not create a second timeline or silently clamp invalid timestamps.
- Preserve the existing nullable timestamp model if the project supports general, non-timestamped notes. Do not force null values to zero.
- Validate and normalize body text on the server. Apply one documented, named maximum length; use the existing product conventions where present rather than scattering magic numbers through UI and API code.
- Replies must reference a comment in the same project. Permit one reply level only: a reply cannot itself receive another reply.
- Use stable ordering and bounded pagination. Do not load every comment in an unbounded request.
- Clicking a timestamp seeks the existing player to that exact position; it must not instantiate a second player or reset A/B selection.
- Preserve readable context when a comment is removed. Prefer the existing soft-delete field (`deleted_at`) where applicable so replies do not become orphaned.
- Do not add edit history, attachments, rich text, mentions, reactions or notifications in this release.

### 6.4 Creator moderation and feedback setting

- Creator may reply and moderate/delete comments within projects they own.
- A guest client or signed-in client cannot delete another participant's comment or impersonate the creator.
- Enforce `feedback_enabled` on every vote/comment/reply write at the Worker, not only by hiding UI controls.
- When feedback is disabled, client feedback controls are unavailable and all new feedback writes are rejected with a clear non-sensitive response. Keep historical feedback intact; disabling feedback must not silently delete it.
- Preserve existing download permissions independently. Do not add download functionality in v0.7.0.

### 6.5 Dashboard summary and UI

Add only the UI required to make the feature complete in the current design:

- Original and Edited vote counts with a clear total.
- Recent comments with author display name, timestamp (when present), date and reply context.
- A clear path from a recent comment to the corresponding review/timeline location where supported by existing navigation.
- Feedback enabled/disabled state in project settings.
- Empty, loading, submitting, success, disabled and error states.

Use the existing design tokens and components. Do not redesign the dashboard or review page. Keep both themes, keyboard navigation, visible focus, screen-reader labels and mobile touch targets functional. Avoid colour-only state indicators.

## 7. Resumable R2 upload implementation

### 7.1 Transfer strategy

Preserve the existing single-PUT path for small files. Add a configurable strategy threshold (an initial value around the old 100 MiB boundary is a tuning choice, not a product limit):

- Below the threshold, use the existing single-PUT flow when it is valid.
- At/above the threshold, use multipart.
- Use multipart whenever required by R2's technical limits.
- If multipart cannot be used, return a clear technical/service error. Never fall back to rejecting the file merely because it exceeds the strategy threshold.

Remove the v0.6 fixed 100 MiB application cap only after the multipart route, quota reservation, completion verification, cancellation and tests are ready. Keep non-empty file validation and all aggregate project/account/global storage budgets.

### 7.2 R2 multipart invariants

Use the current Cloudflare R2 documentation during implementation. At the time this plan was prepared, R2 documents these multipart constraints: 5 MiB minimum part size except the final part, 5 GiB maximum part size, up to 10,000 parts, and equal sizes for all non-final parts. Multipart supports objects up to 5 TiB; single PUT has a lower provider technical maximum. The actual Switchroom aggregate quota will normally be much lower.

- Choose a deterministic part size for a session and persist it server-side. Ensure the planned part count is within the R2 limit before creating the multipart upload.
- Keep non-final part sizes identical. The final part may be smaller.
- Use bounded concurrency. A small configurable default (for example, 2–3 concurrent parts) is preferable to unbounded parallelism; justify any higher value with testing.
- Retry only failed parts with bounded retries/backoff. Do not restart already completed parts unnecessarily.
- Capture the exact ETag returned for every successful part. Ensure bucket CORS exposes `ETag` to browser code.
- Presign only the specific `UploadPart` operation, object/upload session and part number. URLs must expire and must not be persisted in IndexedDB, D1 or logs.
- The browser must never receive R2 API credentials, internal object keys or the raw R2 multipart upload ID.
- The Worker performs multipart initiation, authorization, verification, completion and abort control-plane work. Audio bytes travel directly from browser to R2.
- Before completion, the Worker must verify the supplied part list against R2's authoritative multipart state (for example, through `ListParts`) rather than trusting client claims. Reject missing, duplicated, out-of-range or mismatched parts/ETags.
- After completion, verify the final object with server-side metadata (`HEAD`/equivalent): actual size, expected object key, expected content type and upload-session state. Never mark an asset ready before verification succeeds.

### 7.3 API lifecycle

Reuse existing upload routes and response conventions. The parent plan introduces `/api/uploads/multipart/*`; adapt the exact route names to the repository rather than creating a parallel upload API.

The end-to-end lifecycle must support:

1. **Init:** verify project/owner capability, project state, asset role, non-empty expected file size, declared content type, existing project/account quotas and global R2 budget. Reserve bytes before issuing upload authorization. Choose single-PUT or multipart strategy.
2. **Create:** for multipart, create the R2 multipart upload server-side and persist its provider upload identifier only in the server-side upload-session record.
3. **Authorize part:** verify session ownership/state and requested part number; return a short-lived presigned URL scoped to that exact part. Limit how many part URLs can be issued per request.
4. **Resume inspection:** return the server-verified completed part numbers/ETags or equivalent safe resume metadata. Never return object keys or provider credentials.
5. **Complete:** validate the client's proposed parts, compare with R2 state, complete the multipart upload, verify the final object and convert the reservation into committed usage exactly once.
6. **Cancel/abort:** abort the provider multipart upload and remove staged data when possible. Release the reservation exactly once. Make repeated cancel/abort requests safe.
7. **Failure/expiry:** preserve enough state for safe retry or cleanup. A failed or incomplete upload must never become a playable `ready` asset.

Keep the existing single-PUT completion and cancel contracts working. It is acceptable to route both strategies through one internal upload-session state machine if this reduces duplication without changing the external v0.6 behaviour.

### 7.4 Upload state machine

Define and enforce a small explicit state model. Adapt names to existing schema, but preserve these semantics:

`created → uploading → completing → ready`

Terminal/recovery states should distinguish at least `cancelled`, `failed` and `expired` (or equivalent existing values). State changes must be validated server-side and idempotent where retried. Reject impossible transitions, such as completing a cancelled session or marking an expired upload ready.

Keep asset readiness separate from transfer progress. The UI must not expose a partially uploaded object as a playable Original/Edited asset.

### 7.5 Pause, resume and browser state

- Pause stops scheduling new parts; it does not pretend already-issued in-flight requests have been cancelled. Let safe in-flight parts finish or cancel them deliberately.
- Resume requests fresh signed URLs for missing parts. Never reuse expired URLs as if they were valid.
- Persist only the minimum non-secret recovery data in IndexedDB (for example, Switchroom upload-session ID, part size and completed-part metadata). Never store signed URLs, raw R2 upload IDs, owner secrets or auth credentials there.
- After a page reload, ask the user to reselect the source file unless the existing application already has a secure, tested way to retain file access. Do not assume matching filename and size proves file identity. Verify the selected file against the stored session using an appropriately bounded fingerprint/part verification strategy; if identity cannot be established safely, require a new upload rather than combining parts from different files.
- On network interruption, retain completed part state and offer retry/resume. On permanent failure, show a recoverable explanation and a cancel/restart path.
- Progress must be byte-based: completed bytes plus in-flight bytes, capped at a truthful value. Do not show a made-up looping percentage.
- Avoid reading the entire file into memory. Use `Blob.slice()` for individual parts and keep only a bounded number of part buffers/requests active.

### 7.6 Storage reservation and budget enforcement

This is a release-critical part of multipart uploads. Checking quota only after upload is too late.

- Account for committed objects **and** in-flight reservations before authorizing a new upload.
- Keep separate accounting scopes for project/account limits and the Switchroom-managed R2 aggregate budget. Do not mix linked personal-provider quotas; linked providers are v0.8 and out of scope.
- Use one consistent byte unit (`bytes`) internally. Convert to MiB/GiB only for display.
- Reserve the declared expected bytes before creating the upload. Release the reservation on cancel, expiry or terminal failure; convert it to actual committed usage after successful verification.
- Make reserve, release and finalize operations idempotent. Repeated completion/cancel requests must not double-count or subtract bytes twice.
- Protect against concurrent init requests oversubscribing the same quota. Use a D1-safe atomic/conditional reservation approach or a documented equivalent; do not rely on a read-then-write check that races.
- If the actual object size differs from the declaration, do not mark it ready. Remove/quarantine the object, reconcile the ledger and return a clear error.
- Enforce the configured Switchroom-wide storage budget below the provider's current free allowance, leaving headroom for multipart parts, incomplete uploads and cleanup. The parent plan's approximately 8 GB starting target is a configuration assumption, not a permanent provider guarantee; recheck the current quota and configure the actual byte ceiling.
- When the Switchroom budget is exhausted, block only new Switchroom R2 storage reservations. Do not disable listening, local comparisons or access to already stored projects. Do not silently introduce paid capacity.
- Show current committed usage and in-flight reservations where the existing creator upload/dashboard UI can display them without a broader redesign.

If the current repository has no reliable quota ledger, add the smallest additive schema/service needed. Document how the ledger is reconciled; do not bolt on a new billing, metering or analytics service.

### 7.7 Abandoned multipart uploads

- Explicit user cancellation must call the server abort operation.
- Expired upload sessions must be discoverable and safely abortable; implement an idempotent cleanup path that does not affect completed assets.
- Configure the supported R2 lifecycle safeguard for incomplete multipart uploads and document its actual cleanup window. R2 currently documents automatic abortion of incomplete multipart uploads after seven days by default; do not describe this as immediate cleanup.
- Use opportunistic cleanup when expired sessions are encountered. A dedicated upload-session schedule is permissible only if required to meet the release's cleanup expectation and kept separate from v0.9 project-retention automation.
- Cleanup must release reservations only when the corresponding provider state is known or safely reconciled. A failed abort must remain retryable and visible in internal diagnostics without exposing secrets.

### 7.8 Existing asset replacement

If v0.6 already allows replacing Original or Edited, do not delete the currently working asset when a replacement upload merely starts. Keep the old asset available until the replacement has completed and passed verification; then switch the asset reference and clean up the old object idempotently. If replacement is not supported today, do not add a new replacement workflow solely for v0.7.0.

## 8. Minimal data and API changes

Inspect current migrations before proposing schema changes. Prefer additive migrations; do not rebuild tables or rename unrelated fields.

Likely v0.7 requirements to verify against the real schema:

- `participants`: project-scoped guest identity hash, optional authenticated user ID, display name and timestamps; enforce one identity per project/user where appropriate.
- `preferred_votes`: project, participant, choice and timestamps; unique `(project_id, participant_id)` and a valid-choice constraint.
- `comments`: project, participant, optional parent comment, optional timestamp in milliseconds, body, created/updated/deleted timestamps; indexes for project/thread pagination.
- `projects.feedback_enabled`: project setting with server-side enforcement. Preserve the current default if one exists; do not invent a new default silently.
- `upload_sessions`: strategy, provider multipart identifier (server-only), object key (server-only), expected size/type, reserved bytes, expiry, state and idempotency information. Extend the current table instead of creating a competing upload-session system.
- Quota ledger/counters only if the existing implementation cannot safely represent committed and reserved bytes.

All client writes remain behind the Worker. Use prepared statements and server-side schemas. Store dates consistently in UTC. Use opaque IDs. Add indexes that match actual bounded queries; do not add speculative indexes/tables.

### API capabilities

The parent plan lists these v0.7 routes:

- `/api/projects/:id/vote`
- `/api/projects/:id/comments`
- `/api/comments/:id/replies`
- `/api/uploads/multipart/*`

Preserve these only where their authorization model is safe. A guest client must not be able to write merely by knowing a project ID. Reuse a verified share capability, project-scoped participant session or equivalent scoped authorization on every feedback request. If the current route shape cannot express that safely, propose the smallest share-scoped route adjustment and document it; never weaken authorization to preserve a URL shape.

For every feedback request, re-check project status/expiry, link validity/revocation, participant identity and `feedback_enabled`. For every upload request, re-check owner capability, project state, session state and quota. Return generic access errors where revealing project existence would leak private information.

---

## 9. Test plan — required before acceptance

Use the repository's current test tools. Do not add a second overlapping test framework. Use generated or public-domain audio fixtures only; never commit client audio or copyrighted music.

### 9.1 Unit tests

**Feedback domain**

- Accept only `original` and `edited` vote values.
- First vote creates one record; identical repeat is idempotent; changed choice updates the existing record.
- Two concurrent vote writes from one participant still produce one current vote.
- Guest participant is resolved from the secure cookie, not a client-supplied participant ID.
- Signed-in participant resolves to the correct project-scoped record.
- A client cannot be resolved as the project owner.
- Display name/body validation rejects empty, oversized, malformed or unsupported input according to the documented schema.
- Timestamp accepts valid integer milliseconds and rejects negative, fractional, non-finite and out-of-range values.
- Timestamp validation uses the common timeline duration.
- Reply must reference a root comment in the same project; reply-to-reply is rejected.
- Feedback-disabled project rejects vote, comment and reply writes without deleting historical data.
- Deleted-comment rendering preserves thread integrity.

**Upload domain**

- Strategy selector chooses single-PUT or multipart from configuration and technical constraints.
- A file above the old 100 MiB application threshold is routed to multipart, not rejected because of the threshold.
- Part-size calculation always satisfies provider minimum/maximum, equal non-final part sizes and maximum part count.
- Empty files are rejected.
- Invalid upload-session state transitions are rejected.
- Retry of a completed part does not corrupt the part manifest.
- Missing, duplicate, invalid or out-of-range part numbers are rejected.
- Quota reservation accounts for committed plus in-flight bytes.
- Concurrent reservations cannot exceed project/account/global budget.
- Repeated complete/cancel/abort/release operations do not double-count bytes.
- Actual object size mismatch prevents `ready` state and reconciles storage usage.
- Upload cancellation/failure leaves no ready asset.

### 9.2 Worker/API integration tests

Run against local D1 and an R2-compatible test binding/mock appropriate to the existing stack.

**Permissions and feedback**

- Valid guest share can vote/comment/reply when feedback is enabled.
- Expired, revoked, invalid or wrong-scope link cannot write.
- Knowing a project ID alone cannot write feedback.
- Guest cannot access owner-only moderation or project-management actions.
- Signed-in client cannot moderate another participant's comments.
- Creator can reply/moderate only within owned projects.
- Feedback disabled blocks every write endpoint, not just the UI.
- Pagination is bounded and stable; requests cannot return another project's comments.

**Uploads**

- Single-PUT regression: existing v0.6 small-file upload still completes.
- Multipart init is owner-scoped and reserves quota before authorizing parts.
- Part URL only works for its signed object/upload/part/method and expires as configured.
- Client cannot complete an upload using fabricated ETags or missing parts.
- Worker compares the proposed manifest with R2's part list before completion.
- Successful complete verifies the final object and commits the reservation once.
- Interrupted upload can resume only for the correct session/file; completed parts are not unnecessarily retransmitted.
- Cancel/abort is idempotent and eventually releases provider parts and quota.
- Expired session cleanup cannot delete a ready asset.
- Upload attempts beyond the aggregate budget fail clearly without disabling playback or local comparison.
- Worker never receives or buffers the full audio body.
- R2 credentials, raw provider upload IDs, raw object keys and signed URLs are absent from API responses and logs except where a signed URL must be returned to the intended browser for immediate use.

### 9.3 UI and end-to-end tests

Use Playwright or the existing browser automation suite:

1. Guest opens a valid v0.6 share link, enters a display name, votes Original, changes vote to Edited, and sees the updated selection/count.
2. Guest adds a timestamped comment; selecting its timestamp seeks the shared player without changing the active A/B version.
3. Another participant replies; a reply cannot receive a nested reply.
4. Creator replies and moderates/deletes a comment; guest controls cannot perform owner actions.
5. Creator disables feedback; client controls disappear/disable and API writes are rejected. Historical feedback remains available to the creator.
6. Creator uploads a small file through the unchanged single-PUT path.
7. Creator uploads a file larger than the former 100 MiB cap through multipart; verify byte progress and completion using a generated test file or a controlled R2 integration environment.
8. Simulate one failed part; retry only that part and complete successfully.
9. Pause and resume; verify completed parts remain completed.
10. Cancel an upload; verify no playable asset is published and the reservation is released.
11. Exhaust the configured storage budget; a new upload is blocked with a clear message while existing listening and local comparison remain usable.
12. Check empty/loading/success/error/disabled states in dark and light themes, keyboard-only operation, focus order, screen-reader names and mobile layout.

### 9.4 Manual browser checks

At minimum, test current stable Chrome/Edge and Firefox desktop, Safari macOS when available, Safari iOS and Chrome Android when available. Prioritize:

- Audio playback and timeline seek after opening feedback UI.
- Timestamp seek while paused and while playing.
- Upload interruption/recovery and browser refresh/reselection behaviour.
- CORS access to part `ETag` headers.
- Mobile file picker, upload progress, pause/cancel and background/resume behaviour.
- No audio bytes are sent to Worker endpoints.

Record unavailable devices as untested; do not claim they passed.

---

## 10. Acceptance gates

Do not tag or call the release complete until every applicable gate passes.

### Feedback gate

- [ ] Guest can vote, comment and reply without creating an account.
- [ ] Signed-in clients use their own project-scoped identity.
- [ ] Votes are unique per participant/project and can be updated consistently.
- [ ] Comments use the common timeline; clicking a timestamp seeks correctly.
- [ ] Replies are limited to one level.
- [ ] Creator can respond and moderate within owned projects.
- [ ] Guest/client identities cannot impersonate or acquire creator permissions.
- [ ] Feedback can be disabled and is enforced by the Worker.
- [ ] Dashboard shows correct vote counts and recent comments without exposing private identity data.

### Upload/storage gate

- [ ] Existing small-file single-PUT upload still works.
- [ ] An upload above the former 100 MiB cap selects multipart rather than failing due to the old application cap.
- [ ] No fixed application per-file maximum remains; provider technical limits and aggregate quotas are enforced.
- [ ] Multipart upload is direct browser-to-R2, resumable, bounded and retryable.
- [ ] Part authorization, ETag collection and completion verification are server-validated.
- [ ] Pause/resume/cancel/abort and expired-session cleanup are safe and idempotent.
- [ ] Reservations include in-flight bytes, resist concurrent oversubscription and are released/committed exactly once.
- [ ] Incomplete or failed uploads never become ready assets.
- [ ] Large audio is not proxied or buffered in Worker memory; browser memory use remains bounded.
- [ ] Aggregate budget exhaustion blocks only new Switchroom R2 writes and explains why.

### Release-quality gate

- [ ] Existing v0.6 local, share, playback and permission tests still pass.
- [ ] Formatter, lint, type-check, unit, integration, E2E and production build pass.
- [ ] Changed UI works in dark/light themes, with keyboard access and reduced-motion support.
- [ ] No secret, signed URL, private audio or unnecessary personal data appears in logs or repository history.
- [ ] Migrations are additive and documented; test/dev data is isolated from production.
- [ ] README/docs and `CHANGELOG.md` describe v0.7.0 behaviour and known limits.
- [ ] Public deployment is smoke-tested before creating the `v0.7.0` tag/release.

---

## 11. Recommended implementation order

Work in small vertical slices. Each slice must leave the application buildable.

1. **Baseline and design note:** inspect v0.6, record existing contracts, resolve participant/owner representation and quota-ledger approach.
2. **Schema and domain:** add only required additive migrations, unique constraints, validation schemas and unit tests.
3. **Feedback API:** implement participant resolution, votes, comments, replies, creator permissions and feedback setting; add integration tests before UI.
4. **Feedback UI:** add the minimal review-page controls and creator summary; add Playwright coverage and accessibility checks.
5. **Upload state model and quota:** extend current upload sessions, implement atomic reservation/release and tests; keep the old upload path operational.
6. **Multipart control plane:** create/authorize/list/complete/abort multipart operations and verify R2 state server-side.
7. **Multipart browser client:** bounded part scheduler, byte progress, failed-part retry, pause/resume/cancel and safe recovery metadata.
8. **Large-file and cleanup verification:** test old-cap boundary, concurrent quotas, interruption, stale sessions and actual object verification.
9. **Release validation:** regression suite, supported-browser checks, docs/changelog, deploy and smoke-test.

Do not implement both workstreams as one large unreviewable change. Keep each pull request narrow enough to review and revert independently where practical.

## 12. AI coding-agent execution protocol

### Before each work slice

- State the exact v0.7 requirement being implemented.
- List the existing files/routes/tables/components that will change.
- Identify the test that will prove the behaviour.
- Note any unresolved product/security decision. Do not fabricate an answer.

### While coding

- Follow existing repository conventions and naming.
- Prefer small typed functions and explicit state transitions over clever abstractions.
- Validate all untrusted inputs on the Worker even when the UI validates them too.
- Keep UI state derived from actual API/upload state; no fake progress, fake counts or placeholder actions.
- Avoid broad refactors, unrelated formatting churn and speculative abstractions for v0.8+.
- Add regression tests with each behaviour change.
- Keep errors actionable for users but non-revealing about private projects and credentials.
- Do not suppress type errors or weaken lint/security checks to get a green build.

### Before reporting completion

Run the actual repository commands for formatting, lint, type-check, unit tests, integration tests, E2E tests and production build. Report commands and pass/fail results honestly. Run the manual checklist for relevant browsers/devices. Inspect the final diff for secrets, accidental scope expansion, unbounded queries, unbounded concurrency, unbounded memory use and duplicated authorization logic.

The final implementation report must include:

1. What was implemented, mapped to the v0.7 scope.
2. Files/migrations/routes changed and why.
3. Tests run and exact results; list skipped tests and why.
4. Manual browser/device checks completed and not completed.
5. Deployment/smoke-test result and release commit/tag, if created.
6. Known limitations, security considerations and follow-up items explicitly deferred to v0.7.5, v0.8 or v0.9.

Never claim an untested browser, successful resume, correct quota accounting, secure authorization or production deployment without evidence.

---

## 13. Current technical references to re-check

Re-open the official documentation before implementation; provider limits and SDK behaviour can change.

- [Cloudflare R2 — Upload objects and multipart limits](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Cloudflare R2 — Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 — CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare R2 — Error codes and multipart failures](https://developers.cloudflare.com/r2/api/error-codes/)
- [Cloudflare D1 — SQL and database behaviour](https://developers.cloudflare.com/d1/)
- [MDN — Blob.slice()](https://developer.mozilla.org/en-US/docs/Web/API/Blob/slice)
- [MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Playwright — Test runner](https://playwright.dev/docs/intro)

**Important R2 implementation notes checked while preparing this plan:** browser uploads require a bucket CORS policy for the exact application origin and required methods/headers; browser JavaScript needs `ETag` exposed to read the part result. Presigned URLs are bearer credentials. The Worker R2 binding does not itself generate S3 presigned URLs, so reuse the existing server-side signing approach. Confirm the exact SDK/signing implementation and compatibility with the deployed Worker runtime before adding or changing dependencies.

---

## Definition of v0.7.0 complete

A client can give useful feedback on a shared A/B comparison without creating an account, and a creator can upload large audio files reliably without an arbitrary application per-file cap. The implementation preserves the existing product, uses secure project-scoped permissions, accounts for in-flight storage, and is covered by automated and manual tests. Anything beyond that belongs in a later release or requires an explicit product decision.
