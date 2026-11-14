# Switchroom Cloud Architecture (v0.5.0)

> **Release Theme:** Private cloud projects and optional creator accounts, without breaking the local-first audio comparison experience.

---

## 1. Architectural Overview

Switchroom v0.5.0 adds private cloud persistence and optional creator accounts while preserving 100% offline, zero-network local comparison.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Creator Browser Client                          │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │ Local Comparison      │             │ Private Cloud Projects     │  │
│  │ (100% Offline / Local)│             │ (Save to Cloud, Dashboard) │  │
│  └───────────────────────┘             └─────────────┬──────────────┘  │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                      Direct Audio Upload              │ API Requests / Metadata
                     (Presigned PUT / SigV4)           │ (Same-Origin JSON / Cookies)
                               │                       │
                               ▼                       ▼
                   ┌───────────────────────┐   ┌───────────────────────────┐
                   │ Cloudflare R2 Storage │   │ Cloudflare Worker (Hono)  │
                   │ (Private Audio Bucket)│   └─────────────┬─────────────┘
                   └───────────▲───────────┘                 │
                               │                             ▼
                               │                    ┌──────────────────────┐
                               └─ HEAD Check ───────┤ Cloudflare D1 (D1/DB)│
                                  (Verification)    │ (Projects & Auth DB) │
                                                    └──────────────────────┘
```

---

## 2. Security & Trust Boundaries

1. **Browser is Untrusted:** The client requests actions but cannot authorize itself.
2. **Zero Audio Proxying:** Audio bytes NEVER pass through the Cloudflare Worker. The browser uploads directly to private R2 storage using short-lived S3 SigV4 presigned PUT URLs (`aws4fetch`).
3. **Private Storage:** The R2 bucket is completely private (no public bucket access, no public custom domains).
4. **Server-Side Verification:** After browser PUT completion, the Worker performs an authoritative R2 `HEAD` check verifying existence, exact byte size, and MIME family before marking assets `ready`.
5. **D1 Metadata Only:** D1 stores project/asset metadata and cryptographic capability hashes—never audio binary payloads or raw credentials.

---

## 3. Creator Ownership & Guest Mode

### 3.1 Authenticated Creators (Better Auth)

- Integrated with Cloudflare D1 via Better Auth SQLite/D1 adapter.
- Optional OAuth providers: GitHub and Google.
- If provider credentials are not configured in environment variables, OAuth buttons are automatically omitted, preserving seamless guest mode.
- Server-side session verification on all protected `/api/projects/*` and `/api/uploads/*` endpoints.

### 3.2 Guest Creator Capability Model

- A guest creator requires no login, no password, and no account setup.
- Upon project creation, the server generates a high-entropy 256-bit cryptographic capability secret: `sw_owner_<64-hex-chars>`.
- **Database Storage:** Only the SHA-256 hash (`owner_capability_hash`) is stored in D1. The raw secret is never stored in the database.
- **Recovery Link:** The client receives a one-time owner recovery link with a URL fragment:
  `https://switchroom.app/#owner=sw_owner_<hex>&project=<id>`
  - Using a URL fragment (`#`) guarantees the capability secret is never sent in HTTP request lines or browser `Referer` headers.
  - On page load, the browser extracts the fragment, exchanges it with `POST /api/projects/:id/owner-access`, sets an `HttpOnly`, `SameSite=Lax` cookie (`sw_owner_<id>`), and immediately strips the secret from the address bar via `history.replaceState`.
- **Local Index:** Guest projects are tracked locally in `localStorage` under `sw_guest_projects` with display metadata only (ID, title, timestamp). Raw capability secrets are NEVER written to `localStorage`.

---

## 4. Quotas and Retention Policy

| Policy                         | Value                                        | Enforcement                                                     |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| **Max Audio File Size**        | **100 MB** (104,857,600 bytes)               | Client preflight + Server upload session + R2 HEAD verification |
| **Signed-in Account Quota**    | 20 active projects / 2 GB total              | D1 row count & storage aggregation                              |
| **Guest Creator Quota**        | 3 active projects / 300 MB total             | D1 row count & local tracking                                   |
| **Upload Presigned PUT TTL**   | 30 minutes (1,800 seconds)                   | S3 SigV4 `X-Amz-Expires`                                        |
| **Playback Presigned GET TTL** | 1 hour (3,600 seconds)                       | S3 SigV4 `X-Amz-Expires`                                        |
| **Retention Presets**          | 1, 7, 14, 30, 60, 90 days (default: 30 days) | Derived `expires_at` timestamp with UI countdown                |

_Note: Scheduled background purging is scheduled for v0.9; v0.5 records the cutoff and enforces expiration on project access._

---

## 5. Environment Variables & Setup

### Cloudflare Worker Environment Variables:

```ini
# R2 Storage Credentials (for S3 SigV4 Presigning)
R2_ACCOUNT_ID="<your-cloudflare-account-id>"
R2_ACCESS_KEY_ID="<r2-s3-access-key-id>"
R2_SECRET_ACCESS_KEY="<r2-s3-secret-access-key>"
R2_BUCKET_NAME="switchroom-audio"

# Better Auth Configuration
BETTER_AUTH_SECRET="<random-32-char-secret>"
BETTER_AUTH_URL="https://switchroom.ftallfettah.workers.dev"

# Optional OAuth Providers (leave blank to run guest-only)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

### Initializing Cloudflare Resources:

1. **Enable R2:** Enable R2 in the Cloudflare Dashboard (Settings > R2).
2. **Create Bucket:** `npx wrangler r2 bucket create switchroom-audio`
3. **Create D1 Database:** `npx wrangler d1 create switchroom-db`
4. **Apply Migrations:** `npx wrangler d1 migrations apply switchroom-db --remote`

---

## 6. Scope Boundaries (Strict Compliance)

- **Included in v0.5.0:**
  - Full local comparison (100% offline, zero network required).
  - Explicit "Save to cloud" modal with progress and cancellation.
  - Guest capability recovery link (`#owner=...&project=...`).
  - Private creator dashboard with status pills and expiry countdown.
  - Owner-only audio playback streaming into `ABAudioEngine`.
- **Explicitly Excluded (Scheduled for v0.6–v0.9):**
  - NO client sharing (`/api/share/*`) or public links (v0.6).
  - NO comments, replies, or client preference votes (v0.7).
  - NO client download interface or multipart chunked upload (v0.8).
  - NO scheduled Cron purges or Turnstile bot gates (v0.9).
