import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Writes the deterministic WAV and failure fixtures before any browser runs,
 * so `npx playwright test` works from a clean checkout.
 */
export default function globalSetup(): void {
  const script = fileURLToPath(new URL('../../scripts/generate-fixtures.mjs', import.meta.url));

  execFileSync(process.execPath, [script], { stdio: 'inherit' });
}
