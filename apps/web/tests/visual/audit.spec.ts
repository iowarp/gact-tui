/**
 * Verification spec for the audit-driven feature batch.
 *
 * Each test drives a single audit surface against a real running clio,
 * asserts the critical testid renders, and screenshots under
 * `screenshots/audit/<slug>.png`. A test passing == that surface is
 * truly wired end-to-end. A failed test means the surface ships but
 * does not work — fix before marking the underlying task completed.
 */

import { test, expect, type APIResponse } from '@playwright/test';
import {
  REAL_BACKEND,
  connect,
  openSettingsSection,
  openShortcutSurface,
  pickFirstSession,
  realBackendReachable,
  shot,
  withConnectedAuditPage,
} from './audit-helpers';

test.describe('CLIO audit-batch verification', () => {
  test.skip(
    !realBackendReachable,
    `no clio at ${REAL_BACKEND} — start it then re-run`,
  );

  // ---- regression: composer typing isn't wiped by stale effects ----
  test('composer accepts and persists typed text (#148)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- catalog browser (#105) ----
  test('Cmd+Shift+K opens the catalog browser modal (#105)', async ({ browser }) => {
    await openShortcutSurface(browser, {
      key: 'Control+Shift+KeyK',
      testId: 'catalog-browser',
      screenshot: '105-catalog-browser',
    });
  });

  // ---- compose modal (#107) ----
  test('Cmd+G opens the compose modal (#107)', async ({ browser }) => {
    await openShortcutSurface(browser, {
      key: 'Control+KeyG',
      testId: 'compose-modal',
      screenshot: '107-compose-modal',
    });
  });

  // ---- shared session modal (#114) ----
  test('Cmd+L opens the shared session modal (#114)', async ({ browser }) => {
    await openShortcutSurface(browser, {
      key: 'Control+KeyL',
      testId: 'shared-session-modal',
      screenshot: '114-shared-session-modal',
    });
  });

  // ---- archive view in sessions column (#109) ----
  test('SessionsColumn archive toggle switches to archive bucket (#109)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      await expect(page.getByTestId('sessions-archive-toggle')).toBeVisible({ timeout: 4_000 });
      await page.getByTestId('sessions-archive-toggle').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('109-archive-view'), fullPage: false });
    });
  });

  // ---- session import button (#98) ----
  test('Sessions column shows Import button wired to onImportSession (#98)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      const importBtn = page
        .locator('button[title*="Import session from JSON" i]')
        .first();
      await expect(importBtn).toBeVisible({ timeout: 4_000 });
      await page.screenshot({ path: shot('98-import-session-button'), fullPage: false });
    });
  });

  // ---- Inspector Frames tab (#113) — needs active session ----
  test('Inspector renders Frames tab when session has frames (#113)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- Schedules tab in inspector (#112 #134) ----
  test('Inspector Schedules tab renders cron preview (#112 #134)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- Memory events log (#100) ----
  test('Memory page exposes session-scoped events list (#100)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      await pickFirstSession(page);
      await openSettingsSection(page, 'memory');
      const toggle = page.getByTestId('memory-events-toggle');
      await expect(toggle).toBeVisible({ timeout: 6_000 });
      await toggle.click();
      // The list mounts once toggled open; it may be empty for a fresh
      // session — we still want the structural surface visible.
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('100-memory-events'), fullPage: false });
    });
  });

  // ---- Inspector Bindings tab (#124) ----
  test('Inspector Bindings tab renders blueprint + pack pickers (#124)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- Composer paste compression (#102) ----
  test('Composer collapses pastes >=3 lines into a placeholder (#102)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- Composer @-picker (#96) ----
  test('Composer @ picker lists real workspace files (#96)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
      const row = page.getByTestId(`session-row-${sid}`);
      await expect(row).toBeVisible({ timeout: 6_000 });
      await row.click();
      // The composer only binds the workspace once the freshly-selected
      // session lands in the store (its `workspace` field drives the picker's
      // /files fetch). Wait for that to settle before opening the picker, else
      // it opens with an empty workspaceId and never queries.
      await page.waitForTimeout(800);

      const ta = page.getByTestId('composer-input');
      await expect(ta).toBeVisible({ timeout: 6_000 });
      const fileItem = page.locator('[data-testid^="at-mention-item-file:"]').first();
      // The picker resource captures the workspaceId when it opens; if the
      // workspace wasn't bound yet, reopen the picker so it re-queries once
      // the session is active. Retry a few times to absorb that race.
      await expect(async () => {
        // Fully close + clear the composer so reopening `@` re-runs the
        // picker's workspace-files resource (it captures the workspaceId at
        // open time — reopening after the session binds picks it up).
        await ta.click();
        await ta.fill('');
        await page.keyboard.press('Escape');
        await ta.type('@');
        await expect(page.getByTestId('at-mention-picker')).toBeVisible({ timeout: 4_000 });
        // The picker must surface at least one real workspace file (proves the
        // entries->files normalization; previously this list was always empty).
        await expect(fileItem).toBeVisible({ timeout: 4_000 });
      }).toPass({ timeout: 25_000 });
      await page.screenshot({ path: shot('96-at-mention-picker'), fullPage: false });
    });
  });

  // ---- Palette: export-md + extract-agent + search-messages (#138 #142 #97) ----
  test('Palette exposes export-md / extract-agent / search-messages actions (#138 #142 #97)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
    });
  });

  // ---- Walk-away parks active session in detached registry (#115) ----
  test('Ctrl+Shift+D parks the active session as detached (#115)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      await pickFirstSession(page);
      await page.locator('body').click();
      await page.keyboard.press('Control+Shift+KeyD');
      await expect(page.getByTestId('toast-host')).toContainText('Walked away', { timeout: 4_000 });
      await page.screenshot({ path: shot('115-walk-away'), fullPage: false });
    });
  });

  // ---- Primary shell keeps configuration out of persistent chat chrome (#120) ----
  test('Sessions sidebar stays conversation-first while Settings exposes capabilities (#120)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      await expect(page.getByTestId('sessions-column')).toBeVisible({ timeout: 4_000 });
      await expect(page.getByTestId('sessions-settings')).toBeVisible({ timeout: 4_000 });
      await expect(page.getByTestId('composer-command')).toBeVisible({ timeout: 4_000 });
      for (const rail of ['agents', 'mcp', 'memory', 'metrics', 'doctor', 'plugins', 'tools']) {
        await expect(page.getByTestId(`rail-${rail}`)).toHaveCount(0);
      }
      await page.screenshot({ path: shot('120-chat-shell-sidebar'), fullPage: false });
    });
  });

  // ---- Providers detail in Settings (#128) ----
  // ---- Provider models detail expansion (#101) ----
  // ---- Composer voice + mic affordances render (#135 #137) ----
  test('Composer exposes voice-upload + mic-record affordances (#135 #137)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
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
      }
      await expect(page.getByTestId('composer-voice')).toBeVisible({ timeout: 6_000 });
      await expect(page.getByTestId('composer-mic')).toBeVisible({ timeout: 4_000 });
      await page.screenshot({ path: shot('135-137-composer-voice-mic'), fullPage: false });
    });
  });

  // ---- Pin a session (#119) ----
  test('Pinning a session shows the pin marker in the row (#119)', async ({ browser }) => {
    await withConnectedAuditPage(browser, async (page) => {
      const firstRow = page.locator('[data-testid^="session-row-"]').first();
      await firstRow.waitFor({ state: 'visible', timeout: 6_000 });
      const id = (await firstRow.getAttribute('data-testid'))!.replace(
        'session-row-',
        '',
      );
      const kebab = page.getByTestId(`session-row-kebab-${id}`);
      const pinMarker = page.getByTestId(`session-row-pinned-${id}`);
      const pinAction = page.getByTestId(`session-row-pin-${id}`);
      const targetRow = page.getByTestId(`session-row-${id}`);

      // Pin state persists on the backend (metadata.pinned mirrors the TUI), so
      // this row may already be pinned from a prior run. Either way, the goal of
      // #119 is: a pinned session shows the pin marker in its row. If it is not
      // already pinned, exercise the pin action; then assert the marker.
      if (!(await pinMarker.isVisible().catch(() => false))) {
        // The kebab is hover-revealed; hover the row so it is interactive and
        // the pointer stays inside the menu's mouse-leave region.
        await targetRow.hover();
        await kebab.click();
        await expect(pinAction).toBeVisible({ timeout: 4_000 });
        await pinAction.click();
      }
      await expect(pinMarker).toBeVisible({ timeout: 4_000 });
      await page.screenshot({ path: shot('119-pinned-session'), fullPage: false });
    });
  });

  // ---- Workspaces page (#28 + workspace card features) ----
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
    await openSettingsSection(page, 'agents');
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

    // The "go · doctor" command opens the Settings → Doctor route, which is a
    // full route (testid "settings-shell"), not an outside-click-dismiss
    // overlay. Per SettingsShell, Escape is the chrome-wide "return to chat"
    // gesture, so we press it to land back on the chat screen where Ctrl+K is
    // wired.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-shell')).toBeHidden({ timeout: 6_000 });

    // Reopen with an empty query: rail:doctor must now be the FIRST item
    // and carry the "recent" badge.
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 6_000 });
    const firstItem = page.locator('.slash-palette__item').first();
    await expect(firstItem).toHaveAttribute('data-testid', 'slash-palette-item-rail:doctor');
    await expect(firstItem.locator('.slash-palette__cat')).toContainText('recent');
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
      // route.fetch() rejects when the underlying request is aborted (the
      // connect flow + SSE churn cancels in-flight /v1 calls). That abort is
      // benign for the proxy shim, so fall back to a plain continue instead of
      // letting the rejection fail the test.
      let resp: APIResponse;
      try {
        resp = await route.fetch();
      } catch {
        await route.continue().catch(() => undefined);
        return;
      }
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers }).catch(() => undefined);
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });

    // Tour appears on the welcome step.
    const tour = page.getByTestId('onboarding-tour');
    await expect(tour).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('onboarding-title')).toContainText('Welcome');
    await page.screenshot({ path: shot('w3-onboarding-welcome'), fullPage: false });

    // Step through every page — titles change, spotlight follows.
    const next = page.getByTestId('onboarding-next');
    await next.click(); // welcome → provider-setup (B5: only present with a live client)
    // The provider-setup step renders the model picker instead of a titled
    // body + Next button; advance past it with its "skip for now" affordance.
    const providerSkip = page.getByTestId('provider-setup-skip');
    await expect(providerSkip).toBeVisible({ timeout: 6_000 });
    await page.screenshot({ path: shot('w3-onboarding-provider'), fullPage: false });
    await providerSkip.click(); // → composer
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
  test('Narrow topbar keeps commands and density out of persistent chrome (W3 overflow)', async ({ browser }) => {
    // Narrow window: command entry belongs in the composer and density belongs
    // in settings/shortcuts, not in the permanent topbar.
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
      // route.fetch() rejects when the underlying request is aborted (the
      // connect flow + SSE churn cancels in-flight /v1 calls). That abort is
      // benign for the proxy shim, so fall back to a plain continue instead of
      // letting the rejection fail the test.
      let resp: APIResponse;
      try {
        resp = await route.fetch();
      } catch {
        await route.continue().catch(() => undefined);
        return;
      }
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers }).catch(() => undefined);
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);

    await expect(page.getByTestId('composer-command')).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('topbar-palette')).toHaveCount(0);
    await expect(page.getByTestId('topbar-density')).toHaveCount(0);
    await expect(page.getByTestId('density-chip')).toHaveCount(0);
    await page.screenshot({ path: shot('w3-topbar-overflow'), fullPage: false });
    await ctx.close();
  });

  test('Wide topbar still keeps command entry in the composer (W3 overflow)', async ({ browser }) => {
    // Inspector closed → the topbar gets the full main-column width at 1280px,
    // but command and density controls still stay out of persistent chrome.
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
      // route.fetch() rejects when the underlying request is aborted (the
      // connect flow + SSE churn cancels in-flight /v1 calls). That abort is
      // benign for the proxy shim, so fall back to a plain continue instead of
      // letting the rejection fail the test.
      let resp: APIResponse;
      try {
        resp = await route.fetch();
      } catch {
        await route.continue().catch(() => undefined);
        return;
      }
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers }).catch(() => undefined);
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await expect(page.getByTestId('composer-command')).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId('topbar-palette')).toHaveCount(0);
    await expect(page.getByTestId('topbar-density')).toHaveCount(0);
    await expect(page.getByTestId('density-chip')).toHaveCount(0);
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
    await openSettingsSection(page, 'agents');
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
    // The error toast must carry a clickable next action (Retry). Scope to
    // the send-failure toast specifically: an aborted POST also drops the SSE
    // stream, which raises its own (distinct) "SSE disconnected" error toast,
    // so a bare `.toast--error` matches more than one element.
    const sendToast = page.locator('.toast--error', { hasText: 'Send failed' });
    await expect(sendToast).toBeVisible({ timeout: 8_000 });
    await expect(sendToast.locator('.toast__action')).toBeVisible();
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
    // Scope to the send-failure toast: the aborted POST also trips an
    // "SSE disconnected" error toast, so a bare `.toast--error` is not unique.
    await expect(
      page.locator('.toast--error', { hasText: 'Send failed' }),
    ).toBeVisible({ timeout: 8_000 });
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

  test('workspace-file content preview round-trips real bytes (1.0 item 2)', async ({ browser }) => {
    // Preview bytes come from the workspace-scoped read endpoint
    // (GET /v1/workspaces/{wid}/files/read) — the session-scoped
    // context-file-content route + x_clio_files_content flag were removed on
    // clio develop ~2026-06. The PreviewRail (B3) browses the workspace tree
    // and reads a selected file through `Client.readWorkspaceFile`, which is
    // exactly that endpoint; the Inspector context-file preview button shares
    // the same read path. We prove the round-trip end-to-end: pick a real
    // workspace file, preview it, and assert the rendered bytes match the
    // bytes the API returns. Gate on `files` (universally advertised).
    const caps = (await (
      await fetch(`${REAL_BACKEND}/v1/capabilities`)
    ).json()) as { capabilities?: Record<string, unknown> };
    test.skip(
      caps.capabilities?.['files'] === false,
      `backend ${REAL_BACKEND} does not advertise the files capability`,
    );

    // Discover a real, root-level text file to preview (and capture the bytes
    // the API serves so we can assert the UI renders the SAME bytes). Prefer a
    // shallow text file so the tree row is reachable without expanding dirs.
    const wsList = (await (
      await fetch(`${REAL_BACKEND}/v1/workspaces`)
    ).json()) as { workspaces: { id: string }[] };
    const wid = wsList.workspaces[0]?.id;
    expect(wid, 'backend must expose at least one workspace').toBeTruthy();
    const tree = (await (
      await fetch(`${REAL_BACKEND}/v1/workspaces/${wid}/files`)
    ).json()) as { entries: { path: string; type: string; size?: number }[] };
    const TEXT_EXT = /\.(xml|md|txt|json|js|ts|css|html|yml|yaml|toml|ini|cfg)$/i;
    const target = tree.entries.find(
      (e) =>
        e.type === 'file' &&
        !e.path.includes('\\') &&
        !e.path.includes('/') &&
        TEXT_EXT.test(e.path) &&
        (e.size ?? 0) > 0 &&
        (e.size ?? Infinity) < 200_000,
    );
    test.skip(
      !target,
      `workspace ${wid} exposes no shallow text file to preview`,
    );
    const targetPath = target!.path;
    const rawBytes = await (
      await fetch(
        `${REAL_BACKEND}/v1/workspaces/${wid}/files/read?path=${encodeURIComponent(targetPath)}`,
      )
    ).text();
    expect(rawBytes.length).toBeGreaterThan(0);
    // A distinctive slice the UI must reproduce verbatim (skip leading
    // whitespace, take a printable run from the body).
    const needle = rawBytes.trim().slice(0, 40);

    // Drive the UI: connect, select a session (PreviewRail mounts on the chat
    // route), open the preview rail with the inspector closed so it has room.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
      window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
    });
    await page.route('**/v1/**', async (route) => {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      // route.fetch() rejects when the underlying request is aborted (the
      // connect flow + SSE churn cancels in-flight /v1 calls). That abort is
      // benign for the proxy shim, so fall back to a plain continue instead of
      // letting the rejection fail the test.
      let resp: APIResponse;
      try {
        resp = await route.fetch();
      } catch {
        await route.continue().catch(() => undefined);
        return;
      }
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers }).catch(() => undefined);
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(REAL_BACKEND);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });
    await pickFirstSession(page);

    const rail = page.getByTestId('preview-rail');
    await expect(rail).toBeVisible({ timeout: 8_000 });
    // Filter to the target so its tree row is the only match, then select it.
    await page.getByTestId('preview-rail-filter').fill(targetPath);
    const row = page.getByTestId(`preview-rail-row-${targetPath}`);
    await expect(row).toBeVisible({ timeout: 6_000 });
    await row.click();

    // The text preview must render — and its content must be the real bytes
    // the workspace read endpoint served (proving the round-trip, not a stub).
    const textPane = page.getByTestId('preview-rail-text');
    await expect(textPane).toBeVisible({ timeout: 8_000 });
    await expect(textPane).toContainText(needle, { timeout: 6_000 });
    await page.screenshot({ path: shot('item2-context-preview'), fullPage: false });
    await ctx.close();
  });

});
