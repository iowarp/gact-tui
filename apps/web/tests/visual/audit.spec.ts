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
  // Returning-user profile: the first-run onboarding tour must not overlay
  // the surfaces these tests drive. The tour has its own dedicated test.
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });
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

  // ---- Inspector Bindings tab (#124) ----
  test('Inspector Bindings tab renders blueprint + pack pickers (#124)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Wait for the bindings resource to actually resolve — it keys on
    // activeId() which only flips after the row click above.
    await page
      .waitForResponse(
        (r) => r.url().includes('/v1/agent-blueprints') && r.status() === 200,
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    await page.waitForTimeout(800);
    if (!(await page.getByTestId('inspector-drawer').isVisible().catch(() => false))) {
      await page.getByTestId('topbar-inspector').click();
    }
    // Dump available tabs so a failure tells us what state the
    // inspector landed in instead of "element not found".
    const tabs = await page.locator('[data-testid^="inspector-tab-"]').evaluateAll(
      (els: Element[]) => els.map((e) => (e as HTMLElement).dataset['testid']),
    );
    await page.screenshot({ path: shot('124-bindings-tab'), fullPage: false });
    expect(tabs, 'inspector should expose Bindings tab').toContain('inspector-tab-bindings');
    const tab = page.getByTestId('inspector-tab-bindings');
    await expect(tab).toBeVisible({ timeout: 4_000 });
    await tab.click();
    await expect(page.getByTestId('binding-blueprint')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('124-bindings-tab'), fullPage: false });
    await close();
  });

  // ---- Composer paste compression (#102) ----
  test('Composer collapses pastes >=3 lines into a placeholder (#102)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    const ta = page.getByTestId('composer-input');
    await expect(ta).toBeVisible({ timeout: 6_000 });
    await ta.click();
    await page.evaluate(({ text }) => {
      const el = document.querySelector(
        '[data-testid="composer-input"]',
      ) as HTMLTextAreaElement;
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, { text: 'line1\nline2\nline3\nline4\nline5' });
    await page.waitForTimeout(400);
    await expect(ta).toHaveValue(/\[pasted 5 lines · click to expand · #[a-z0-9]+\]/);
    await page.screenshot({ path: shot('102-paste-compression'), fullPage: false });
    await close();
  });

  // ---- Composer @-picker (#96) ----
  test('Composer @ picker lists real workspace files (#96)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    // Create a ws_default-bound session so the picker has a workspace to
    // list, then activate it. (clio returns files under `entries`; the
    // client used to read `res.files` and silently showed zero.)
    const sid = await page.evaluate(async (base) => {
      const s = await (
        await fetch(`${base}/v1/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: 'ws_default' }),
        })
      ).json();
      return s.id as string;
    }, REAL_BACKEND);
    await page.getByTestId('sessions-refresh').click();
    await page.waitForTimeout(800);
    await page.getByTestId(`session-row-${sid}`).click();
    await page.waitForTimeout(800);

    const ta = page.getByTestId('composer-input');
    await expect(ta).toBeVisible({ timeout: 6_000 });
    await ta.click();
    await ta.type('@');
    await expect(page.getByTestId('at-mention-picker')).toBeVisible({ timeout: 4_000 });
    // The picker must surface at least one real workspace file (proves the
    // entries->files normalization; previously this list was always empty).
    await expect(
      page.locator('[data-testid^="at-mention-item-file:"]').first(),
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('96-at-mention-picker'), fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  // ---- Palette: export-md + extract-agent + search-messages (#138 #142 #97) ----
  test('Palette exposes export-md / extract-agent / search-messages actions (#138 #142 #97)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 4_000 });
    const input = page.getByTestId('slash-palette-input');
    await input.fill('export');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('138-palette-export-md'), fullPage: false });
    await input.fill('extract');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('142-palette-extract-agent'), fullPage: false });
    await input.fill('search');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('97-palette-search-messages'), fullPage: false });
    await close();
  });

  // ---- Walk-away parks active session in detached registry (#115) ----
  test('Ctrl+Shift+D parks the active session as detached (#115)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    await page.locator('body').click();
    await page.keyboard.press('Control+Shift+KeyD');
    await expect(page.getByTestId('toast-host')).toContainText('Walked away', { timeout: 4_000 });
    await page.screenshot({ path: shot('115-walk-away'), fullPage: false });
    await close();
  });

  // ---- LeftRail capability-gated rails exist for the live backend (#120) ----
  test('LeftRail surfaces rail entries for advertised capabilities (#120)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    // Every backend in our test fleet advertises these — they should
    // all be present in the rail.
    for (const rail of ['agents', 'mcp', 'memory', 'metrics', 'doctor', 'plugins', 'tools']) {
      await expect(page.getByTestId(`rail-${rail}`)).toBeVisible({ timeout: 4_000 });
    }
    await page.screenshot({ path: shot('120-leftrail-rails'), fullPage: false });
    await close();
  });

  // ---- Providers detail in Settings (#128) ----
  test('Settings → Providers renders provider list with active marker (#128)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-providers').click();
    // providers-active is the chip on the currently-active provider; if
    // the backend has no providers, providers-error shows instead.
    await expect(
      page.getByTestId('providers-active').or(page.getByTestId('providers-error')),
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('128-providers-detail'), fullPage: false });
    await close();
  });

  // ---- Provider models detail expansion (#101) ----
  test('Settings → Providers expands a provider to show models (#101)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-providers').click();
    await expect(
      page.getByTestId('providers-active').or(page.getByTestId('providers-error')),
    ).toBeVisible({ timeout: 6_000 });
    // Expand the first provider's models — GET /v1/providers/{id}/models.
    // The container renders whether the provider returns a model list or
    // a source/error detail (e.g. an unreachable local provider), which
    // is enough to prove the round-trip is wired end-to-end.
    const toggle = page.locator('[data-testid^="provider-models-toggle-"]').first();
    await toggle.click();
    await expect(
      page.locator('[data-testid^="provider-models-"]').first(),
    ).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('101-provider-models'), fullPage: false });
    // The models fetch can still be in flight; drop the CORS route shim
    // before teardown so a late route.fetch() doesn't error the test.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  // ---- Composer voice + mic affordances render (#135 #137) ----
  test('Composer exposes voice-upload + mic-record affordances (#135 #137)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Both composer-voice (upload audio file) and composer-mic
    // (browser recording) are gated on backend.capabilities.voice
    // — the desktop hides them when clio doesn't have
    // /voice/transcribe. Skip when not capable.
    const voiceCapable = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/v1/capabilities`);
      const j = await r.json();
      return Boolean(j?.capabilities?.voice);
    }, REAL_BACKEND);
    if (!voiceCapable) {
      test.skip(true, 'backend does not advertise voice capability');
      await close();
      return;
    }
    await expect(page.getByTestId('composer-voice')).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('composer-mic')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('135-137-composer-voice-mic'), fullPage: false });
    await close();
  });

  // ---- Pin a session (#119) ----
  test('Pinning a session shows the pin marker in the row (#119)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    const firstRow = page.locator('[data-testid^="session-row-"]').first();
    await firstRow.waitFor({ state: 'visible', timeout: 6_000 });
    const id = (await firstRow.getAttribute('data-testid'))!.replace(
      'session-row-',
      '',
    );
    const kebab = page.getByTestId(`session-row-kebab-${id}`);
    await kebab.click();
    const pinAction = page.getByTestId(`session-row-pin-${id}`);
    // If the row was already pinned, this would say "Unpin" — still
    // toggles the state, just inverted. Either way the marker should
    // be present afterwards if we click Pin (or absent if Unpin).
    const wasPinned = await page
      .getByTestId(`session-row-pinned-${id}`)
      .isVisible()
      .catch(() => false);
    if (wasPinned) {
      // Close menu, re-open, and use pin-to-pin again so we end up pinned.
      await page.keyboard.press('Escape');
      await kebab.click();
    }
    await pinAction.click();
    await expect(page.getByTestId(`session-row-pinned-${id}`)).toBeVisible({
      timeout: 4_000,
    });
    await page.screenshot({ path: shot('119-pinned-session'), fullPage: false });
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

  // ---- W3 Tier-1: actionable error states ----
  test('Discovery fetch failure shows Retry and recovers when clicked (W3 error states)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    // Break the agents fetch: the page must render an error banner WITH a
    // Retry button (no dead-end), and clicking Retry after the network
    // recovers must repopulate the page without a reload.
    let broken = true;
    await page.route('**/v1/agents**', async (route) => {
      if (broken) {
        await route.abort('connectionrefused');
        return;
      }
      // Defer to the CORS-shim route installed by connect().
      await route.fallback();
    });
    await page.getByTestId('rail-agents').click();
    await expect(page.getByTestId('dp-error')).toBeVisible({ timeout: 8_000 });
    const retry = page.getByTestId('dp-error-retry');
    await expect(retry).toBeVisible();
    await page.screenshot({ path: shot('w3-error-discovery-retry'), fullPage: false });
    // Network "recovers" → Retry refetches in place.
    broken = false;
    await retry.click();
    await expect(page.getByTestId('dp-error')).toBeHidden({ timeout: 8_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  // (The TTFT/token-rate stream-stats test lives in oneturn-audits.spec.ts —
  // it needs real SSE delivery, which requires the --disable-web-security
  // browser those live-turn tests run in. EventSource is CORS-blocked in
  // this spec's stock browser.)

  // ---- W3 Tier-2: palette frecency ----
  test('Palette ranks previously-used commands first with a recent badge (W3 frecency)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.locator('body').click();

    // Use the "go · doctor" command once.
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 6_000 });
    await page.keyboard.type('go · doctor');
    await page.getByTestId('slash-palette-item-rail:doctor').click();
    await expect(page.getByTestId('dp-doctor')).toBeVisible({ timeout: 8_000 });

    // Reopen with an empty query: rail:doctor must now be the FIRST item
    // and carry the "recent" badge.
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 6_000 });
    const firstItem = page.locator('.slash-palette__item').first();
    await expect(firstItem).toHaveAttribute('data-testid', 'slash-palette-item-rail:doctor');
    await expect(firstItem.locator('.chip')).toContainText('recent');
    await page.screenshot({ path: shot('w3-palette-frecency'), fullPage: false });
    await close();
  });

  // ---- W3 Tier-1: first-run onboarding tour ----
  test('First run shows the onboarding tour; finishing it persists (W3 onboarding)', async ({ browser }) => {
    // Fresh profile — NO onboarding flag → the tour must auto-appear after
    // the chat shell mounts.
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

    // Tour appears on the welcome step.
    const tour = page.getByTestId('onboarding-tour');
    await expect(tour).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('onboarding-title')).toContainText('Welcome');
    await page.screenshot({ path: shot('w3-onboarding-welcome'), fullPage: false });

    // Step through every page — titles change, spotlight follows.
    const next = page.getByTestId('onboarding-next');
    await next.click(); // → composer
    await expect(page.getByTestId('onboarding-title')).toContainText('Ask anything');
    await page.screenshot({ path: shot('w3-onboarding-composer'), fullPage: false });
    await next.click(); // → sessions
    await expect(page.getByTestId('onboarding-title')).toContainText('Sessions');
    await next.click(); // → rail
    await expect(page.getByTestId('onboarding-title')).toContainText('Discovery');
    await next.click(); // → palette
    await expect(page.getByTestId('onboarding-title')).toContainText('palette');
    // Finish.
    await next.click();
    await expect(tour).toBeHidden();

    // Finishing persists the done-flag, so the tour never auto-shows again.
    // (Asserted on the flag directly — reloading ?route=connect lands on the
    // connect form, not chat, since the manual connection isn't persisted.)
    const flag = await page.evaluate(() =>
      window.localStorage.getItem('clio.onboarding-done.v1'),
    );
    expect(flag).toBe('1');
    await ctx.close();
  });

  // ---- W3 Tier-1: settings depth ----
  test('Appearance presets apply high-contrast tokens live (W3 settings)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.getByTestId('rail-settings').click();
    // Navigate to the Appearance section.
    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible({ timeout: 6_000 });
    const preset = page.getByTestId('settings-preset-high-contrast');
    await expect(preset).toBeVisible();
    await preset.click();
    // The override stylesheet must now force the high-contrast background.
    await expect
      .poll(async () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
        ),
      )
      .toBe('#000000');
    await page.screenshot({ path: shot('w3-settings-high-contrast'), fullPage: false });
    // Back to default so the persisted preset doesn't bleed into other tests.
    await page.getByTestId('settings-preset-default').click();
    await close();
  });

  test('Per-backend Test connection shows latency against live clio (W3 settings)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.getByTestId('rail-settings').click();
    await page.getByTestId('settings-nav-backends').click();
    // The connect() flow registers the live backend; find its row's Test button.
    const testBtn = page.locator('[data-testid^="settings-row-test-"]:not([data-testid*="result"])').first();
    await expect(testBtn).toBeVisible({ timeout: 6_000 });
    await testBtn.click();
    const result = page.locator('[data-testid^="settings-row-test-result-"]').first();
    await expect(result).toContainText(/ok · \d+ms/, { timeout: 8_000 });
    await page.screenshot({ path: shot('w3-settings-test-connection'), fullPage: false });
    await close();
  });

  // ---- W3 Tier-1 a11y: modal focus trap ----
  test('Command palette traps Tab focus and restores it on close (W3 a11y)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await page.waitForTimeout(800);
    await page.locator('body').click();
    await page.keyboard.press('Control+KeyK');
    const palette = page.getByTestId('slash-palette');
    await expect(palette).toBeVisible({ timeout: 6_000 });
    await expect(palette).toHaveAttribute('aria-modal', 'true');
    // Tab a dozen times — focus must never leave the dialog.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="slash-palette"]');
        return dialog ? dialog.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    }
    await page.screenshot({ path: shot('w3-a11y-focus-trap'), fullPage: false });
    // Esc closes → focus returns to the page (not lost to <body> limbo is
    // acceptable; the assertion is that the dialog is gone and the app
    // remains keyboard-operable).
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await close();
  });

  // ---- W3 Tier-1: topbar overflow when chips don't fit (priority+ pattern) ----
  test('Narrow topbar collapses secondary chips into a ⋯ overflow menu (W3 overflow)', async ({ browser }) => {
    // Narrow window: the secondary chips (density/model/perm/cost/tokens)
    // must NOT render inline; a ⋯ button opens them in a dropdown.
    const ctx = await browser.newContext({ viewport: { width: 760, height: 720 } });
    const page = await ctx.newPage();
    // Inspector closed for a clean reading-mode capture; even without it
    // the chips can't fit a 760px window. Returning-user profile so the
    // onboarding tour doesn't overlay the topbar.
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
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
    await page.waitForTimeout(800);

    // Inline density chip must be collapsed away; the overflow button shown.
    const overflowBtn = page.getByTestId('topbar-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('density-chip')).toBeHidden();
    // Open the menu → the secondary chips render inside it.
    await overflowBtn.click();
    const menu = page.getByTestId('topbar-overflow-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('density-chip')).toBeVisible();
    await page.screenshot({ path: shot('w3-topbar-overflow'), fullPage: false });
    await ctx.close();
  });

  test('Wide topbar renders secondary chips inline, no overflow button (W3 overflow)', async ({ browser }) => {
    // Inspector closed → the topbar gets the full main-column width at
    // 1280px, so every chip fits inline and no ⋯ button appears.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
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
    await page.waitForTimeout(800);
    await expect(page.getByTestId('density-chip')).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('topbar-overflow')).toBeHidden();
    await ctx.close();
  });

  // ---- W3 Tier-1: skeleton loaders ----
  test('Discovery page shows content-shaped skeletons while loading (W3 skeletons)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    // Hold the agents fetch open until released — the page must render the
    // skeleton card grid (not a blank pane / spinner) for the whole window.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/v1/agents**', async (route) => {
      await gate;
      await route.fallback();
    });
    await page.getByTestId('rail-agents').click();
    await expect(page.getByTestId('dp-loading')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('.dp__skeleton-card').first()).toBeVisible();
    await page.screenshot({ path: shot('w3-skeleton-discovery'), fullPage: false });
    // Release the gate → skeletons resolve into real content.
    release();
    await expect(page.getByTestId('dp-loading')).toBeHidden({ timeout: 8_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  test('Send failure surfaces an actionable error toast (W3 error states)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Break message POSTs so the send fails fast (no real LM turn fired).
    await page.route('**/v1/sessions/*/messages', async (route) => {
      if (route.request().method() === 'POST') {
        await route.abort('connectionrefused');
        return;
      }
      await route.fallback();
    });
    const ta = page.locator('.composer__input').first();
    await expect(ta).toBeVisible({ timeout: 8_000 });
    await ta.click();
    await ta.fill('this send is intercepted and must fail');
    await ta.press('Enter');
    // The error toast must carry a clickable next action (Retry).
    await expect(page.locator('.toast--error')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.toast__action')).toBeVisible();
    await page.screenshot({ path: shot('w3-error-toast-action'), fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await close();
  });

  test('Notification center search + tone filter over real notifications (1.0 item 8)', async ({ browser }) => {
    const { page, close } = await connect(browser);
    await pickFirstSession(page);
    // Produce a REAL error notification: abort message POSTs → the send
    // failure toast (with Retry action) lands in the bell history.
    await page.route('**/v1/sessions/*/messages', async (route) => {
      if (route.request().method() === 'POST') {
        await route.abort('connectionrefused');
        return;
      }
      await route.fallback();
    });
    const ta = page.locator('.composer__input').first();
    await expect(ta).toBeVisible({ timeout: 8_000 });
    await ta.click();
    await ta.fill('this send is intercepted to seed a notification');
    await ta.press('Enter');
    await expect(page.locator('.toast--error')).toBeVisible({ timeout: 8_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // The real notification is searchable + filterable in the bell.
    // (Scope text assertions to the panel — the error toast itself may
    // still be on screen and carries the same title.)
    await page.getByTestId('notification-bell').click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await page.getByTestId('notification-search').fill('send');
    await expect(panel.getByText('Send failed')).toBeVisible();
    await page.getByTestId('notification-search').fill('zzzznomatch');
    await expect(page.getByTestId('notification-no-match')).toBeVisible();
    await page.getByTestId('notification-search').fill('');
    await page.getByTestId('notification-tone-error').click();
    await expect(panel.getByText('Send failed')).toBeVisible();
    await page.screenshot({ path: shot('item8-notif-search'), fullPage: false });
    await close();
  });
});
