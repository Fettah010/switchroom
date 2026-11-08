# Switchroom

**Hear the difference.** Switchroom is a local-first A/B audio player for comparing two versions of the same recording on one synchronized timeline. Load an Original and an Edited file, press Play, and switch between them mid-play through a real 180 ms Web Audio crossfade.

**Live:** <https://switchroom.ftallfettah.workers.dev>

Your audio never leaves the browser. There is no account, no upload, no backend storage and no analytics.

![Switchroom in the Light theme, with two loaded WAV files and the comparison player ready](docs/screenshots/desktop-light.png)

## Project status

v0.1.0 is publicly deployed at <https://switchroom.ftallfettah.workers.dev> and the automated suite passes. The manual listening pass was completed in Microsoft Edge on Windows 11 using WAV files; no clicks, pops, gaps, loudness jumps or dropouts were reported. Branded Safari, Chrome Android, Safari iOS and codecs other than WAV remain manually unverified. See [Browser support](docs/browser-support.md) for the exact matrix and release record.

## What v0.1 does

- Two independent local file slots: **Original (A)** and **Edited (B)**.
- WAV, MP3, FLAC, AAC and M4A files are accepted for local playback, subject to the browser's codecs.
- Shows file name, size, format and duration for each slot.
- One shared play/pause transport and one shared timeline that seeks both decks together.
- Audible **Original / Edited** switching while playback continues at the same point.
- A real 180 ms linear-amplitude Web Audio gain crossfade, not a visual-only toggle.
- Master volume and mute, independent of the selected version.
- When the files differ in length, the common (shorter) duration is used and an explanatory note appears.
- End-of-playback, replay, replace, remove and load-error states.
- System / Dark / Light themes, with the manual choice remembered across reloads.
- Responsive layouts from 360 px to 1440 px, keyboard-operable controls, visible focus and reduced-motion support.
- No waveforms, share links, accounts, comments or future-milestone placeholders.

## Privacy

**Local-only listening. Your audio stays in this browser. Switchroom does not upload or store your files.**

How that is enforced:

- Files are read through the browser's `File` API and played from in-memory object URLs.
- Nothing is sent to a server. The production build has no API, no account, no database and no analytics.
- Object URLs are revoked when a file is replaced, removed, fails to load, or the app is disposed.
- No file bytes or metadata are written to `localStorage`, `sessionStorage`, IndexedDB or Cache Storage.
- The only persisted value is the manual theme choice, under the key `switchroom.theme`.

## Supported files and codecs

Switchroom accepts `.wav`, `.mp3`, `.flac`, `.aac` and `.m4a` files. The extension gets the file to the browser's decoder; actual support depends on the browser and on the codec inside the container.

- WAV (PCM) and MP3 are the most broadly supported choices.
- FLAC support is good in current desktop Chromium and Firefox, but varies elsewhere.
- AAC and M4A support varies by platform. An `.m4a` file may contain codecs a given browser cannot decode.
- Switchroom never converts, transcodes or renames a file. If the browser cannot decode it, the affected slot shows a clear error and the other slot is unaffected.

## Browser support

Automated end-to-end checks pass in Playwright Chromium 158 and Firefox 159 on Windows 11, including file loading, playhead sync, A/B switching, gain automation, seeking, replace/remove, themes, keyboard access and reduced motion. Playwright WebKit 27.2 passes the UI and validation checks on Windows, but that build does not decode local audio in this environment, so its audio flows are skipped there.

Microsoft Edge on Windows 11 was used for the manual listening pass against the public deployment with WAV files. Branded Chrome, branded Safari, Chrome Android and Safari iOS have **not** been manually verified for this release. Playwright WebKit is not identical to branded Safari. See [docs/browser-support.md](docs/browser-support.md) for the exact matrix, limitations and the listening record.

## Prerequisites

- Node.js 22.12 or newer. CI uses Node 24 via `.nvmrc`.
- npm 11 or newer.

## Local development

```bash
npm ci
npm run dev
```

Vite prints the local URL (usually `http://localhost:5173`). The development server exposes `window.__switchroom.engine` for automated diagnostics; production builds do not.

### Build and preview the production bundle

```bash
npm run build
npm run preview
```

`vite preview` runs the built output through the Cloudflare Vite plugin, so it exercises the Workers Static Assets runtime rather than a plain static server. The default preview URL is `http://localhost:4173`.

Run the smoke check against that preview:

```bash
npm run smoke
```

To check an already deployed site, point it at the public URL:

```bash
SMOKE_URL=https://your-site.workers.dev npm run smoke
```

On PowerShell:

```powershell
$env:SMOKE_URL = 'https://your-site.workers.dev'; npm run smoke
```

## Tests and quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # TypeScript, strict, no emit
npm test               # Vitest unit/component tests
npm run test:e2e       # Playwright, Chromium fast gate
npm run test:e2e:all   # Playwright, Chromium + Firefox + WebKit
npm run test:e2e:ui    # Playwright UI mode
```

The Playwright suite generates its own deterministic WAV and failure fixtures in `tests/e2e/fixtures/` before each run; that folder is ignored by git. Regenerate them manually with `npm run fixtures`.

First-time Playwright setup:

```bash
npx playwright install chromium
# Optional, for the full local matrix:
npx playwright install firefox webkit
```

### Screenshots

With a preview server running on port 4173:

```bash
npm run screenshots
```

This writes `docs/screenshots/desktop-light.png`, `desktop-dark.png` and `mobile-360.png` from the real interface. Override the target with `SCREENSHOT_URL`.

## Build and deploy

```bash
npm run build
npx wrangler login   # one-time, browser-based authentication
npm run deploy
```

The deploy command builds and uploads the static assets to Cloudflare Workers. The current v0.1.0 deployment is <https://switchroom.ftallfettah.workers.dev>; Wrangler also prints the URL and the Cloudflare dashboard records it. Full instructions, including CI secret setup and post-deploy checks, are in [docs/deployment.md](docs/deployment.md).

Never commit a Cloudflare token, `.env` file or any other credential.

## Project structure

```text
src/
  app/            App composition, providers and theme resolution
  audio/          Framework-independent A/B engine, gain math, validation
  components/     Layout, file slots, player controls and UI primitives
  features/       The comparison workspace
  hooks/          React bindings for the player, playhead and theme
  styles/         Tokens, themes, base styles and responsive components
  test/           Deterministic fake media/Web Audio host
tests/e2e/        Playwright specifications, helpers and generated fixtures
scripts/          Fixture generation, screenshot capture, preview smoke check
docs/             Engine, decisions, development, deployment and support docs
```

## Documentation

- [Audio engine](docs/audio-engine.md) — graph, playhead policy, crossfade and resource lifecycle.
- [Implementation decisions](docs/decisions.md) — scope, architecture and trade-offs.
- [Local development](docs/local-development.md) — setup, scripts, fixtures and troubleshooting.
- [Deployment](docs/deployment.md) — Cloudflare, previews, secrets and post-deploy checks.
- [Browser support](docs/browser-support.md) — tested versions, codec caveats and manual listening status.

## Known limitations

- The two files do not need to be the same length, but comparison stops at the shorter duration. There is no silence padding.
- The crossfade is a fixed 180 ms linear-amplitude fade. If the two files have very different loudness, the transition will reflect that difference; Switchroom does not normalize loudness.
- Codec support is the browser's, not Switchroom's. AAC/M4A is the most variable.
- v0.1 intentionally has no waveforms, persistent file library, sharing, accounts, analytics or server processing.
- There are no global keyboard shortcuts. All controls are reachable with Tab and operable with standard keys, without stealing focus from browser or assistive-technology commands.
- Automated browser coverage is desktop Chromium, Firefox and WebKit on Windows. Real mobile touch behaviour and branded Safari have not been verified.
- The manual listening pass covered WAV files in Microsoft Edge on Windows 11. MP3, FLAC, AAC and M4A decode and listening behaviour, mobile touch, and Safari audio activation still need manual checks. Automated tests prove gain scheduling, playhead continuity and state transitions; they cannot prove that a transition sounds pleasant in every browser.

## License

[MIT](LICENSE) © 2026 Switchroom contributors.
