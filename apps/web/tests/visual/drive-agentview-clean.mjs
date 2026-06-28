/**
 * Drives the web app against the emulator replaying the cleaned-up EarthScope
 * SSE wire, sends a turn, and screenshots the rendered agent view — visual proof
 * that the web renders the clean 4-atom stream (delegation hierarchy, tool
 * calls, expert outputs) without phantom/duplicate content.
 */
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const APP_URL = process.env['WEB_URL'] ?? 'http://localhost:4173';
const BACKEND = process.env['GACT_URL'] ?? 'http://127.0.0.1:7777';
const SHOT_DIR = resolve(import.meta.dirname, '..', '..', 'screenshots');

const log = (...a) => console.log('[drive]', ...a);

const ctx = await chromium.launchPersistentContext('/tmp/pw-agentview-profile', {
  viewport: { width: 1440, height: 1000 },
  args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
});
const page = await ctx.newPage();
page.on('console', (m) => log('page>', m.text()));

await page.goto(`${APP_URL}/?route=connect`);
await page.getByTestId('connect-url').fill(BACKEND);
await page.getByTestId('connect-submit').click();
log('connected to', BACKEND);

// Dismiss the first-run onboarding tour (its backdrop intercepts clicks).
await page.getByTestId('onboarding-skip').click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);

// Create a session if an explicit control is present, else the composer is ready.
await page.getByTestId('new-session').click({ timeout: 3000 }).catch(() => log('no new-session button; composer likely ready'));
await page.waitForTimeout(600);

const composer = page.locator('textarea').first();
await composer.waitFor({ timeout: 10000 });
await composer.click();
await composer.fill('Explore recent seismic activity around Los Angeles');
await composer.press('Enter');
log('sent turn; waiting for agent view to render');
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(SHOT_DIR, '_web-debug-after-send.png'), fullPage: false });

// The empty-state composer creates the session server-side but doesn't always
// auto-navigate when prior sessions exist — click the newest session row to load
// its (now fully streamed) persisted transcript.
await page.waitForTimeout(2500);
await page.getByText(/Explore recent seismic/i).first().click({ timeout: 8000 }).catch(() => log('could not click session row'));
await page.getByTestId('assistant-turn').first().waitFor({ timeout: 20000 }).catch(() => log('assistant-turn not found in time'));
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(SHOT_DIR, 'web-agentview-clean-stream.png'), fullPage: false });
log('captured web-agentview-clean-stream.png (turn tail)');

// Scroll the transcript to the top to showcase the delegation hierarchy.
await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*'));
  const scroller = els.find((e) => e.scrollHeight > e.clientHeight + 200 && getComputedStyle(e).overflowY !== 'visible');
  if (scroller) scroller.scrollTop = 0;
});
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(SHOT_DIR, 'web-agentview-tree.png'), fullPage: false });
log('captured web-agentview-tree.png (delegation hierarchy)');

await ctx.close();
