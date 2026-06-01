/**
 * Audit-gap verification under real-turn semantics: drives one ALCF
 * turn through the webapp, then exercises every surface that needs a
 * live message/frame/session-update event to render.
 *
 * Needs:
 *   CLIO_GACT_URL — clio with the LM agent wired (default :17801)
 *
 * Uses --disable-web-security so EventSource crosses origin from the
 * preview origin; the Tauri build doesn't need this since it routes
 * through gact_http.
 */

import { test, expect, chromium, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17801';
const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

async function bootBrowser(): Promise<Browser> {
  return await chromium.launch({ args: ['--disable-web-security'] });
}

async function openConnected(browser: Browser): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Create a fresh session via the UI, activate it, send one turn,
 * wait for the assistant text to render. Returns the message ids
 * so the caller can target per-message UI. */
async function sendOneTurn(
  page: Page,
  text = 'What is the capital of France? One word.',
): Promise<{ userMsgId: string; asstMsgId: string }> {
  await page.getByTestId('sessions-new').click();
  await page.waitForTimeout(1_200);
  const newRow = page.locator('[data-testid^="session-row-"]').first();
  await newRow.click();
  await page.waitForTimeout(600);

  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.pressSequentially(text, { delay: 8 });
  await page.getByTestId('composer-send').click();

  // Wait for assistant text to land — the bug we fixed was that this
  // never rendered. If it does now, the rest of the per-message
  // actions also have a target.
  await expect(page.getByTestId('transcript-pane')).toContainText(/Paris/i, {
    timeout: 120_000,
  });

  // Pull the two msg ids from the rendered DOM. Message *containers*
  // are `msg-<id>` where the id itself starts with `msg_`, so the
  // container testid is `msg-msg_…`. Action buttons are
  // `msg-<verb>-msg_…` (e.g. msg-copy-msg_…, msg-edit-msg_…), which do
  // NOT start with `msg-msg_`. Anchoring on `msg-msg_` selects only the
  // row containers — the earlier `-copy-`/`-link-` blocklist missed
  // msg-edit-/msg-delete-/msg-regen- and grabbed a button id instead.
  const msgIds = await page
    .locator('[data-testid^="msg-msg_"]')
    .evaluateAll((els: Element[]) =>
      els.map((e) => (e as HTMLElement).dataset['testid'] ?? ''),
    );
  // first user, then assistant (DOM order).
  const userMsgId = (msgIds[0] ?? '').replace(/^msg-/, '');
  const asstMsgId = (msgIds[1] ?? '').replace(/^msg-/, '');
  return { userMsgId, asstMsgId };
}

test.setTimeout(240_000);

test.describe('OVERNIGHT GOAL — live-turn audit surfaces', () => {
  // -- chat-renamed-pill #110 #116 -----------------------------------
  // BLOCKED ON CLIO: this build derives the session title from the id at
  // creation (`session <suffix>`) and never emits a `session.updated`
  // event with `title` in `changed_fields` after a turn. The autorename
  // pill is wired to exactly that event, so it cannot fire end-to-end
  // here. Empirically confirmed: 3 turns across 3 fresh sessions, zero
  // `session.updated` events (only `session.status_changed`). See
  // STATUS.md "Honest verification matrix". This test pins the REAL
  // post-turn behavior — no pill — so a future clio that does autorename
  // will flip it red and tell us to re-enable the positive assertion.
  test('no autorename pill — clio derives title at creation (#110 #116)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await sendOneTurn(page);
    // The pill is transient (~4.5s). Give it a real window; if clio
    // started emitting session.updated(title) this would appear.
    await page.waitForTimeout(6_000);
    await expect(page.getByTestId('chat-renamed-pill')).toHaveCount(0);
    await page.screenshot({ path: shot('110-116-no-rename-pill'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- per-message actions row #99 #136 #139 -------------------------
  test('per-message action buttons render after the turn (#99 #136 #139)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    const { asstMsgId } = await sendOneTurn(page);

    // Hover the assistant message so the action row reveals.
    const msg = page.getByTestId(`msg-${asstMsgId}`);
    await msg.hover();
    await page.waitForTimeout(200);

    await expect(page.getByTestId(`msg-copy-${asstMsgId}`)).toBeVisible();
    await expect(page.getByTestId(`msg-delete-${asstMsgId}`)).toBeVisible();
    await expect(page.getByTestId(`msg-link-${asstMsgId}`)).toBeVisible();
    // msg-speak is gated on backend.capabilities.voice (per E-25 —
    // clicking a Speak button on a backend without /voice/synthesize
    // is a guaranteed error). Assert it only when the backend
    // advertises voice support.
    const voiceCapable = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/v1/capabilities`);
      const j = await r.json();
      return Boolean(j?.capabilities?.voice);
    }, BACKEND);
    if (voiceCapable) {
      await expect(page.getByTestId(`msg-speak-${asstMsgId}`)).toBeVisible();
    } else {
      await expect(page.getByTestId(`msg-speak-${asstMsgId}`)).toHaveCount(0);
    }
    await page.screenshot({ path: shot('99-136-139-message-actions'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- delete a message #99 ------------------------------------------
  test('msg-delete removes the message from the transcript (#99)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    const { asstMsgId } = await sendOneTurn(page);

    // Accept the confirm() dialog so the delete proceeds.
    page.on('dialog', (d) => void d.accept());

    const msg = page.getByTestId(`msg-${asstMsgId}`);
    await msg.hover();
    await page.getByTestId(`msg-delete-${asstMsgId}`).click();

    // Wait for the message to actually disappear from the DOM.
    await expect(page.getByTestId(`msg-${asstMsgId}`)).toHaveCount(0, {
      timeout: 8_000,
    });
    await page.screenshot({ path: shot('99-delete-confirmed'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- per-message copy-permalink #139 -------------------------------
  test('msg-link copies a permalink and surfaces a toast (#139)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    // Clipboard requires permission.
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { asstMsgId } = await sendOneTurn(page);

    const msg = page.getByTestId(`msg-${asstMsgId}`);
    await msg.hover();
    await page.getByTestId(`msg-link-${asstMsgId}`).click();
    // The handler surfaces a toast — assert one lands.
    await expect(page.getByTestId('toast-host')).toContainText(/link|permalink|copied/i, {
      timeout: 4_000,
    });
    await page.screenshot({ path: shot('139-permalink-copied'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- TTS speak button #136 -----------------------------------------
  test('msg-speak fires speech synthesis (#136)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    // E-25: clio without /voice/synthesize advertises voice:false in
    // capabilities and the desktop hides the Speak button. Skip the
    // assertion until clio ships TTS.
    const voiceCapable = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/v1/capabilities`);
      const j = await r.json();
      return Boolean(j?.capabilities?.voice);
    }, BACKEND);
    if (!voiceCapable) {
      test.skip(true, 'backend does not advertise voice capability');
      await ctx.close();
      await browser.close();
      return;
    }
    const { asstMsgId } = await sendOneTurn(page);

    // Stub speechSynthesis so headless chromium doesn't actually try
    // to play audio; record whether speak() was invoked.
    await page.evaluate(() => {
      (window as unknown as { __spoke?: boolean }).__spoke = false;
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = (utterance) => {
          (window as unknown as { __spoke?: boolean }).__spoke = true;
          // Fire end so any wired callbacks resolve.
          setTimeout(() => utterance.onend?.(new SpeechSynthesisEvent('end', { utterance })), 0);
        };
      }
    });

    const msg = page.getByTestId(`msg-${asstMsgId}`);
    await msg.hover();
    await page.getByTestId(`msg-speak-${asstMsgId}`).click();
    await page.waitForTimeout(500);

    const spoke = await page.evaluate(
      () => (window as unknown as { __spoke?: boolean }).__spoke === true,
    );
    expect(spoke, 'speechSynthesis.speak was invoked').toBe(true);
    await page.screenshot({ path: shot('136-tts-fired'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- inspector context-frame events fired #117 #129 ----------------
  test('inspector Frames tab shows the turn frame as completed (#117 #129)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await sendOneTurn(page);

    // Inspector defaults to open; click Frames tab.
    const framesTab = page.locator('button:has-text("Frames")').first();
    if (await framesTab.isVisible().catch(() => false)) {
      await framesTab.click();
    }
    await expect(page.locator('text=/ctx_[a-f0-9]+/').first()).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator('text=completed').first()).toBeVisible({
      timeout: 4_000,
    });
    await page.screenshot({ path: shot('117-129-frames-completed'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  /** Create a fresh session via the UI and send `text` without waiting
   * for an assistant reply — for flows that pause mid-turn (permission). */
  async function newSessionAndSend(page: Page, text: string): Promise<void> {
    await page.getByTestId('sessions-new').click();
    await page.waitForTimeout(1_200);
    await page.locator('[data-testid^="session-row-"]').first().click();
    await page.waitForTimeout(600);
    const composer = page.getByTestId('composer-input');
    await composer.click();
    await composer.pressSequentially(text, { delay: 6 });
    await page.getByTestId('composer-send').click();
  }

  // -- fork lineage badge #145 ---------------------------------------
  // clio's fork returns the child with `parent_session_id` set (NOT
  // parent_id / forked_from), which live.ts maps to row.parentId → the
  // ↘ lineage badge. Verified live: POST /fork → 201 with
  // parent_session_id + a "(fork)" title suffix.
  test('forking a session shows the lineage badge (#145)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await page.getByTestId('sessions-new').click();
    await page.waitForTimeout(1_200);
    await page.locator('[data-testid^="session-row-"]').first().click();
    await page.waitForTimeout(500);
    // Cmd/Ctrl+Shift+S forks the active session.
    await page.keyboard.press('Control+Shift+S');
    await page.waitForTimeout(2_500);
    await expect(page.locator('.sx__row-fork').first()).toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({ path: shot('145-fork-lineage'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- inspector task status cycling #133 ----------------------------
  // Seed a task via the live API, open it, and cycle its status —
  // exercises PATCH /v1/tasks/{tid} round-trip end-to-end.
  test('inspector task status cycles via PATCH (#133)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    const sid = await page.evaluate(async (base) => {
      const s = await (
        await fetch(`${base}/v1/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).json();
      await fetch(`${base}/v1/sessions/${s.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'verify task cycling', status: 'pending' }),
      });
      return s.id as string;
    }, BACKEND);
    await page.getByTestId('sessions-refresh').click();
    await page.waitForTimeout(800);
    await page.getByTestId(`session-row-${sid}`).click();
    await page.waitForTimeout(900);
    await page.getByTestId('inspector-tab-tasks').click();
    const row = page.locator('[data-testid^="inspector-task-"]').first();
    await expect(row.locator('.inspector__task-status')).toHaveText(/pending/i);
    await row.click();
    await expect(row.locator('.inspector__task-status')).toHaveText(/running/i, {
      timeout: 8_000,
    });
    await page.screenshot({ path: shot('133-task-cycled'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- context-file mode cycling #146 --------------------------------
  // Seed a real workspace file into context, then cycle its mode badge
  // (read → edit) — exercises the POST upsert on
  // /v1/sessions/{id}/context/files end-to-end.
  test('context-file mode cycles read → edit (#146)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    const sid = await page.evaluate(async (base) => {
      const s = await (
        await fetch(`${base}/v1/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: 'ws_default' }),
        })
      ).json();
      await fetch(`${base}/v1/sessions/${s.id}/context/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '.gitconfig', mode: 'read' }),
      });
      return s.id as string;
    }, BACKEND);
    await page.getByTestId('sessions-refresh').click();
    await page.waitForTimeout(800);
    await page.getByTestId(`session-row-${sid}`).click();
    await page.waitForTimeout(900);
    await page.getByTestId('inspector-tab-context').click();
    const modeBtn = page.locator('.inspector__file-mode').first();
    await expect(modeBtn).toHaveText(/read/i);
    await modeBtn.click();
    await expect(modeBtn).toHaveText(/edit/i, { timeout: 8_000 });
    await page.screenshot({ path: shot('146-context-mode-cycle'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- permission card over SSE #35 #135-perm ------------------------
  // This is the headline live bug: the SSE reducer read `payload.permission`
  // but clio emits the permission fields flat in the payload with the tool
  // identity under `tool_call.tool_name`, so the card never rendered against
  // a real backend. A tool-using prompt makes clio emit
  // `permission.requested` (shell_bash) and pause the turn; we deny to keep
  // the repo clean while still proving the decision round-trips over SSE.
  test('permission card renders over SSE and clears on a decision (#35 #135)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await newSessionAndSend(
      page,
      'Run the shell command: echo hi > clio_perm_probe.txt',
    );
    // The card MUST appear — this is the reducer fix under test.
    await expect(page.getByTestId('permission-card')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('permission-card')).toContainText(/shell_bash/i);
    await page.screenshot({ path: shot('35-135-permission-card'), fullPage: false });
    // A decision must clear the card (clio emits permission.resolved).
    await page.getByTestId('permcard-deny').click();
    await expect(page.getByTestId('permission-card')).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.screenshot({ path: shot('35-135-permission-resolved'), fullPage: false });
    await ctx.close();
    await browser.close();
  });
});
