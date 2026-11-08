# Deployment

Switchroom deploys as a static single-page app on Cloudflare Workers Static Assets. There is no server-side API, database, R2 bucket or Worker entry point.

## Current deployment

The v0.1.0 release is deployed at <https://switchroom.ftallfettah.workers.dev> (Worker name `switchroom`) and was smoke-tested against that URL on 2026-11-08. The remaining instructions describe how to reproduce or update that deployment.

## Prerequisites

- A Cloudflare account with Workers enabled.
- Node.js 22.12+ and `npm ci` completed.
- Access to the Cloudflare account that should own the `switchroom` Worker.
- For CI deployment only: repository secrets managed by GitHub, never committed files.

## Authenticate Wrangler

Interactive, recommended for a workstation:

```bash
npx wrangler login
```

This opens a browser and stores a local OAuth session outside the repository. Verify:

```bash
npx wrangler whoami
```

If the command reports that you are not authenticated, complete the browser login before deploying. Do not paste tokens into chat, source files or `.env` files.

For a non-interactive environment, create a scoped Cloudflare API token and provide it through the environment that runs Wrangler:

```bash
export CLOUDFLARE_API_TOKEN="..."   # macOS/Linux
$env:CLOUDFLARE_API_TOKEN = '...'  # PowerShell
```

The token needs permission to edit Workers scripts for the target account. Wrangler can usually derive the account from the token; set `CLOUDFLARE_ACCOUNT_ID` explicitly if it cannot.

## Build and preview

```bash
npm run build
npm run preview
```

The Cloudflare Vite plugin builds the client into `dist/` and runs the preview through the Workers runtime. Open the printed URL (default `http://localhost:4173`).

Run the automated smoke check against it:

```bash
npm run smoke
```

## Deploy

```bash
npm run deploy
```

That runs the production build and `wrangler deploy`. Wrangler prints the deployed URL, normally:

```text
https://switchroom.<your-workers-subdomain>.workers.dev
```

The same URL appears in the Cloudflare dashboard under **Workers & Pages → switchroom**. If the Worker name is already taken in the account, change `name` in [`wrangler.jsonc`](../wrangler.jsonc) before deploying.

### Why the SPA fallback matters

[`wrangler.jsonc`](../wrangler.jsonc) sets:

```jsonc
"assets": {
  "not_found_handling": "single-page-application",
},
```

A direct visit to any non-asset path returns `index.html`, so client-side routing and refreshes do not produce 404s. v0.1 has a single page, but the setting keeps the deployment correct as the app grows.

## Post-deploy smoke test

Against the public URL:

```bash
# macOS / Linux
SMOKE_URL=https://switchroom.<subdomain>.workers.dev npm run smoke

# PowerShell
$env:SMOKE_URL = 'https://switchroom.<subdomain>.workers.dev'; npm run smoke
```

The smoke script drives Chromium against the deployed build. It verifies:

- the production page title and visible privacy statement;
- that the development engine hook is absent;
- that Play is disabled with no files;
- that two local WAV files reach ready, with the correct duration;
- that playback advances, switches to Edited without resetting, and pauses correctly;
- that there are no console or page errors.

Then complete a real browser pass: load two files, listen through the transition, test pause/resume during playback, replace and remove files, change themes, and check a 360 px viewport. The automated smoke check cannot prove audible quality.

## CI

[`ci.yml`](../.github/workflows/ci.yml) runs format, lint, type-check, unit tests, Chromium Playwright tests and the production build on pushes and pull requests. It does **not** deploy and never receives Cloudflare credentials.

Deployment is intentionally manual until Cloudflare credentials are available as repository secrets. When they are:

1. In GitHub, open **Settings → Secrets and variables → Actions**.
2. Add `CLOUDFLARE_API_TOKEN` with permission to edit Workers scripts for the account.
3. Add `CLOUDFLARE_ACCOUNT_ID` (the account ID, not a secret value that belongs in source).
4. Add a protected `production` environment if the repository should require approval.
5. Add a deployment job that runs only on the protected main branch, after all checks pass.

An example job body, if a workflow is added later:

```yaml
- run: npm ci
- run: npm run build
- uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: deploy
```

This snippet is documentation, not a committed workflow. Do not add it until the secrets exist and the repository's branch protection is configured.

## Rollback

- Cloudflare dashboard: **Workers & Pages → switchroom → Deployments**, then redeploy an earlier version.
- Or run `npx wrangler rollback` from an authenticated workstation.
- Rolling back the Worker does not move the Git tag; fix forward or publish a new patch tag as appropriate.

## Custom domain (optional)

Add a custom domain in the Cloudflare dashboard under the Worker's **Settings → Domains & Routes**, or configure a route in Wrangler. HTTPS is provisioned by Cloudflare. Update the README and smoke-test URL when a custom domain becomes the canonical address.

## Release checklist

Perform in order:

1. `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` all pass.
2. `npm run build` passes from a clean checkout.
3. `npm run preview` and `npm run smoke` pass against the Workers runtime.
4. A human listening pass is completed and recorded in [browser-support.md](browser-support.md).
5. `npm run deploy` succeeds and the public URL is recorded.
6. `SMOKE_URL=<public URL> npm run smoke` passes.
7. The public URL is checked in a real desktop browser.
8. Only then: commit, push, create tag `v0.1.0` and publish GitHub release notes.

Never describe the release as deployed before steps 5–7 have actually passed.
