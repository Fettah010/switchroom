# Switchroom v0.6.0 — AI Agent Implementation Instructions

> **Document type:** Standalone engineering brief, implementation contract, and acceptance specification  
> **Target release:** `v0.6.0` only  
> **Product:** Switchroom — Open-Source Audio A/B Review Tool  
> **Baseline:** A working, deployed `v0.5.x` implementation  
> **Primary outcome:** Secure, account-free client listening through shareable review links  
> **Companion plan:** `Switchroom_Open_Source_Audio_Review_Plan.md`  
> **Status:** Execution specification

---

## 0. Read this before doing anything

You are implementing **only Switchroom v0.6.0 — Client sharing and guest review pages**.

Your task is to inspect the existing repository, understand the real v0.5 implementation, and deliver the v0.6 feature set described in this document. Do not rebuild completed earlier milestones, do not assume the repository matches the proposed architecture, and do not implement features assigned to later releases.

This document expands the v0.6 milestone in the companion plan into an actionable engineering specification. The companion plan remains the product-level source for the wider application. This document is the detailed contract for the v0.6 workstream.

### Non-negotiable release boundary

**v0.6.0 adds sharing and guest listening. It does not complete the feedback or download workflow.**

| Version   | Responsibility                                                                                                                    | v0.6.0 instruction                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1–v0.4 | Local comparison, dependable transport, waveform and local workspace                                                              | Treat as existing functionality. Preserve it.                                                                                                |
| v0.5      | Worker/API, D1, private R2 uploads, optional auth, guest creator ownership and cloud projects                                     | Treat as the required backend foundation. Reuse it.                                                                                          |
| **v0.6**  | **Public/unlisted/private sharing, client review page, guest listening, scoped access, signed playback URLs and link management** | **Implement now.**                                                                                                                           |
| v0.7      | Preferred-version votes, guest identities for feedback, timestamped comments, replies and moderation                              | Do not implement. Do not add comment/vote endpoints or UI.                                                                                   |
| v0.8      | Client downloads, download endpoints, multipart/resumable uploads and upload size expansion                                       | Do not implement. Do not add download endpoints or multipart upload support.                                                                 |
| v0.9      | Scheduled retention deletion, full abuse-hardening milestone, production security sweep and operational cleanup dashboards        | Do not implement as a milestone. Enforce existing expiry timestamps at access time and add only security controls directly required by v0.6. |
| v1.0      | Stable release documentation and final product-wide release polish                                                                | Do not implement. Do not broaden this task into a v1.0 release.                                                                              |

A v0.6 implementation may add narrowly scoped database fields, authorization abstractions or tests that make later work easier. It must not expose unfinished future functionality, add speculative screens, or silently begin later milestone work.

---

## 1. Mission and success definition

### 1.1 Mission

Allow a creator who already has a cloud project in v0.5 to generate and manage a review link. A client opens that link in a normal browser, without signing in, and can listen to both the Original and Edited tracks using the existing synchronized A/B player.

The creator must be able to control how the project is reached, whether a link expires, whether a private invite is revoked, and whether a password is required. The client-facing page must be focused, responsive and private by default.

### 1.2 A successful v0.6 release means

1. An existing cloud project with both audio assets in `ready` state can be shared.
2. Public and unlisted primary links work according to their configured visibility.
3. Private projects can be accessed only through a valid invite link.
4. Invite links have independent expiry and revocation state.
5. Password protection works only if the password implementation passes the security and runtime gates in this document.
6. A client can listen to Original and Edited without an account or owner privileges.
7. Each playback URL is issued only after a fresh server-side authorization check.
8. The browser can stream and seek audio from private R2 objects without exposing the bucket or permanent object URLs.
9. Revoked, expired, invalid and project-expired links are handled clearly and safely.
10. The creator can view, create, copy and revoke share links from a working share-management interface.
11. The existing v0.1–v0.5 features continue to work.
12. CI, tests, build and a deployed smoke test pass before the `v0.6.0` tag is created.

### 1.3 Product experience standard

The shared review page is a client presentation surface, not a second creator dashboard. It should feel like a deliberate listening room: project title, optional description, clear Original/Edited labels, the single synchronized player, and only the controls needed for listening. It must not expose project administration, owner credentials, internal IDs, storage keys or unfinished collaboration features.

---

## 2. Source of truth and agent operating rules

### 2.1 Inspect before changing

Before editing code:

1. Read the complete companion plan and this document.
2. Inspect the repository, current branch, package scripts, migrations, environment bindings and deployed application.
3. Identify the actual v0.5 implementation state. Do not assume every item in the plan was completed exactly as written.
4. Run the existing test suite and production build before making changes. Record pre-existing failures separately.
5. Trace the current project-ownership model for both authenticated creators and guest creators.
6. Trace the existing R2 upload/finalize path and identify how an asset becomes `ready`.
7. Trace the current audio player and determine how remote media URLs enter its existing transport controller.
8. Identify the established route naming, JSON casing, validation library, error response format and UI component conventions.
9. Write a brief implementation plan based on the actual codebase. Resolve only technical details; do not invent product requirements.

Do not create a parallel project service, authentication system, player, database abstraction or styling system when the repository already has a suitable implementation.

### 2.2 Repository and dependency rules

- Preserve the current package manager and lockfile.
- Do not upgrade major dependencies solely for convenience.
- Do not add a hosted auth, database, storage, analytics, email or paid API provider.
- Prefer existing validation, test, UI and cryptography utilities when suitable.
- Add a dependency only when it solves a real v0.6 requirement and is compatible with the Workers runtime.
- Verify current package and Cloudflare API documentation before depending on a specific API shape.
- Keep secrets in Worker environment secrets/bindings. Never commit credentials or real client audio.
- Keep `main` deployable. Use a feature branch and small, reviewable commits.

### 2.3 Conflict handling

If this specification conflicts with existing behaviour:

1. Preserve the working v0.5 behaviour unless a change is essential for v0.6 security or correctness.
2. Prefer the narrowest additive migration and smallest API change.
3. Do not silently remove or reinterpret an existing field.
4. Document the conflict and the selected backward-compatible resolution in the implementation report.
5. Do not proceed with an unsafe security shortcut merely to satisfy a feature checkbox.

### 2.4 No fake completion

Do not mark work complete based on code presence. Verify the real browser and API behaviour. Never ship fake share URLs, non-functional copy buttons, placeholder permissions, simulated playback, hard-coded success states or UI controls that do nothing.

---

## 3. v0.6 scope contract

### 3.1 Included

- Dedicated client review route/page.
- Public and unlisted share modes.
- Private invite links.
- Per-link scope, expiry and revocation.
- Project-level password protection only if the security gate passes.
- Noindex defaults and explicit public indexing opt-in.
- Anonymous guest listening; no client signup requirement.
- Server-side access resolution for every share-page and playback authorization.
- Short-lived R2 presigned GET URLs for Original and Edited assets.
- Share dialog/management UI: visibility, link generation, expiry, copy and revoke.
- Client download and feedback permission flags, preserved and represented accurately without implementing those later-version workflows.
- Unavailable, expired, revoked and invalid link states.
- Tests, documentation, deployment and release evidence for v0.6.

### 3.2 Explicitly excluded

- Votes or preferred-version submissions.
- Comments, replies, timestamps, guest comment identities or moderation.
- Download buttons, download URL handlers, attachment delivery or download analytics.
- Multipart/resumable uploads, larger upload limits or upload lifecycle changes unrelated to sharing.
- New audio formats, server-side conversion, waveform generation changes or audio editing features.
- Email invitations, notifications or email delivery.
- Team workspaces, billing, quotas UI beyond existing project behaviour, or organization roles.
- Automated project deletion, scheduled cleanup jobs or a cleanup dashboard.
- Turnstile rollout as a general anti-abuse milestone.
- Search/discovery feeds, public libraries, public project directories or a new marketing site.
- New client accounts or required authentication for listening.

### 3.3 Later-version compatibility only

The v0.6 permission model must preserve the creator's preferences for feedback and downloads. That does **not** mean the related actions are implemented now.

- Preserve existing `feedback_enabled` and `downloads_enabled` fields if they already exist.
- The owner-facing interface may display or update these preferences only if the current project model already supports them; label clearly that the corresponding client actions are not available in v0.6.
- The effective v0.6 client capability response must report `feedback: false` and `downloads: false`, regardless of stored preference flags. Only `listen: true` can be granted by a v0.6 share link.
- Do not render inert feedback or download controls on the client page.
- Do not create `/vote`, `/comments`, `/replies` or `/download` handlers.
- A `listen` link scope is sufficient for v0.6. Keep the data model extensible, but do not add unimplemented feedback scopes as active permissions.

---

## 4. Preconditions and project eligibility

### 4.1 Required v0.5 foundation

The v0.6 feature assumes the application already has:

- React + TypeScript + Vite frontend.
- Cloudflare Worker API using the current project framework (Hono in the plan).
- D1 metadata database and migration workflow.
- Private R2 bucket and existing direct-to-R2 upload flow.
- Project and audio asset records.
- Authenticated creator sessions and guest-owner capability access.
- A functioning local/cloud comparison player.
- Project expiry metadata, including `expires_at`.

Do not reimplement any of those foundations as part of v0.6.

### 4.2 Project eligibility

A project may be shared only when all of the following are true:

- The caller is the authenticated owner or has the existing guest-owner management capability.
- The project exists and is not logically deleted.
- The project has not reached `expires_at`.
- It has exactly one Original and one Edited asset attached.
- Both assets are in the existing `ready` state.
- The object keys resolve to the expected project assets in the private R2 bucket.

If one asset is missing, uploading, failed or not finalized, do not create a playable share link. Return a clear owner-facing validation error. Do not expose asset object keys in the response.

### 4.3 Expiry behaviour in this milestone

v0.6 must enforce project and link expiry during access checks. It must not implement the v0.9 scheduled deletion system.

- An expired project becomes inaccessible immediately at the server authorization layer.
- The corresponding R2 objects and metadata are not required to be physically deleted by v0.6.
- The existing expiry timestamp remains authoritative.
- A future v0.9 cleanup process may purge expired data; v0.6 must not add a Cron Trigger or claim that expired data has already been purged.

---

## 5. Link and visibility model

### 5.1 Treat visibility, password and expiry as separate controls

Do not combine these into one overloaded status field.

- **Visibility** determines how a project can be reached.
- **Password protection** is an additional access gate.
- **Link expiry** determines when a particular link stops working.
- **Project expiry** is the upper bound on all access.
- **Revocation** invalidates one link immediately for future authorization checks.
- **Feedback/download settings** are capability preferences, not implemented actions in v0.6.

### 5.2 Visibility modes

| Mode       | Meaning                                                                         | Access rule                                                             | Indexing                                                  |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `public`   | A creator-designated public review link. Anyone who reaches the URL may listen. | Valid active primary link plus project checks.                          | Off by default. May be deliberately enabled by the owner. |
| `unlisted` | Share-by-link access. The URL is not listed or indexed by the application.      | Possession of the active high-entropy primary link plus project checks. | Always `noindex`.                                         |
| `private`  | Invite-only access. There is no generally accessible primary link.              | A valid active invite link is required.                                 | Always `noindex`.                                         |

All link tokens must be high entropy, including public link tokens. “Public” describes the access policy, not permission to expose the R2 bucket or use guessable database IDs.

Do not create a discovery feed, public directory or automatic sitemap of projects. Public indexing is a deliberate exception for an individual public project only.

### 5.3 Primary links and invite links

Use one consistent link-resolution system.

- A non-private project has one active **primary link** at a time.
- A private project has no primary link; it is reached using one or more **invite links**.
- An invite link belongs to exactly one project.
- Each invite link has an independent expiry and revocation state.
- A link's permissions cannot exceed the project's permissions.
- A new primary link rotation must revoke the previous primary link before or atomically with creating the replacement.
- A private invite must never grant owner-management capability.

For v0.6, the active link scope is `listen`. Do not add active write scopes. The schema can support future scope additions through a controlled migration when those features are implemented.

### 5.4 Link expiry rules

- Each link may have its own `expires_at`.
- A link with no link-specific expiry still expires when its project expires.
- A link's expiry must never be later than the project expiry.
- If a creator selects an expiry after the project expiry, reject it or clamp it only if that is already the established product convention. Do not silently extend project retention.
- Use UTC timestamps consistently.
- Evaluate expiry server-side on every access and playback authorization request.
- Boundary rule: when `now >= expires_at`, access is denied.

### 5.5 Revocation rules

- Revocation is a server-side state change, not just a hidden UI entry.
- Revoke by link record ID after verifying owner authority and project association.
- Set `revoked_at` once; repeated revoke calls should be safe and idempotent.
- Revocation blocks new share access and new playback URL issuance immediately after the state change is committed.
- Already-issued R2 presigned URLs cannot be retroactively recalled. Their exposure window is bounded by their short expiry. The UI and docs must not claim otherwise.
- Revoking a primary link must not grant access through an old token or automatically expose a private project.

### 5.6 Password protection

Password protection is an optional gate layered on top of the visibility/link model.

- Never put the password in a URL, query string, share token, project title or log.
- Never store plaintext passwords.
- Never use unsalted SHA-256, MD5, SHA-1 or another fast general-purpose hash as a password hash.
- Prefer a reviewed adaptive password hash such as Argon2id; use another OWASP-acceptable scheme only with a documented reason and security review.
- Benchmark the actual implementation in the deployed Workers runtime against the account's CPU and memory limits.
- A password implementation that cannot meet a suitable security cost within the runtime must remain disabled. Do not reduce the work factor until it is unsafe just to enable the UI.
- Add throttling for password attempts before enabling the feature. Keep counters bounded and avoid storing raw IP addresses where a short-lived keyed hash or existing rate-limit mechanism is sufficient.
- Use a short-lived, project/link-scoped verification grant in a `Secure`, `HttpOnly`, appropriately `SameSite` cookie. The grant must not be reusable on another project or link.
- Clear or invalidate the verification grant when the link expires, is revoked, the project expires, or the password changes.
- Use generic failure responses that do not reveal whether a password-protected project exists.

**Password release gate:** password-protected sharing is included only if the hash, verification grant, throttling, timing behaviour and Worker runtime benchmarks pass review. Otherwise ship the rest of v0.6 with password protection disabled and clearly reported as deferred for security reasons. Do not ship a weak substitute.

---

## 6. Security and authorization architecture

### 6.1 Fundamental rule

The browser is untrusted. The Worker is the authorization authority. Hiding buttons or checking a route in React is never sufficient permission enforcement.

Every route that returns project information, creates a share link, revokes a link or issues a playback URL must authenticate the owner or resolve a valid share capability on the server.

### 6.2 Capability separation

Keep these capabilities separate:

1. **Owner session:** existing Better Auth session for an authenticated owner.
2. **Guest-owner capability:** existing v0.5 management secret/cookie/link. It may manage a project only through the existing owner authorization service.
3. **Client share capability:** random share token that grants only the scope recorded for that link.
4. **Password verification grant:** temporary evidence that a visitor passed a project's password gate. It grants no owner permission and does not bypass link expiry or revocation.

Never reuse a client share token as a guest-owner secret. Never derive owner authority from a project ID, a client cookie, a display name or knowledge of an R2 key.

### 6.3 Share token generation and storage

- Generate tokens using a cryptographically secure random source available in the Worker runtime.
- Use at least 32 random bytes (256 bits) before URL-safe encoding.
- Encode using base64url or another URL-safe encoding without lossy transformations.
- Store only a cryptographic digest of the raw token in D1. Do not store the raw token.
- A fast digest such as SHA-256 is acceptable for a uniformly random 256-bit bearer token; this rule does not apply to human-chosen passwords.
- Compare or look up tokens using their digest. Reject malformed token lengths/characters before database access.
- Do not log raw tokens, token hashes, full share URLs or signed R2 URLs.
- Return the raw share URL only when the link is first created or rotated. It cannot be reconstructed from the stored hash later.
- In the link list, return safe metadata only. If the creator loses a URL, allow rotation/reissue rather than revealing the original token.

### 6.4 Owner authorization

Reuse the v0.5 owner authorization layer. Do not write a second implementation with slightly different rules.

For every owner route:

1. Resolve the current authenticated owner session or guest-owner capability.
2. Load the project using a parameterized query.
3. Verify that the resolved owner controls that project.
4. Verify that the project is not deleted or expired where the operation requires an active project.
5. Validate the requested link ID belongs to that project.
6. Apply the operation.

Return a generic not-found/forbidden result when revealing the existence of another user's project would create an information leak.

### 6.5 Client access resolution

For every incoming share token:

1. Validate token shape and maximum length.
2. Compute the token digest.
3. Resolve one matching `share_links` record.
4. Resolve its project.
5. Verify the link is active, not revoked and not expired.
6. Verify the project exists, is not deleted and is not expired.
7. Verify the link type is compatible with the project's current visibility.
8. Verify both audio assets are present and `ready`.
9. Verify password protection, if configured, has been satisfied by a valid link/project-scoped grant.
10. Resolve the allowed `listen` capability.
11. Return only safe client-facing project metadata and capabilities.

Do not accept a project ID from the client as evidence of share access. Do not query a project by public ID and then skip token/link resolution for unlisted or private projects.

### 6.6 Authorization response data

The client may receive only the information needed to present and play the review:

- Project title and optional description.
- Client-safe Original and Edited labels.
- Safe duration metadata and supported technical summary if already stored.
- Project/link expiry information suitable for display.
- Explicit capability booleans.
- A non-sensitive public identifier only if the UI genuinely needs it.

Do not return:

- Owner user IDs or guest-owner capability data.
- Owner session data.
- Raw share token or token digest.
- R2 object keys, bucket names or storage credentials.
- Password hash or password verifier.
- Internal database row IDs unless they are specifically required and safe.
- Private upload metadata, checksums not needed by the client, or other participants' data.

### 6.7 Same-origin and CSRF controls

- Keep the API same-origin with the application unless the existing deployment requires an explicitly documented origin.
- Validate request `Origin` on state-changing browser routes.
- Apply the existing CSRF strategy to authenticated owner routes and cookie-authenticated operations.
- Use secure cookie attributes in production: `Secure`, `HttpOnly`, and a deliberate `SameSite` policy.
- Do not enable wildcard credentialed CORS.
- Validate HTTP method, content type, request body shape and body size.
- Use prepared statements only.

### 6.8 Browser and response privacy headers

For share/review HTML and sensitive share APIs:

- `Cache-Control: no-store` for access responses containing sensitive project state or signed playback URLs.
- `Referrer-Policy: no-referrer` on token-bearing review routes so the token is not sent as a referrer to other origins.
- `X-Content-Type-Options: nosniff`.
- A restrictive Content Security Policy compatible with the current app.
- `X-Robots-Tag: noindex, nofollow, noarchive` whenever indexing is not explicitly allowed.
- No third-party analytics or scripts on token-bearing review pages unless specifically reviewed and proven not to receive the token in URLs, referrers or telemetry.

For public projects with indexing deliberately enabled, remove the noindex directive only for that public route. Unlisted, private, password-protected and invite links must remain noindex regardless of any project-level indexing flag.

Remember: `noindex` is a crawler instruction, not an access-control mechanism. The Worker must still enforce all permissions.

---

## 7. Data model and migration requirements

### 7.1 Inspect the live schema first

The companion plan already anticipates `projects`, `audio_assets`, `share_links` and upload records. Confirm which columns and constraints exist in the real v0.5 database before writing a migration.

Do not duplicate tables or create conflicting column names. Prefer an additive migration. Preserve existing project and asset records.

### 7.2 Project fields

Reuse existing fields where present:

| Field                     | Requirement                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `visibility`              | Controlled value: `public`, `unlisted` or `private`. Keep existing semantics if already deployed; migrate carefully if they differ. |
| `password_hash`           | Nullable adaptive password hash. Do not return it to clients.                                                                       |
| `expires_at`              | Existing project expiry; authoritative upper bound for link access.                                                                 |
| `deleted_at`              | Existing logical-deletion marker. Any non-null value denies access.                                                                 |
| `feedback_enabled`        | Preserve existing flag. No feedback endpoints in v0.6.                                                                              |
| `downloads_enabled`       | Preserve existing flag. No download endpoints in v0.6.                                                                              |
| `public_indexing_enabled` | Add only if absent. Default false. Applies only to `public` visibility and is ignored for all other modes.                          |

If a different existing model represents indexing or password state, adapt to it rather than introducing parallel fields.

### 7.3 Share link fields

Use the existing `share_links` table if available. The required logical data is:

| Field                | Requirement                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Opaque random identifier; not an access credential.                                                                    |
| `project_id`         | Foreign key/reference to one project.                                                                                  |
| `token_hash`         | Unique digest of the raw random token. Never store raw token.                                                          |
| `kind` or equivalent | `primary` or `invite`. Reuse an existing compatible `scope`/type column if possible.                                   |
| `scope`              | `listen` for v0.6. Do not activate feedback/write scopes.                                                              |
| `label`              | Optional owner-facing invite label. Add only if it materially improves link management. Never use it as a permission.  |
| `expires_at`         | Nullable link expiry, always capped by project expiry during validation.                                               |
| `revoked_at`         | Nullable timestamp. Non-null means deny.                                                                               |
| `created_at`         | UTC timestamp.                                                                                                         |
| `last_used_at`       | Optional, only if it can be updated without excessive writes or exposing client identity. Not required for acceptance. |

Add indexes for `token_hash`, `project_id`, link kind/scope and relevant active-link lookups. Ensure token hashes are unique.

### 7.4 Invariants

Enforce these invariants in application logic and database constraints where practical:

- A share link belongs to exactly one project.
- A project can have no more than one active primary link.
- Private projects cannot be reached through a primary link.
- Invite links are valid only for the project to which they belong.
- All v0.6 links grant listening only.
- `revoked_at IS NOT NULL` always denies access.
- `now >= link.expires_at` denies access.
- `now >= project.expires_at` denies access.
- `project.deleted_at IS NOT NULL` denies access.
- A link cannot outlive the project.
- A project must have one ready Original asset and one ready Edited asset before a link can be created or played.

If D1 does not support the desired constraint directly, enforce it with a guarded, idempotent write sequence and tests. Do not assume Postgres transaction semantics.

### 7.5 Migration quality

- Use the repository's existing migration naming and tooling.
- Make migrations additive and safe for current v0.5 data.
- Provide defaults for new boolean fields (`false` for indexing).
- Do not backfill existing projects to public visibility.
- Do not create public links automatically for existing projects without owner intent.
- Test migration against a copy or fixture of the v0.5 schema.
- Document forward-fix or rollback strategy.

---

## 8. API contract

Use the existing Hono routing and response conventions. The route list below defines the required behaviour; adapt method names or JSON casing to current repository conventions without changing the security semantics.

### 8.1 Required routes

| Method   | Route                              | Purpose                                                                                | Authorization                                              |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET`    | `/api/share/:token/access`         | Resolve link/project and return safe review-page metadata/capabilities.                | Valid share token; password grant if configured.           |
| `POST`   | `/api/share/:token/password`       | Verify password and set a short-lived link-scoped grant.                               | Valid active link and project; no existing grant required. |
| `GET`    | `/api/share/:token/playback/:role` | Issue a temporary GET URL for `original` or `edited`.                                  | Fresh share authorization and password grant if required.  |
| `GET`    | `/api/projects/:id/links`          | List safe link metadata.                                                               | Owner authority.                                           |
| `POST`   | `/api/projects/:id/links`          | Create or rotate a primary link, or create a private invite.                           | Owner authority.                                           |
| `DELETE` | `/api/projects/:id/links/:linkId`  | Revoke a specific link.                                                                | Owner authority and project/link association.              |
| `PATCH`  | `/api/projects/:id/sharing`        | Update visibility, password state, indexing and applicable client permission settings. | Owner authority.                                           |

If the repository already has an equivalent project-update route, extend it rather than adding a duplicate route. Do not introduce extra endpoints without a concrete v0.6 need.

### 8.2 Access endpoint

`GET /api/share/:token/access`

Responsibilities:

- Resolve the token and authorize the project.
- Enforce link and project expiry/revocation.
- Enforce project visibility and private invite rules.
- Confirm the Original and Edited assets are ready.
- Enforce password verification state.
- Return safe project information and capability flags only.
- Never return permanent object URLs or R2 object keys.

Suggested response shape (adapt naming to the codebase):

```json
{
  "project": {
    "title": "Session review",
    "description": "Optional client-facing description",
    "original": {
      "label": "Original",
      "durationMs": 184000
    },
    "edited": {
      "label": "Edited",
      "durationMs": 183500
    },
    "expiresAt": "2026-12-15T12:00:00.000Z"
  },
  "capabilities": {
    "listen": true,
    "feedback": false,
    "downloads": false
  },
  "access": {
    "passwordRequired": false,
    "linkExpiresAt": null
  }
}
```

This is an illustrative contract, not a mandate to copy the exact names. The response must not expose owner identity, secrets, token data or storage details.

If a password is required but not yet verified, return a clear machine-readable `PASSWORD_REQUIRED` state and do not return playback URLs. Do not return partial project information that leaks private details before password verification.

### 8.3 Password endpoint

`POST /api/share/:token/password`

Input: a password string in a JSON body, subject to explicit length and payload limits.

Responsibilities:

- Resolve and validate the link/project before attempting the password check.
- Apply attempt throttling before expensive hash verification.
- Verify using the approved adaptive hash implementation.
- Issue a short-lived, scoped verification grant only on success.
- Avoid revealing whether the token, project or password was the incorrect element beyond the minimum UX state.
- Never log request bodies or password values.

Use generic errors, for example:

- `LINK_UNAVAILABLE`
- `PASSWORD_REQUIRED`
- `PASSWORD_INVALID`
- `TOO_MANY_ATTEMPTS`

Do not put password values in query parameters, browser storage, analytics or error telemetry.

### 8.4 Playback endpoint

`GET /api/share/:token/playback/:role`

Allowed `role` values are exactly:

- `original`
- `edited`

Reject all other values. Do not accept an arbitrary object key or path from the client.

Responsibilities:

1. Re-run the complete share authorization check.
2. Re-check link revocation, link expiry, project expiry and logical deletion.
3. Re-check password grant validity if the project is protected.
4. Map the requested role to the matching ready asset from the authorized project.
5. Verify the asset is attached to the project and use its server-held object key.
6. Generate a short-lived R2 `GetObject` presigned URL for exactly that object.
7. Return the URL, its expiry timestamp and safe response metadata.
8. Set `Cache-Control: no-store` on the JSON response.

Suggested response:

```json
{
  "url": "https://...temporary-signed-url...",
  "expiresAt": "2026-11-15T02:35:00.000Z",
  "mimeType": "audio/mpeg",
  "sizeBytes": 12345678
}
```

The URL is a bearer credential. Keep its lifetime short (target five minutes initially, configurable within a narrow safe range), keep it out of logs and persistent client storage, and never store it as a share link. Confirm the current R2 presigned URL maximum and signing behaviour in official docs; do not confuse the provider's maximum lifetime with the application's required lifetime. The signed GET must resolve to the stored audio object's correct audio MIME type and an inline playback disposition; do not trust a client-supplied MIME type or filename at playback time.

### 8.5 Owner link-list endpoint

`GET /api/projects/:id/links`

Return only safe metadata:

- Link record ID.
- Kind (`primary` or `invite`).
- Optional label.
- Scope (`listen`).
- Creation, expiry and revocation timestamps.
- Active/expired/revoked status derived server-side.

Never return raw token, token hash, password hash, owner capability or signed playback URL.

### 8.6 Link creation endpoint

`POST /api/projects/:id/links`

Support the operations necessary for v0.6:

- Create or rotate a primary link for `public` or `unlisted` projects.
- Create an invite link for a `private` project.
- Accept an optional expiry and optional owner-facing label for an invite.
- Enforce project eligibility and owner authority.
- Generate a new random token, persist only its hash and return the raw URL once.

For private projects, reject primary-link creation. For public/unlisted projects, do not create unrestricted invite semantics unless the product model explicitly needs a separate invite; avoid redundant active links with confusing ownership.

Primary-link rotation must revoke the previous active primary before returning the new one. The operation must be safe against duplicate requests and partial failures; do not leave two active primary links.

### 8.7 Link revocation endpoint

`DELETE /api/projects/:id/links/:linkId`

- Verify owner authority for `:id`.
- Verify the selected link belongs to `:id`.
- Revoke idempotently.
- Return the updated safe link status.
- Do not reveal links belonging to another project.

### 8.8 Sharing settings endpoint

Update only v0.6 settings:

- Visibility: `public`, `unlisted`, `private`.
- Public indexing: boolean, accepted only when visibility is `public`.
- Password state: set/change/remove using the approved password workflow; never return stored hash.
- Feedback/download flags only if they already exist or are required by the companion plan. Preserve their values and communicate their v0.6 limitations honestly.

When changing to `private`, revoke the active primary link. Existing invite links may remain active unless the creator explicitly revokes them; they must continue to be invite-only and subject to all project checks. When changing from private to public/unlisted, create a fresh primary link only after explicit owner action, or present a clear create-link step. Do not silently publish a previously private project.

When changing public to unlisted, the same primary link may remain valid but must become noindex. When changing unlisted to public, indexing must remain disabled unless the owner separately opts in.

### 8.9 Errors and status codes

Use the repository's error envelope. The following semantics must hold:

| Condition               |                  Suggested status | Behaviour                                                    |
| ----------------------- | --------------------------------: | ------------------------------------------------------------ |
| Malformed token         |                             `404` | Generic unavailable page; no project disclosure.             |
| Unknown token           |                             `404` | Same generic unavailable result.                             |
| Revoked link            |            `410` or generic `404` | Deny all new access/URL issuance.                            |
| Expired link            |            `410` or generic `404` | Deny all new access/URL issuance.                            |
| Expired/deleted project |            `410` or generic `404` | Deny access.                                                 |
| Password required       |                             `401` | Return only password-required state.                         |
| Incorrect password      |                             `401` | Generic failure; throttle attempts.                          |
| Rate limited            |                             `429` | Return retry guidance without exposing internal counters.    |
| Invalid role            |                             `400` | Reject role outside `original`/`edited`.                     |
| Asset not ready         |                             `409` | No playback URL; owner-facing project state may explain why. |
| Not owner               |            `403` or generic `404` | No link-management data disclosed.                           |
| Owner project not found |                             `404` | Generic response.                                            |
| Storage signer failure  | `502` or established server error | Log a safe error code; do not leak credentials.              |

Do not reveal whether a private project exists to an unauthorised caller. Public client-facing error copy should remain calm and useful.

---

## 9. R2 playback and audio-player integration

### 9.1 Private storage stays private

- Keep the R2 bucket private.
- Do not enable public bucket access to make playback easier.
- Do not expose R2 credentials or bucket bindings to the browser.
- Do not construct object keys from user-supplied filenames.
- Use the already stored server-side object key for the exact authorized asset.
- Use an R2 presigned GET URL or an already-approved equivalent temporary delivery mechanism.

The preferred v0.6 path is: browser → Worker access check → short-lived presigned GET URL → private R2 object.

### 9.2 Range requests and seeking

The existing player must continue to support seeking through remote audio assets. Verify real browser behaviour for HTTP byte ranges rather than assuming that receiving the first bytes is enough.

Test at least:

- Initial audio load.
- Seeking near the beginning, middle and end.
- Repeated seeking.
- Playback after seeking.
- Both Original and Edited URLs.
- Long media where the browser requests additional byte ranges.
- URL expiry while the page remains open.

Confirm the current R2/S3-compatible GET behaviour and browser CORS requirements using official documentation and actual integration tests.

### 9.3 R2 CORS

Configure CORS for the exact deployed application origin(s), plus explicit development origins where needed. Do not use wildcard origins in production merely to make testing pass.

At minimum, review:

- Allowed origins: exact app origin(s).
- Allowed methods: `GET` and `HEAD` only for playback.
- Allowed headers: only the headers actually required by browser playback/range requests.
- Exposed headers needed by browser/player code, such as `Content-Length`, `Content-Range`, `Accept-Ranges`, `Content-Type` and `ETag` where required.
- No credentialed cross-origin access to the R2 object.

Do not add `PUT` to the playback CORS policy unless an existing upload policy requires it. Keep upload permissions and playback permissions separate where practical.

For media routed through Web Audio, set the media element's `crossOrigin` mode before setting its `src`, and verify the CORS response is compatible with the existing `MediaElementAudioSourceNode` graph. Preserve the v0.2 crossfade and synchronized transport behaviour.

### 9.4 Signed URL lifetime and refresh

A signed playback URL is a temporary bearer credential. The initial target TTL is five minutes, configurable by server configuration with a strict upper bound. Do not use the provider's maximum possible expiry as the default.

The client must not assume one URL lasts forever. Implement a small refresh path that:

1. Receives `expiresAt` with each URL.
2. Refreshes the URL before expiry when the page remains active long enough to need it, or when an expired/unauthorized media request is detected.
3. Preserves canonical playhead time, play/pause state, active A/B selection, volume and crossfade state.
4. Handles a failed refresh with a clear, recoverable player state.
5. Prevents multiple concurrent refreshes for the same asset role.
6. Does not loop endlessly on repeated 401/403/5xx responses.
7. Reuses the existing audio controller rather than adding a second independent transport implementation.

Presigned URLs cannot be revoked after issuance. A revoked share token must fail the next Worker authorization request; an already issued URL may remain usable until its short expiry. Document and test this bounded limitation.

### 9.5 Audio source integrity

- Do not transcode, normalize, modify, recompress or rewrite uploaded audio bytes.
- Preserve the current supported-format and codec error handling.
- Do not assume an extension proves the codec.
- Do not decode the entire file into an `AudioBuffer` for normal remote playback.
- Handle media load, CORS, range, metadata and network errors separately where possible.

### 9.6 Player behaviour on the review page

The review page uses the existing synchronized A/B player, not a simplified new player.

Required:

- Original/Edited labels are clear and consistent with the creator's project labels.
- One canonical timeline and playhead.
- Play/pause and seek.
- Immediate A/B selection state plus the existing audio crossfade.
- Current time and duration.
- Loading indicators for each asset and overall player readiness.
- Correct handling when one asset is slower or fails.
- No autoplay with sound; the user must initiate playback.
- Mobile/touch and keyboard operation.

Do not add waveform or speed-control work unless it already exists and is needed for parity. Do not modify the audio engine beyond what is required to load temporary remote sources and refresh them safely.

---

## 10. Client review page specification

### 10.1 Route and layout

Use the existing router. Add a dedicated review route that accepts the share token from the URL. Keep the route opaque and avoid placing project IDs or internal storage details in the path.

The page should contain:

1. A restrained Switchroom identity/wordmark.
2. Project title.
3. Optional project description.
4. The A/B player as the primary visual focus.
5. Original and Edited version labels.
6. Project/link expiry notice only when useful to the client.
7. A small, unobtrusive access/unavailable state area.

Do not display creator dashboard navigation, owner settings, storage meters, upload controls, edit actions, account requirements, participant data or future feedback/download controls.

### 10.2 Visual direction

Follow the existing design system and product direction from the companion plan:

- Premium minimal / experimental editorial feel.
- Strong typographic hierarchy and deliberate whitespace.
- Deep charcoal and restrained signal accent in dark mode.
- Warm off-white and graphite in light mode.
- Functional, legible A/B selection states.
- Subtle transitions; no heavy animated backdrop.
- System theme by default, respecting the existing manual theme override where applicable.
- Responsive layout from narrow phones through desktop.

Do not redesign unrelated landing or dashboard screens as part of this milestone.

### 10.3 Loading states

Provide meaningful states for:

- Resolving a share link.
- Password required.
- Verifying password.
- Loading Original metadata/source.
- Loading Edited metadata/source.
- Player ready.
- Refreshing an expiring playback URL.
- Recoverable playback/network failure.

Never show a fake percentage for an operation without measurable progress.

### 10.4 Unavailable states

Design distinct but privacy-safe screens for:

- Invalid/unrecognized link.
- Revoked link.
- Expired link.
- Expired project.
- Private project opened without a valid invite.
- Password-required link.
- Password attempt throttled.
- Project asset not ready or missing.
- Temporary playback/storage service problem.

Do not expose private project title or description before successful authorization and password verification. For security-sensitive cases, generic copy such as “This review link is no longer available” is preferable to revealing internal state.

### 10.5 Accessibility

- All player controls have accessible names and state announcements.
- A/B state is not communicated by colour alone.
- Keyboard focus is visible and follows logical order.
- Touch targets are usable on mobile.
- Modals trap focus correctly and restore focus when closed.
- Errors are announced without repeatedly interrupting screen readers.
- Respect `prefers-reduced-motion`.
- Maintain contrast in both themes.

---

## 11. Creator sharing interface

### 11.1 Entry point

Add a clear **Share** action to the existing cloud-project owner surface. Do not add sharing to a local-only workspace because v0.6 sharing requires a cloud project with ready server-side assets.

If the project is not eligible, disable the share action with an explanation and a path to resolve the missing/unfinished asset state.

### 11.2 Share dialog contents

The share interface should make these settings understandable without exposing implementation jargon:

- Visibility: Public / Unlisted / Private.
- Public indexing: explicit opt-in shown only for Public.
- Password protection: only when the password release gate passes.
- Link expiry: optional link-specific expiry, capped by project expiry.
- Primary link: create, copy and rotate for Public/Unlisted.
- Invite links: create, label, expiry, copy and revoke for Private.
- Active/expired/revoked status.
- Client permissions: retain existing feedback/download flags and clearly communicate that these actions are not yet available in v0.6. Do not imply they are functional in the client page.

Avoid a cluttered settings panel. Use progressive disclosure for password and invite details.

### 11.3 Copy-link behaviour

- Copy only after the server has successfully created or rotated the link.
- Copy the complete, canonical application URL.
- Provide visible, accessible confirmation.
- Handle clipboard API denial/failure with a selectable text fallback.
- Never construct the token from project IDs or client-side random values.
- The server returns the raw token URL once; the UI must not claim the link was copied before the clipboard operation succeeds.

### 11.4 Link list

For each invite/primary link show:

- Friendly label or mode.
- Scope: Listening.
- Created date.
- Expiry date or “Until project expiry”.
- Status: Active / Expired / Revoked.
- Copy action only when the raw URL is still held in the immediate creation flow; otherwise show a rotate/create action, not a fabricated URL.
- Revoke action for active links.

A token cannot be reconstructed after reload because only its hash is stored. This is intentional.

### 11.5 Confirmation and destructive actions

- Confirm link revocation.
- Explain that new access will be blocked after revocation, while already-issued temporary playback URLs may continue until their short expiry.
- Show saved/unsaved settings state.
- Prevent accidental public publication by making visibility changes explicit.
- When changing a Private project to Public or Unlisted, require an explicit create-link action before presenting a usable link.

---

## 12. Access lifecycle: end-to-end behaviour

### 12.1 Creator creates a share link

1. Creator opens an eligible cloud project.
2. Frontend calls the existing owner-authorized project endpoint to validate current state, or requests link creation directly and handles server validation.
3. Creator selects visibility and, where relevant, expiry/password settings.
4. Frontend submits the change to the Worker.
5. Worker verifies owner authority, project eligibility and valid settings.
6. Worker creates/rotates the link, stores only the token hash and returns the raw URL once.
7. Frontend displays the URL and offers copy.
8. The public app remains functional if link creation fails; show a real error and do not display an invented link.

### 12.2 Client opens a link

1. Browser loads the review route.
2. The review page calls the share access endpoint.
3. Worker validates the token, link, project, project expiry, asset readiness and password state.
4. If a password is required, show only the password gate.
5. After successful access, Worker returns safe project metadata/capabilities.
6. Client page requests short-lived playback URLs for Original and Edited.
7. Worker repeats authorization checks and returns signed URLs for the exact ready assets.
8. Player loads remote sources and initializes Web Audio only when permitted by browser autoplay rules/user gesture.
9. Client can play, seek and switch versions.

### 12.3 Client returns later

- The client can open the same link while it remains valid.
- No client account is necessary.
- If the URL has expired or been revoked, show the correct unavailable state.
- If the project expired, access is denied even when the share link itself has no expiry.
- Never rely on cached client-side project metadata as proof of continued access.

### 12.4 Creator revokes a link

1. Owner opens link management.
2. Owner confirms revocation.
3. Worker verifies ownership and link association.
4. Worker commits `revoked_at`.
5. New access requests and playback URL requests fail.
6. Existing presigned URLs may remain usable until their short expiration; explain this accurately.
7. The creator's link list reflects the revoked status.

### 12.5 Client switches audio versions

The existing transport controller remains canonical. Do not create one player state for Original and a second for Edited.

- One canonical playhead controls both decks.
- Before switching, the target deck must be seeked/ready at the canonical timestamp.
- Use the existing gain-node crossfade.
- Temporary URL refresh must preserve the active role, canonical time and playback state.
- A/B switching must not reset the timeline or reveal storage URLs to the UI.

---

## 13. Failure handling and resilience

### 13.1 Expected failures

The implementation must handle at least:

- Malformed/unknown token.
- Link revoked between page load and playback URL request.
- Link expires while page is open.
- Project expires while page is open.
- Project deleted while page is open.
- Password grant expires.
- Password attempt rate limit reached.
- Missing or non-ready Original asset.
- Missing or non-ready Edited asset.
- R2 signer unavailable.
- R2 object missing.
- R2 returns an authorization/expiry error.
- CORS failure.
- Range/seek failure.
- Browser autoplay restriction.
- Network disconnect/reconnect.
- Clipboard permission denied.
- Owner loses session or guest-owner capability.
- Duplicate create/revoke request.

### 13.2 Retry rules

- Retry only operations that are safe and idempotent, or provide a request/idempotency key where duplicate creation is possible.
- Do not automatically retry password verification without user intent.
- Do not retry a revoked or expired link.
- Do not loop indefinitely on signed URL refresh.
- For transient R2/Worker errors, show a recoverable message and a deliberate retry action.
- Preserve player time and selected version when a media source refresh is attempted.

### 13.3 Error logging

Log only safe diagnostic context:

- Correlation/request ID.
- Route name and safe error code.
- Operation phase.
- Non-sensitive latency/duration metrics.
- A non-reversible internal project reference only if existing policy permits it.

Never log:

- Raw share tokens or complete share URLs.
- Token hashes.
- Passwords or password hashes.
- Password grant cookies.
- Owner capability values.
- Signed R2 URLs.
- Audio data or private file contents.

---

## 14. Implementation sequence

Work in small vertical slices. Do not build every screen before the underlying access rules work.

### Phase 0 — Baseline and design confirmation

- [ ] Inspect v0.5 repository and deployed state.
- [ ] Run existing tests/build and record baseline failures.
- [ ] Trace owner and guest-owner authorization.
- [ ] Trace upload finalization and asset-ready state.
- [ ] Trace player remote-source integration points.
- [ ] Inspect current D1 schema and existing `share_links` usage.
- [ ] Confirm the current R2 signing helper and CORS setup.
- [ ] Produce a short technical plan with only unresolved implementation decisions.

**Exit gate:** The agent can explain the existing data and authorization paths without creating duplicate infrastructure.

### Phase 1 — Link model and authorization services

- [ ] Add the smallest necessary D1 migration.
- [ ] Implement token generation, digesting and lookup.
- [ ] Implement primary/invite link invariants.
- [ ] Reuse owner authorization for create/list/revoke/settings.
- [ ] Implement a single share-access resolver service.
- [ ] Implement server-side project/link expiry, revocation and asset-ready checks.
- [ ] Add unit tests for link/token and access rules.

**Exit gate:** Access decisions are correct in Worker tests before UI work depends on them.

### Phase 2 — Owner sharing API and UI

- [ ] Implement safe link listing.
- [ ] Implement primary link creation/rotation.
- [ ] Implement private invite creation.
- [ ] Implement revocation.
- [ ] Implement visibility/indexing settings.
- [ ] Implement password protection only if the security gate passes.
- [ ] Add the share dialog to the existing cloud project surface.
- [ ] Verify copy-link and failure states.

**Exit gate:** An owner can create, copy, view and revoke a real link; the database never stores its raw token.

### Phase 3 — Guest access and playback URL API

- [ ] Implement `/api/share/:token/access`.
- [ ] Implement password gate flow if enabled.
- [ ] Implement `/api/share/:token/playback/:role`.
- [ ] Sign only the exact Original/Edited R2 object.
- [ ] Set short URL expiry and no-store response headers.
- [ ] Configure exact-origin R2 playback CORS.
- [ ] Add tests for revoked/expired/private/password and wrong-role requests.

**Exit gate:** A guest can obtain playback URLs only through a valid listening capability.

### Phase 4 — Client review page and existing player integration

- [ ] Add the client review route.
- [ ] Implement clean loading/password/unavailable states.
- [ ] Load only safe project metadata after authorization.
- [ ] Integrate remote sources into the existing A/B transport controller.
- [ ] Preserve crossfade and canonical playhead behaviour.
- [ ] Implement signed URL refresh and error recovery.
- [ ] Add responsive layout, theme and accessibility checks.

**Exit gate:** A client with a valid link can listen and seek through both versions on supported desktop and mobile browsers without signing in.

### Phase 5 — End-to-end security and regression

- [ ] Test owner and guest-owner paths.
- [ ] Test IDOR and scope isolation.
- [ ] Test link rotation/revocation and expiry boundaries.
- [ ] Test private project isolation.
- [ ] Test password gate, throttling and grant expiry if enabled.
- [ ] Test R2 signed URLs and range seeking.
- [ ] Test existing v0.1–v0.5 workflows.
- [ ] Check headers, logs, source maps and bundles for secret leakage.
- [ ] Check desktop/mobile, dark/light/system and reduced motion.

**Exit gate:** No critical/high security defects remain in the v0.6 attack surface and all acceptance criteria pass.

### Phase 6 — Release candidate and deployment

- [ ] Update README/docs for v0.6 behaviour and limitations.
- [ ] Update changelog.
- [ ] Run formatter, lint, type-check, tests, integration tests and production build.
- [ ] Apply migration to staging/test database.
- [ ] Deploy preview and complete manual smoke tests.
- [ ] Deploy production only after all gates pass.
- [ ] Verify public client review flow against the deployed R2 bucket.
- [ ] Create `v0.6.0` tag and release only after production verification.

**Exit gate:** Deployed v0.6 works and the release report contains evidence, not assumptions.

---

## 15. Test plan

### 15.1 Token and link model unit tests

- Token generation uses cryptographically secure randomness.
- Token length/entropy and URL-safe encoding meet requirements.
- Only a digest is stored.
- Raw token is returned only on creation/rotation.
- Token digest lookup resolves exactly one link.
- Malformed tokens are rejected before expensive database operations.
- Primary link uniqueness holds under repeated/competing requests.
- Private projects cannot create or use primary links.
- Invite links remain bound to exactly one project.
- Scope values outside the v0.6 allowlist are rejected.
- Revocation is idempotent.
- Expiry boundary is correct at `now >= expires_at`.
- Link expiry cannot exceed project expiry.

### 15.2 Authorization and API tests

- Owner can list/create/revoke links for owned projects.
- Authenticated non-owner cannot manage another project.
- Guest owner can manage only projects covered by the existing owner capability.
- Client link cannot access owner-management routes.
- Client link cannot access another project.
- Public primary link works only when the project is public.
- Unlisted primary link works by token and is noindex.
- Private project rejects public/unlisted primary access.
- Valid invite grants listening only for its project.
- Revoked invite fails immediately on the next Worker access check.
- Expired invite fails immediately on the next Worker access check.
- Expired project blocks access even when the link has not expired.
- Deleted project blocks access.
- Non-ready or missing assets block playback URL issuance.
- Only `original` and `edited` roles are accepted.
- The requested role resolves to the correct asset object key.
- No API response leaks object keys, bucket names, token hashes or owner capabilities.

### 15.3 Password tests (only if enabled)

- No plaintext password is stored.
- Password hash is not returned by any API.
- Correct password issues a scoped grant.
- Incorrect password does not issue a grant.
- Grant is bound to the project/link and expires.
- Revocation/project expiry/password change invalidates access.
- Attempts are throttled.
- Responses do not reveal project existence.
- Hashing cost meets security guidance and Worker runtime budget.
- CPU/memory benchmarks run against production-like Worker settings.
- Password and grant values never appear in logs or telemetry.

### 15.4 R2 and playback tests

- R2 bucket cannot be accessed publicly without a signed URL.
- Signed URL is scoped to one expected object and GET operation.
- Signed URL expiry is no longer than the configured v0.6 maximum.
- Playback URL is issued only after fresh authorization.
- Signed URL is not stored in D1.
- R2 CORS accepts only expected origin(s).
- Browser can load Original and Edited through CORS.
- Range requests work for seek operations.
- Browser can seek near the start, midpoint and end.
- Crossfade continues to work with remote media.
- URL refresh preserves time, play state, active version and volume.
- URL refresh cannot loop indefinitely.
- Revoked link cannot obtain another signed URL.
- Previously issued URL limitation is tested/documented until expiry.

### 15.5 UI and accessibility tests

- Share action appears only for eligible cloud projects.
- Local-only project does not show a working share flow.
- Share dialog displays current visibility and link states.
- Public indexing toggle appears only for Public.
- Private mode supports invite creation and revocation.
- Copy action works and confirms success accurately.
- Clipboard failure provides a usable fallback.
- Revoke requires confirmation and updates the UI.
- Client review page contains no creator controls.
- Client can listen without signing in.
- No inert feedback or download controls appear.
- Invalid/expired/revoked/password-required states render correctly.
- Keyboard-only operation works.
- Screen-reader labels and state announcements work.
- Dark, light and system theme work.
- Mobile layout and touch targets work.
- Reduced-motion preference is respected.

### 15.6 Regression tests

Re-run critical existing tests for:

- Local A/B comparison.
- Two-deck synchronization.
- Crossfade and rapid switching.
- Seek, pause and resume.
- Local file compatibility and error handling.
- Local workspace workflows.
- Authenticated cloud project list/create/edit/delete.
- Guest owner recovery.
- Direct-to-R2 upload, finalize and cancellation.
- Existing project retention metadata handling.

Do not accept a v0.6 change that breaks an existing local comparison workflow.

### 15.7 Manual browser matrix

At minimum verify current stable versions of:

| Browser         | Required v0.6 checks                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| Chrome desktop  | Valid link, both tracks, range seek, crossfade, refresh, revoked/expired screens.          |
| Edge desktop    | Same as Chrome; Windows audio device/background-tab behaviour.                             |
| Firefox desktop | R2 CORS, media seeking, Web Audio graph and codec handling.                                |
| Safari macOS    | AudioContext user gesture, signed URL, CORS, seek and A/B switching.                       |
| Safari iOS      | Touch layout, audio unlock, link/password flow, seeking and interruption/resume behaviour. |
| Chrome Android  | Link flow, both assets, seek, crossfade, layout and network interruption.                  |

Record real pass/fail outcomes. “Should work” is not test evidence.

---

## 16. Security review checklist

Before release, verify every item:

- [ ] R2 bucket remains private.
- [ ] Browser never receives R2 credentials or D1 credentials.
- [ ] Share tokens contain at least 256 bits of cryptographically secure randomness.
- [ ] Only token digests are stored.
- [ ] Raw tokens are not logged or returned after initial creation.
- [ ] Owner, guest-owner, share and password-grant capabilities are independent.
- [ ] Every access and playback URL request rechecks link/project state.
- [ ] Project expiry is checked even if link expiry is null.
- [ ] Revocation blocks new playback URL issuance.
- [ ] Existing presigned URL revocation limitation is explicitly documented.
- [ ] Signed GET URLs are short-lived and object-scoped.
- [ ] Signed URLs are not logged, persisted or used as share links.
- [ ] Requested asset role is validated against the project.
- [ ] No client-supplied object key is accepted.
- [ ] Public, unlisted and private visibility rules are enforced on the Worker.
- [ ] Private projects require valid invite links.
- [ ] Passwords, if enabled, use a reviewed adaptive password hash.
- [ ] Password attempt throttling exists before password mode is enabled.
- [ ] Password verification grants are scoped, short-lived and HttpOnly.
- [ ] Share/review responses have appropriate cache and referrer policies.
- [ ] Unlisted/private/password-protected links are noindex.
- [ ] Public indexing requires explicit owner opt-in.
- [ ] Same-origin/CSRF protection is applied to state-changing routes.
- [ ] R2 CORS does not use wildcard production origins.
- [ ] No token, password, grant, owner secret, signed URL or audio data enters logs.
- [ ] No critical/high v0.6 authorization or access-control defect remains open.

---

## 17. Performance and implementation efficiency

### 17.1 Worker cost discipline

- Keep access handlers small and bounded.
- Use indexed lookups for token hashes, project IDs, link status and expiry.
- Do not decode or transcode audio in the Worker.
- Do not proxy full audio through Worker memory when direct presigned GET delivery is available.
- Do not fetch R2 objects merely to revalidate every playback request if D1 state and asset metadata are sufficient; verify existence during the established upload-finalization lifecycle and handle missing objects as a playback failure.
- Avoid writing `last_used_at` on every range request; playback bytes are served directly from R2 and should not create a database write per media chunk.
- Keep password hash verification behind rate limits and benchmark it against the actual Worker CPU/memory allowance.

### 17.2 Frontend efficiency

- Reuse the current player and design system.
- Do not rerender the entire review page on every `timeupdate` event.
- Keep audio transport state outside broad page state where the current architecture allows.
- Keep share-token handling isolated from unrelated analytics/state stores.
- Do not persist raw token, password or signed URL in localStorage/IndexedDB.
- Lazy-load only genuinely optional code; do not add a large framework for one page.
- Avoid third-party scripts on token-bearing routes.

### 17.3 Scope efficiency

- Implement the smallest complete client review experience.
- Avoid refactoring stable v0.5 modules unless required by a demonstrated defect.
- Avoid speculative abstractions for unimplemented future scopes.
- Do not create empty modules/folders for v0.7–v1.0.
- Make each phase testable before proceeding to the next.

---

## 18. Documentation and repository changes

Update only documentation affected by v0.6. Likely documents include:

- `README.md`: describe shareable client review and guest listening.
- `docs/architecture.md`: document share token resolution and temporary playback URL path.
- `docs/security.md`: document token storage, owner/client capability separation, password gate (if enabled), noindex and revocation limits.
- `docs/storage-and-retention.md`: clarify project expiry blocks access immediately but physical deletion is a later milestone.
- `docs/browser-support.md`: document any remote playback/CORS limitations discovered.
- `CHANGELOG.md`: list v0.6 additions and limitations.

Do not write v0.8 download or v0.9 cleanup documentation as though those features now exist.

Include in the README or release notes:

- Clients do not need accounts to listen.
- Share links are bearer links and should be sent only to intended recipients for unlisted/private projects.
- Private invite links can expire or be revoked.
- Already-issued temporary playback URLs may remain valid briefly after link revocation.
- Project expiry disables access; automatic object deletion is not part of v0.6.
- Feedback and downloads are not active v0.6 features.
- Password protection is available only if it passed the release security gate.

---

## 19. Deployment and release procedure

### 19.1 Environment configuration

Inspect existing names and conventions first. Do not rename existing environment variables without a migration plan.

The deployed Worker may require existing bindings/secrets for:

- D1 database.
- Private R2 bucket.
- R2 account/access key credentials for presigning, if using the S3-compatible signer.
- Better Auth/session secrets.
- Allowed application origin(s).
- Password grant signing/encryption secret, only if required by the selected secure design.
- Password-hash configuration, only if used and not compiled into insecure defaults.

Keep all secrets out of `.env.example`; list variable names with safe placeholders only. Do not print their values during diagnostics.

### 19.2 Staging-first checks

- Apply migration to a non-production D1 database.
- Configure a private test R2 bucket or dedicated test prefix/bucket.
- Configure exact-origin CORS for the preview origin.
- Test owner share creation, client listening, revocation and expiry.
- Test the production-like Worker runtime, not only Node-based unit tests.
- Never run destructive tests against real client projects.

### 19.3 Production rollout

1. Confirm CI is green.
2. Confirm migration compatibility and backup/recovery approach.
3. Apply the additive D1 migration.
4. Deploy Worker/static assets from the approved branch.
5. Verify the production R2 CORS policy.
6. Smoke-test one controlled test project with synthetic/public-domain audio.
7. Verify no private bucket access is possible without a valid signed URL.
8. Verify revocation, expiry and noindex behaviour on the live deployment.
9. Confirm local comparison and v0.5 owner workflows still work.
10. Only then tag `v0.6.0` and publish release notes.

Do not enable provider billing or paid services as a side effect of deployment. Do not claim unlimited free hosting.

---

## 20. v0.6.0 acceptance gate

The milestone is complete only when all mandatory criteria pass.

### Functional acceptance

- [ ] Eligible cloud project can be shared by its owner.
- [ ] Public primary link works.
- [ ] Unlisted primary link works and is noindex.
- [ ] Private project requires a valid invite link.
- [ ] Multiple invite links can be created for a private project.
- [ ] Each invite can expire independently and be revoked independently.
- [ ] Project expiry blocks all links.
- [ ] Link expiry blocks only the affected link.
- [ ] Link rotation invalidates the old primary link.
- [ ] Password protection is enabled only if the password release gate passes; otherwise it is explicitly disabled.
- [ ] Guest can listen without signing in.
- [ ] Guest can switch Original/Edited while preserving the playhead and crossfade.
- [ ] Guest can seek through remote audio on target browsers.
- [ ] Review page exposes no owner-management functionality.
- [ ] No comment, vote or download UI/API has been added.

### Security acceptance

- [ ] Server authorization is authoritative for all protected operations.
- [ ] Raw share tokens are never stored or logged.
- [ ] Guest share tokens cannot manage projects.
- [ ] Signed playback URLs are short-lived and restricted to one object.
- [ ] Revoked/expired links cannot obtain new playback URLs.
- [ ] Private/unlisted pages have correct noindex/referrer/cache headers.
- [ ] R2 bucket remains private and CORS is restricted.
- [ ] No high/critical v0.6 access-control findings remain.

### Quality acceptance

- [ ] Existing v0.1–v0.5 regression tests pass.
- [ ] New unit, integration and UI tests pass.
- [ ] Formatter, lint and type-check pass.
- [ ] Production build passes from a clean checkout.
- [ ] Desktop and mobile smoke tests pass.
- [ ] Dark/light/system theme and reduced-motion behaviour pass.
- [ ] Documentation and changelog are updated.
- [ ] Production deployment is verified.
- [ ] `v0.6.0` tag/release is created only after verification.

A single unchecked mandatory criterion means the release is not complete. Record any intentionally disabled password feature as a known limitation, not a pass.

---

## 21. Required final report from the AI agent

At the end of the task, provide a concise but evidence-based report using this structure:

### Release result

- Target: `v0.6.0`
- Status: Complete / Blocked / Partially complete
- Deployed URL:
- Git commit:
- Release tag:

### Implemented

- Client review page:
- Public/unlisted/private links:
- Invite expiry/revocation:
- Password protection: Enabled / Disabled with reason
- Temporary playback URL flow:
- R2 CORS and headers:
- UI/accessibility:

### Verification

- Commands run:
- Unit tests:
- Integration tests:
- E2E/manual browser tests:
- Production build:
- Deployment smoke test:
- Security review result:

### Scope confirmation

Explicitly confirm that these were **not** implemented:

- v0.7 votes/comments/replies.
- v0.8 downloads/multipart uploads.
- v0.9 scheduled deletion/cleanup milestone.

### Known limitations and risks

List only verified limitations. Include the presigned URL revocation window and password gate status where applicable.

### Evidence

Link to relevant commits, PRs, test output, deployment and release notes. Do not claim success without evidence.

---

## 22. Reference material

Use current official documentation at implementation time. The links below inform this specification; APIs and limits may change.

### Project source

- `Switchroom_Open_Source_Audio_Review_Plan.md` — product definition, v0.5 foundation, architecture, data model, API map, v0.6 roadmap entry and release protocol.

### Cloudflare R2 and Workers

- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — temporary S3-compatible object access; verify current expiry and signing behaviour.
- [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/) — exact allowed origins, methods, headers and exposed headers.
- [R2 Workers API: ranged reads](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) — R2 range support when using Worker bindings.
- [Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/) — static asset response header configuration; Worker-generated responses may need headers set in Worker code.
- [Cloudflare Worker limits](https://developers.cloudflare.com/workers/platform/limits/) — confirm CPU and memory constraints before selecting password hashing or other expensive operations.

### Password security

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — adaptive password hashing guidance and minimum configurations. Benchmark the selected approach in the target Worker runtime.

### Browser audio

- [MDN: `HTMLMediaElement.canPlayType()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType)
- [MDN: MediaElementAudioSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource)
- [MDN: `HTMLMediaElement.crossOrigin`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/crossOrigin)
- [MDN: `<audio>` element and `crossorigin`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/audio)
- [MDN: HTTP Range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)

---

## Final instruction

Build **v0.6.0 and nothing beyond it**. Deliver a secure, polished, working client review experience on top of the existing v0.5 application. Preserve every working earlier feature. Keep the R2 bucket private, enforce every access decision on the Worker, use short-lived playback URLs, and test the complete flow in real browsers. Stop at the v0.6 acceptance gate. Do not continue into v0.7, v0.8, v0.9 or v1.0 work.
