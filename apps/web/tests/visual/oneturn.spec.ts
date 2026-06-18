/**
 * One-shot end-to-end smoke: web app → live clio :17801 → ALCF.
 * Not part of the audit batch; lives here so we can re-run it
 * easily but it's not wired into the standard test list.
 */

import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { DATA_SEMANTICS_EXPECT, uniqueDataSemanticsPrompt } from './live-prompts.js';

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17801';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');

// Reachability guard (same pattern as audit.spec.ts): this is a live-only
// smoke — skip rather than fail when no real clio is reachable (CI).
let realBackendReachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(1500),
  });
  realBackendReachable = r.ok;
} catch {
  realBackendReachable = false;
}

test.setTimeout(180_000);

test('webapp drives one ALCF Data Semantics turn', async () => {
  test.skip(
    !realBackendReachable,
    `no live clio backend reachable at ${BACKEND} — run locally with CLIO_GACT_URL`,
  );
  // Launch with web security disabled so EventSource can cross origin.
  // The Tauri build doesn't need this — it uses native fetch via the
  // gact_http command — but the pure-web preview is subject to browser
  // CORS, and clio's /events doesn't emit Access-Control-Allow-Origin.
  const browser = await chromium.launch({
    args: ['--disable-web-security'],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Returning-user profile — keep the first-run tour out of this flow.
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });

  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

  // Wait for the sessions resource so we can land on the freshly
  // created stream-test session.
  await page
    .locator('[data-testid^="session-row-"]')
    .first()
    .waitFor({ state: 'visible', timeout: 6_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);

  // Make a new session via the UI, then click into it. The new-session
  // button opens the semantics picker before creating a row.
  await page.getByTestId('sessions-new').click();
  await page.getByTestId('session-semantics-start').click();
  await page.waitForTimeout(1_500);
  const newRow = page.locator('[data-testid^="session-row-"]').first();
  await newRow.click();
  await page.waitForTimeout(800);

  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.pressSequentially(uniqueDataSemanticsPrompt(), {
    delay: 10,
  });
  await page.screenshot({
    path: resolve(auditDir, 'oneturn-pre-send.png'),
    fullPage: false,
  });

  await page.getByTestId('composer-send').click();
  // Snapshot 1s after send to capture the "sending" state.
  await page.waitForTimeout(1_000);
  await page.screenshot({
    path: resolve(auditDir, 'oneturn-during-send.png'),
    fullPage: false,
  });

  // Wait for assistant message to render with current CLIO Data Semantics output.
  const transcript = page.getByTestId('transcript-pane');
  try {
    await expect(transcript).toContainText(DATA_SEMANTICS_EXPECT, { timeout: 150_000 });
  } catch (e) {
    await page.screenshot({
      path: resolve(auditDir, 'oneturn-timeout.png'),
      fullPage: false,
    });
    throw e;
  }

  await page.waitForTimeout(1_500);
  await page.screenshot({
    path: resolve(auditDir, 'oneturn-answer.png'),
    fullPage: false,
  });

  await ctx.close();
  await browser.close();
});
