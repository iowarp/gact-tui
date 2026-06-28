/**
 * Standalone HEADED driver: opens a visible Chromium on the WSLg display,
 * connects the new web app to the LIVE clio (:17800), opens the ALREADY-COMPLETED
 * EarthScope session, renders its transcript on the new build, captures
 * live-render screenshots (tool semantic preview, plot image, ✦ ANSWER) from the
 * REAL live-clio page (not the mock fixture), then keeps the browser open
 * indefinitely so the owner reviews immediately.
 *
 * Run detached:
 *   nohup node tests/visual/drive-earthscope-headed.mjs > /tmp/earthscope-headed.log 2>&1 &
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_URL = process.env['CLIO_WEB_URL'] ?? 'http://localhost:4173';
const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
const TARGET_SESSION = process.env['CLIO_TARGET_SESSION'] ?? 'sess_a05a6efff5cf';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const SCREENSHOT_DIR = resolve(REPO_ROOT, 'apps', 'web', 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function shot(slug) {
  return resolve(SCREENSHOT_DIR, `${slug}.png`);
}

async function main() {
  log('backend', BACKEND, 'app', APP_URL, 'target session', TARGET_SESSION);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-web-security', '--start-maximized'],
  });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
    window.localStorage.setItem('clio.selected-workspace.v1', '__all');
    window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
  });

  await page.goto(`${APP_URL}/?route=connect`);
  log('navigated to app');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await page.getByTestId('chat-screen').waitFor({ state: 'visible', timeout: 15_000 });
  log('connected to LIVE clio; chat-screen visible');
  await page.waitForTimeout(1200);

  // Open the existing completed session by clicking its sidebar row.
  const row = page.getByTestId(`session-row-${TARGET_SESSION}`);
  await row.waitFor({ state: 'visible', timeout: 20_000 });
  await row.click();
  await page.getByTestId('transcript-pane').waitFor({ state: 'visible', timeout: 15_000 });
  log('session selected; transcript-pane visible');

  // Give the transcript time to fetch + render the completed turn.
  await page.waitForTimeout(4000);

  const transcript = page.getByTestId('transcript-pane');

  // The new AssistantTurnView render needs the assistant turn in view. Expand any
  // collapsed "Execution trace" disclosure so nested rows are visible too.
  try {
    const details = page.locator('[data-testid="conversation-execution-trace"]');
    const n = await details.count();
    for (let i = 0; i < n; i += 1) {
      await details.nth(i).evaluate((el) => {
        el.open = true;
      });
    }
    log('expanded', n, 'execution-trace disclosure(s)');
  } catch (e) {
    log('execution-trace expand failed:', e?.message ?? e);
  }
  await page.waitForTimeout(800);

  // Report exactly which new-build render features are present.
  const features = await page.evaluate(() => {
    const count = (sel) => document.querySelectorAll(sel).length;
    const ids = new Set();
    document.querySelectorAll('[data-testid]').forEach((el) => ids.add(el.getAttribute('data-testid')));
    return {
      assistantTurn: count('[data-testid="assistant-turn"]'),
      answer: count('[data-testid="assistant-turn-answer"]'),
      steps: count('[data-testid="assistant-turn-step"]'),
      tools: count('[data-testid="assistant-turn-tool"]'),
      routing: count('[data-testid="assistant-turn-routing"]'),
      imageThumb: count('[data-testid="trx-image-thumb"]'),
      transcriptImg: count('[data-testid="transcript-pane"] img'),
      anyImg: count('img'),
      executionTrace: count('[data-testid="conversation-execution-trace"]'),
      cxRows: count('[data-testid="cx-trace-row"]'),
      sparkleSpans: Array.from(document.querySelectorAll('*'))
        .filter((el) => el.children.length === 0 && /\bAnswer\b/.test(el.textContent ?? ''))
        .length,
      testids: Array.from(ids).filter(Boolean).filter((t) => !/^session-row/.test(t)).sort(),
    };
  });
  log('FEATURE REPORT:', JSON.stringify(features));

  // Capture full-page context first.
  await page.screenshot({ path: shot('web-live-real-overview'), fullPage: false });
  log('captured overview');

  // --- Screenshot 1: a tool with its semantic preview ---
  try {
    await transcript.evaluate((el) => el.scrollTo({ top: 0 }));
    await page.waitForTimeout(600);
  } catch {}
  let toolCaptured = false;
  for (const sel of [
    '[data-testid="assistant-turn-tool"]',
    '[data-testid="assistant-turn-step"]',
    '[data-testid="cx-trace-row"]',
  ]) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await loc.screenshot({ path: shot('web-live-real-tools') });
        log('captured tool/semantic preview via', sel);
        toolCaptured = true;
        break;
      } catch (e) {
        log('tool selector', sel, 'failed:', e?.message ?? e);
      }
    }
  }
  if (!toolCaptured) {
    await page.screenshot({ path: shot('web-live-real-tools'), fullPage: false });
    log('tool selectors not found; saved viewport fallback for web-live-real-tools');
  }

  // --- Screenshot 2: the rendered plot image ---
  let imageCaptured = false;
  for (const sel of [
    '[data-testid="transcript-pane"] img',
    'img[src^="data:image"]',
    '[data-testid="trx-image-thumb"]',
  ]) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await loc.screenshot({ path: shot('web-live-real-image') });
        const dims = await loc.evaluate((n) => ({
          w: n.naturalWidth ?? null,
          h: n.naturalHeight ?? null,
          src: (n.getAttribute?.('src') ?? '').slice(0, 32),
        }));
        log('captured inline image via', sel, JSON.stringify(dims));
        imageCaptured = true;
        break;
      } catch (e) {
        log('image selector', sel, 'failed:', e?.message ?? e);
      }
    }
  }
  if (!imageCaptured) {
    log('NO inline image element found in transcript (plot was a workspace artifact, not an image part)');
    await page.screenshot({ path: shot('web-live-real-image'), fullPage: false });
  }

  // --- Screenshot 3: the ✦ Answer headline ---
  let answerCaptured = false;
  for (const sel of ['[data-testid="assistant-turn-answer"]', 'text=Answer']) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      try {
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await loc.screenshot({ path: shot('web-live-real-answer') });
        log('captured answer via', sel);
        answerCaptured = true;
        break;
      } catch (e) {
        log('answer selector', sel, 'failed:', e?.message ?? e);
      }
    }
  }
  if (!answerCaptured) {
    try {
      await transcript.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await page.waitForTimeout(800);
    } catch {}
    await page.screenshot({ path: shot('web-live-real-answer'), fullPage: false });
    log('answer headline selectors not found; saved bottom-viewport fallback');
  }

  writeFileSync('/tmp/earthscope-headed-session.txt', TARGET_SESSION + '\n');
  log('READY: headed browser open at completed session on the NEW build. Keeping open indefinitely.');

  // Keep the browser open forever.
  await new Promise(() => {});
}

main().catch((err) => {
  log('FATAL', err?.stack ?? err);
  process.exit(1);
});
