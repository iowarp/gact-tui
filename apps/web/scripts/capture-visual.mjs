/**
 * Visual verification capture.
 *
 * Renders a surface of the app AND the corresponding prototype view in real
 * Chromium and writes both PNGs, so a rebuild can be compared against the
 * authoritative render target rather than against a description of it.
 *
 * Usage: node scripts/capture-visual.mjs <name> <appUrl> [protoUrl]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [name, appUrl, protoUrl] = process.argv.slice(2);
if (!name || !appUrl) {
  console.error('usage: capture-visual.mjs <name> <appUrl> [protoUrl]');
  process.exit(2);
}

const outDir = resolve(import.meta.dirname, '..', 'screenshots', 'visual-check');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function shoot(url, file, settleMs) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  // The prototype boots through a client-side bundler; give it time to paint.
  await page.waitForTimeout(settleMs);
  const path = resolve(outDir, file);
  await page.screenshot({ path, fullPage: true });
  console.log(`${file}  <- ${url}${errors.length ? `  [pageerror: ${errors.length}]` : ''}`);
  for (const e of errors.slice(0, 3)) console.log(`   ! ${e.split('\n')[0]}`);
  await page.close();
}

await shoot(appUrl, `${name}-app.png`, 400);
if (protoUrl) await shoot(protoUrl, `${name}-proto.png`, 3000);

await browser.close();
