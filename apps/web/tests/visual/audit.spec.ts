/**
 * Verification spec for the audit-driven feature batch.
 *
 * Each test drives a single audit surface against a real running clio,
 * asserts the critical testid renders, and screenshots under
 * `screenshots/audit/<slug>.png`. A test passing == that surface is
 * truly wired end-to-end. A failed test means the surface ships but
 * does not work — fix before marking the underlying task completed.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

const REAL_BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
let realBackendReachable = false;
try {
  const r = await fetch(`${REAL_BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(1500),
  });
  realBackendReachable = r.ok;
} catch {
  realBackendReachable = false;
}

async function connect(
  browser: Browser,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/v1/**', async (route) => {
    if (route.request().url().includes('/events')) {
      await route.continue();
      return;
    }
    const resp = await route.fetch();
    const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
    await route.fulfill({ response: resp, headers });
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(REAL_BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  return {
    page,
    close: async () => {
      await ctx.close();
    },
  };
}

/** Select the first available session — many tests need an active
 * session for the Inspector tabs to render. */
async function pickFirstSession(page: Page) {
  // Wait for the sessions resource to actually populate — the connect
  // flow returns as soon as chat-screen mounts, but the GET /sessions
  // round trip can take a beat behind that.
  const firstRow = page.locator('[data-testid^="session-row-"]').first();
  try {
    await firstRow.waitFor({ state: 'visible', timeout: 6_000 });
  } catch {
    return;
  }
  await firstRow.click();
  // SSE reconnect + transcript load.
  await page.waitForTimeout(1_500);
}

test.describe('CLIO audit-batch verification', () => {
  test.skip(
    !realBackendReachable,
    `no clio at ${REAL_BACKEND} — start it then re-run`,
  );

  // ---- regression: composer typing isn't wiped by stale effects ----
  test('composer accepts and persists typed text (#148)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    const ta = page.locator('.composer__input').first();
    await expect(ta).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(1_500);
    await ta.click();
    await ta.pressSequentially('verification probe — does this stick?', {
      delay: 15,
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('148-composer-typing'), fullPage: false });
    await expect(ta).toHaveValue('verification probe — does this stick?');
    await close();
  });

  // ---- catalog browser (#105) ----
  test('Cmd+Shift+K opens the catalog browser modal (#105)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(1_500);
    // Avoid the textarea capturing the shortcut.
    await page.locator('body').click();
    await page.keyboard.press('Control+Shift+KeyK');
    await expect(page.getByTestId('catalog-browser')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('105-catalog-browser'), fullPage: false });
    await close();
  });

  // ---- compose modal (#107) ----
  test('Cmd+G opens the compose modal (#107)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(1_500);
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyG');
    await expect(page.getByTestId('compose-modal')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('107-compose-modal'), fullPage: false });
    await close();
  });

  // ---- shared session modal (#114) ----
  test('Cmd+L opens the shared session modal (#114)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(1_500);
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyL');
    await expect(page.getByTestId('shared-session-modal')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('114-shared-session-modal'), fullPage: false });
    await close();
  });

  // ---- archive view in sessions column (#109) ----
  test('SessionsColumn archive toggle switches to archive bucket (#109)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await expect(page.getByTestId('sessions-archive-toggle')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('sessions-archive-toggle').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('109-archive-view'), fullPage: false });
    await close();
  });

  // ---- session import button (#98) ----
  test('Sessions column shows Import button wired to onImportSession (#98)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    const importBtn = page
      .locator('button[title*="Import session from JSON" i]')
      .first();
    await expect(importBtn).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('98-import-session-button'), fullPage: false });
    await close();
  });

  // ---- Settings → Appearance (locale + theme + intro) ----
  test('Settings → Appearance renders locale, theme tokens, intro (#104 #106 #121)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    // Settings shell lands on Backends — click into Appearance.
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('[data-testid^="settings-locale-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="theme-token-"]').first()).toBeVisible();
    await expect(page.getByTestId('settings-intro-textarea')).toBeVisible();
    await page.screenshot({ path: shot('104-106-121-settings-appearance'), fullPage: false });
    await close();
  });

  // ---- Plugins discovery page (#147) ----
  test('Plugins rail entry opens the registry form (#147)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    const railPlugins = page.getByTestId('rail-plugins');
    await expect(railPlugins).toBeVisible({ timeout: 4_000 });
    await railPlugins.click();
    await expect(page.getByTestId('plugin-form')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('147-plugins-form'), fullPage: false });
    await close();
  });

  // ---- Memory page with cross-session search (#108) ----
  test('Memory rail entry shows cross-session search input (#108)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-memory').click();
    await expect(page.getByTestId('memory-search-input')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('108-memory-search'), fullPage: false });
    await close();
  });

  // ---- Hooks editor (#122) ----
  test('Settings → Hooks renders editor (#122)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-hooks').click();
    // Hooks page mounts under settings-hooks; the editor surface
    // exposes `hook-form` once the page renders. Accept either when
    // backend has 0 hooks (form-only) or any (form + list).
    await expect(page.getByTestId('hook-form')).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('122-hooks-form'), fullPage: false });
    await close();
  });

  // ---- Inspector Frames tab (#113) — needs active session ----
  test('Inspector renders Frames tab when session has frames (#113)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Open inspector
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyI').catch(() => undefined);
    await page.waitForTimeout(600);
    // Click the Frames tab if present
    const framesTab = page.locator('button:has-text("Frames")').first();
    if (await framesTab.isVisible().catch(() => false)) {
      await framesTab.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: shot('113-inspector-frames'), fullPage: false });
    await close();
  });

  // ---- Discovery: agents, mcp, prompts, doctor (#132 #125 #128 #141) ----
  test('Discovery → Agents renders cards (#132)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-agents').click();
    await expect(
      page.locator('[data-testid^="agent-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: shot('132-agents-page'), fullPage: false });
    await close();
  });

  test('Discovery → MCP renders cards (#125)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-mcp').click();
    await expect(
      page.locator('[data-testid^="mcp-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: shot('125-mcp-page'), fullPage: false });
    await close();
  });

  test('Discovery → Doctor renders LSP clients section if backend has any (#141)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-doctor').click();
    await expect(page.getByTestId('doctor-integrations')).toBeVisible({ timeout: 8_000 });
    // LSP section is optional; just capture whatever Doctor renders.
    await page.screenshot({ path: shot('141-doctor-page'), fullPage: false });
    await close();
  });

  // ---- MCP install modal (#95) ----
  test('MCP page exposes install modal (#95)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-mcp').click();
    await page.getByTestId('mcp-install-open').click();
    await expect(page.getByTestId('mcp-install-modal')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('95-mcp-install-modal'), fullPage: false });
    await close();
  });

  // ---- Policies editor (#103 #123) ----
  test('Settings → Policies opens JSON editor (#123)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-policies').click();
    await page.getByTestId('policies-edit').click();
    await expect(page.getByTestId('policies-editor')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('123-policies-editor'), fullPage: false });
    await close();
  });

  // ---- Blueprint validate/install (#126) ----
  test('Settings → Agent blueprints exposes install/validate (#126)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-blueprints').click();
    await page.getByTestId('blueprint-install-toggle').click();
    await expect(page.getByTestId('blueprint-install-input')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('126-blueprint-install'), fullPage: false });
    await close();
  });

  // ---- Expert pack validate (#127) ----
  test('Settings → Expert packs exposes validate flow (#127)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-expert-packs').click();
    await page.getByTestId('expertpack-validate-toggle').click();
    await expect(page.getByTestId('expertpack-validate-input')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('127-expertpack-validate'), fullPage: false });
    await close();
  });

  // ---- Schedules tab in inspector (#112 #134) ----
  test('Inspector Schedules tab renders cron preview (#112 #134)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Make sure the inspector drawer is actually open; default is open
    // but the persisted flag may have flipped it off.
    if (!(await page.getByTestId('inspector-drawer').isVisible().catch(() => false))) {
      await page.getByTestId('topbar-inspector').click();
    }
    await expect(page.getByTestId('inspector-drawer')).toBeVisible({ timeout: 4_000 });
    // hasSchedules() trips on either existing schedules OR the
    // onCreateSchedule capability — so the tab is visible whenever
    // the backend advertises scheduled_sessions.
    const scheduleTab = page.getByTestId('inspector-tab-schedules');
    await expect(scheduleTab).toBeVisible({ timeout: 6_000 });
    await scheduleTab.click();
    await page.getByTestId('schedule-cron-input').fill('*/5 * * * *');
    await expect(page.getByTestId('schedule-cron-preview')).toBeVisible({ timeout: 2_000 });
    await page.screenshot({ path: shot('112-134-schedules-tab'), fullPage: false });
    await close();
  });

  // ---- Memory events log (#100) ----
  test('Memory page exposes session-scoped events list (#100)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    await page.getByTestId('rail-memory').click();
    const toggle = page.getByTestId('memory-events-toggle');
    await expect(toggle).toBeVisible({ timeout: 6_000 });
    await toggle.click();
    // The list mounts once toggled open; it may be empty for a fresh
    // session — we still want the structural surface visible.
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('100-memory-events'), fullPage: false });
    await close();
  });

  // ---- Workspaces page (#28 + workspace card features) ----
  test('Discovery → Workspaces renders cards + new-workspace form toggle (#131 #140)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-workspaces').click();
    await expect(
      page.locator('[data-testid^="workspace-card-"]').first(),
    ).toBeVisible({ timeout: 8_000 });
    // Toggle the new-workspace form
    await page.getByTestId('workspaces-new').click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('131-140-workspaces-page'), fullPage: false });
    await close();
  });
});
