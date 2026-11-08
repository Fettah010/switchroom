# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

Switchroom is a client-side application. There is no server-side account, database, file storage or audio processing in v0.1.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Report a vulnerability** flow on the repository's Security tab. If private reporting is unavailable, contact the repository owner through their GitHub profile before opening a public issue.

Do not open a public issue for a vulnerability that could put users at risk.

Include:

- A clear description and impact.
- Steps to reproduce, including browser and OS versions.
- The affected page, control or build.
- Whether the issue involves the privacy claim (for example, audio or file metadata leaving the browser).
- Any suggested fix or mitigation.

## Please do not attach

- Personal or unreleased audio files.
- Cloudflare tokens, API keys, cookies or other credentials.
- Session recordings that contain private material.

A minimal synthetic reproduction is more useful than real client audio.

## Scope

In scope:

- The application's client-side code and build configuration.
- Claims that audio, file names or metadata stay in the browser.
- Object URL, media element or `AudioContext` lifecycle leaks.
- XSS or injection through file names and metadata rendering.
- Dependency vulnerabilities with a realistic impact on the deployed app.
- Accidental exposure of secrets or development hooks in production.

Out of scope:

- Vulnerabilities in the browser's own codec or media stack.
- Cloudflare platform issues; report those to Cloudflare.
- Denial of service caused only by intentionally enormous local files.
- Missing features that are explicitly excluded from v0.1.

## Response

Reports are handled on a best-effort basis. There is no paid support or guaranteed response time. Confirmed issues will be fixed in a patch release and credited unless the reporter prefers otherwise.

## Deployment hygiene

- Never commit `.env` files, Cloudflare API tokens, account IDs that should remain private, or personal audio.
- Cloudflare credentials belong in the platform's secret store or GitHub Actions secrets, never in source or chat.
- The production build must not expose the development diagnostics hook. The preview smoke check verifies its absence.
