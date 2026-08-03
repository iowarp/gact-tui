/**
 * Drive the rebuilt UI against a LIVE clio-agent and record what happened.
 *
 * Deliberately does not use Playwright's `webServer`: on a loaded box that
 * build+preview step crashes (STATUS_STACK_BUFFER_OVERRUN), which is an
 * environment failure, not a product failure. This script assumes a preview is
 * already serving and only drives the browser.
 *
 * Usage: node scripts/live-drive.mjs <previewUrl> <liveBackendUrl>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [previewUrl, backendUrl] = process.argv.slice(2);
if (!previewUrl || !backendUrl) {
  console.error('usage: live-drive.mjs <previewUrl> <liveBackendUrl>');
  process.exit(2);
}

const outDir = resolve(import.meta.dirname, '..', 'screenshots', 'visual-check');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(previewUrl, { waitUntil: 'networkidle' });
await page.getByTestId('connect-url').fill(backendUrl);
await page.getByTestId('connect-submit').click();

// Wait for EITHER outcome. A build that hangs here has failed regardless of
// which branch it was supposed to take.
const connected = page.getByRole('navigation', { name: /workspaces/i });
const errorBox = page.getByTestId('connect-error');
let outcome = 'timeout';
try {
  await Promise.race([
    connected.waitFor({ state: 'visible', timeout: 25_000 }).then(() => (outcome = 'connected')),
    errorBox.waitFor({ state: 'visible', timeout: 25_000 }).then(() => (outcome = 'refused')),
  ]);
} catch {
  outcome = 'timeout';
}

const detail = outcome === 'refused' ? (await errorBox.textContent())?.trim() : '';
await page.screenshot({ path: resolve(outDir, 'live-connect.png'), fullPage: true });

console.log(`outcome        : ${outcome}`);
if (detail) console.log(`surfaced text  : ${detail}`);
console.log(`console errors : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 5)) console.log(`  ! ${e.split('\n')[0]}`);

await browser.close();
process.exit(outcome === 'timeout' ? 1 : 0);
