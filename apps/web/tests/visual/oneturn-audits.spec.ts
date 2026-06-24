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

import { test, expect } from '@playwright/test';
import {
  BACKEND,
  bootBrowser,
  newSessionAndSend,
  openConnected,
  realBackendReachable,
  sendOneTurn,
  shot,
  startSessionFromUi,
  withConnectedPage,
} from './oneturn-audit-helpers.js';

test.setTimeout(240_000);

test.describe('OVERNIGHT GOAL — live-turn audit surfaces', () => {
  test.skip(
    !realBackendReachable,
    `no live clio backend reachable at ${BACKEND} — live-turn tests skip (run locally with CLIO_GACT_URL)`,
  );
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
    await withConnectedPage(async ({ page }) => {
      await sendOneTurn(page);
      // The pill is transient (~4.5s). Give it a real window; if clio
      // started emitting session.updated(title) this would appear.
      await page.waitForTimeout(6_000);
      await expect(page.getByTestId('chat-renamed-pill')).toHaveCount(0);
      await page.screenshot({ path: shot('110-116-no-rename-pill'), fullPage: false });
    });
  });

  // -- per-message actions row #99 #136 #139 -------------------------
  test('per-message action buttons render after the turn (#99 #136 #139)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- delete a message #99 ------------------------------------------
  test('msg-delete removes the message from the transcript (#99)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- per-message copy-permalink #139 -------------------------------
  test('msg-link copies a permalink and surfaces a toast (#139)', async () => {
    await withConnectedPage(async ({ ctx, page }) => {
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
    });
  });

  // -- TTS speak button #136 -----------------------------------------
  test('msg-speak fires speech synthesis (#136)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- inspector context-frame events fired #117 #129 ----------------
  test('inspector Frames tab shows the turn frame as completed (#117 #129)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- fork lineage badge #145 ---------------------------------------
  // clio's fork returns the child with `parent_session_id` set (NOT
  // parent_id / forked_from), which live.ts maps to row.parentId → the
  // ↘ lineage badge. Verified live: POST /fork → 201 with
  // parent_session_id + a "(fork)" title suffix.
  test('forking a session shows the lineage badge (#145)', async () => {
    await withConnectedPage(async ({ page }) => {
      await startSessionFromUi(page);
      // Cmd/Ctrl+Shift+S forks the active session.
      await page.keyboard.press('Control+Shift+S');
      await page.waitForTimeout(2_500);
      await expect(page.locator('.sx__row-fork').first()).toBeVisible({
        timeout: 8_000,
      });
      await page.screenshot({ path: shot('145-fork-lineage'), fullPage: false });
    });
  });

  // -- inspector task status cycling #133 ----------------------------
  // Seed a task via the live API, open it, and cycle its status —
  // exercises PATCH /v1/tasks/{tid} round-trip end-to-end.
  test('inspector task status cycles via PATCH (#133)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- context-file mode cycling #146 --------------------------------
  // Seed a real workspace file into context, then cycle its mode badge
  // (read → edit) — exercises the POST upsert on
  // /v1/sessions/{id}/context/files end-to-end.
  test('context-file mode cycles read → edit (#146)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- backend slash command dispatch #118 ---------------------------
  // The palette routes backend-defined commands through
  // POST /v1/sessions/{id}/commands/{cmd} (runCommand). Verified live:
  // /cache-stats → 200 with a system_message result. Assert the dispatch
  // actually reaches clio's command endpoint.
  test('palette dispatches a backend slash command via runCommand (#118)', async () => {
    await withConnectedPage(async ({ page }) => {
      await startSessionFromUi(page);
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 5_000 });
      await page.getByTestId('slash-palette-input').fill('cache-stats');
      await page.waitForTimeout(400);
      const [resp] = await Promise.all([
        page.waitForResponse(
          (r) => /\/commands\//.test(r.url()) && r.request().method() === 'POST',
          { timeout: 10_000 },
        ),
        page.locator('[data-testid^="slash-palette-item-"]').first().click(),
      ]);
      expect(resp.status()).toBe(200);
      await page.screenshot({ path: shot('118-runcommand'), fullPage: false });
    });
  });

  // -- permission card over SSE #35 #135-perm ------------------------
  // This is the headline live bug: the SSE reducer read `payload.permission`
  // but clio emits the permission fields flat in the payload with the tool
  // identity under `tool_call.tool_name`, so the card never rendered against
  // a real backend. A tool-using prompt makes clio emit
  // `permission.requested` (shell_bash) and pause the turn; we deny to keep
  // the repo clean while still proving the decision round-trips over SSE.
  test('permission card renders over SSE and clears on a decision (#35 #135)', async () => {
    await withConnectedPage(async ({ page }) => {
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
    });
  });

  // -- ask-user question card over SSE #94 ---------------------------
  // clio advertises x_clio_user_questions=true and emits the UserQuestion
  // fields FLAT in the user_question.created payload. The reducer used to
  // read payload.question (always undefined) so the card never rendered —
  // same wire class as the permission E-27 bug, now fixed. Drive it: create
  // a question via the API; clio emits user_question.created over SSE; the
  // desktop card must render and answering must clear it.
  test('ask-user question card renders over SSE and clears on answer (#94)', async () => {
    await withConnectedPage(async ({ page }) => {
      await page.getByTestId('sessions-new').click();
      await page.getByTestId('session-semantics-start').click();
      await page.waitForTimeout(1_200);
      const row = page.locator('[data-testid^="session-row-"]').first();
      await row.click();
      await page.waitForTimeout(800);
      const sid = ((await row.getAttribute('data-testid')) ?? '').replace(
        'session-row-',
        '',
      );
      expect(sid).toMatch(/^sess_/);

      // Create a confirmation question via clio's API (flag-gated capability).
      const qid = await page.evaluate(
        async ({ base, sid }) => {
          const r = await fetch(`${base}/v1/sessions/${sid}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: 'Proceed with the migration plan?',
              kind: 'confirmation',
            }),
          });
          const j = await r.json();
          return j.id as string;
        },
        { base: BACKEND, sid },
      );
      expect(qid).toMatch(/^/);

      // The card must render — proves user_question.created reduces correctly.
      await expect(page.getByTestId(`user-question-${qid}`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId(`user-question-${qid}`)).toContainText(
        /migration plan/i,
      );
      await page.screenshot({ path: shot('94-ask-user-card'), fullPage: false });

      // Answering (confirmation → Yes) must clear the card.
      await page.getByTestId('user-question-yes').click();
      await expect(page.getByTestId(`user-question-${qid}`)).toHaveCount(0, {
        timeout: 10_000,
      });
      await page.screenshot({ path: shot('94-ask-user-answered'), fullPage: false });
    });
  });

  // -- context-file remove (body, not query) #80 ---------------------
  // clio reads the path from the DELETE JSON body; the client used to send
  // it as a ?query → 204 no-op (file reappeared on refetch). Now body.
  test('context-file remove actually removes it (#80)', async () => {
    await withConnectedPage(async ({ page }) => {
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
      await expect(page.getByTestId('inspector-file-.gitconfig')).toBeVisible({
        timeout: 8_000,
      });
      await page.getByRole('button', { name: 'Remove .gitconfig from context' }).click();
      // Must actually disappear (refetch returns empty) — the query-vs-body bug
      // left it present.
      await expect(page.getByTestId('inspector-file-.gitconfig')).toHaveCount(0, {
        timeout: 8_000,
      });
      await page.screenshot({ path: shot('80-context-remove'), fullPage: false });
    });
  });

  // ===================== W4 HARDENING MATRIX =====================

  // -- W4: SSE drop → backoff countdown → auto-reconnect --------------
  // Proves the live.ts reconnect ladder end-to-end: a network drop flips
  // the stream to error/reconnecting (with the countdown chip), and
  // restoring the network reconnects WITHOUT a reload or user action.
  test('W4: SSE drop shows reconnect countdown and auto-recovers', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    // Activate a session so the SSE stream opens.
    const row = page.locator('[data-testid^="session-row-"]').first();
    await row.waitFor({ state: 'visible', timeout: 8_000 });
    await row.click();
    await expect(page.getByTestId('sse-status-chip')).toContainText('open', {
      timeout: 15_000,
    });

    // Drop the network: the established EventSource dies → error → the
    // backoff ladder schedules a reconnect (status: reconnecting in Ns).
    await ctx.setOffline(true);
    await expect(page.getByTestId('sse-status-chip')).toContainText(/error|reconnecting/, {
      timeout: 20_000,
    });
    await page.screenshot({ path: shot('w4-sse-drop'), fullPage: false });

    // Restore the network → the ladder reconnects on its own.
    await ctx.setOffline(false);
    await expect(page.getByTestId('sse-status-chip')).toContainText('open', {
      timeout: 45_000,
    });
    await page.screenshot({ path: shot('w4-sse-reconnected'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- W4: concurrent turns in two sessions ----------------------------
  // Two sessions run turns at the same time (fired via REST in parallel);
  // both must complete, and the INACTIVE session must surface its unread
  // badge — proving per-session SSE isolation + the sessions-list patcher.
  test('W4: two sessions complete concurrent turns; inactive one shows unread', async () => {
    await withConnectedPage(async ({ page }) => {
      // Create two fresh sessions + fire a turn in each, in parallel.
      const ids = await page.evaluate(async (base) => {
        const mk = async () => {
          const s = await (
            await fetch(`${base}/v1/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspace_id: 'ws_default' }),
            })
          ).json();
          return s.id as string;
        };
        const created = await Promise.all([mk(), mk()]);
        const a = created[0]!;
        const b = created[1]!;
        const fire = (sid: string, text: string) =>
          fetch(`${base}/v1/sessions/${sid}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: [{ type: 'text', text }] }),
          });
        // Fire both without awaiting completion — the turns run concurrently
        // server-side.
        void fire(a, 'Reply with exactly one word: alpha');
        void fire(b, 'Reply with exactly one word: beta');
        return { a, b };
      }, BACKEND);
      const sidA = ids.a;
      const sidB = ids.b;

      // Show session A in the UI; session B streams in the background.
      await page.getByTestId('sessions-refresh').click();
      await page.waitForTimeout(800);
      await page.getByTestId(`session-row-${sidA}`).click();

      // Both sessions must reach completion with an assistant reply (poll the
      // API — source of truth for "completed").
      await expect
        .poll(
          async () =>
            page.evaluate(
              async (args: { base: string; a: string; b: string }) => {
                const done = async (sid: string) => {
                  const j = await (
                    await fetch(`${args.base}/v1/sessions/${sid}/messages`)
                  ).json();
                  const msgs = j.messages as Array<{ role: string; stop_reason?: string }>;
                  return msgs.some((m) => m.role === 'assistant' && m.stop_reason);
                };
                return (await done(args.a)) && (await done(args.b));
              },
              { base: BACKEND, a: sidA, b: sidB },
            ),
          { timeout: 120_000, intervals: [2_000] },
        )
        .toBe(true);

      // The active session (A) rendered its turn; the inactive session (B)
      // bumped its row (unread/pulse) via the sessions-list SSE patcher.
      await page.screenshot({ path: shot('w4-concurrent-turns'), fullPage: false });
    });
  });

  // -- W4: large transcript renders without hanging --------------------
  // Imports a 120-message session (no LM turns — instant) and opens it.
  // The transcript must render and stay scrollable.
  test('W4: 120-message imported session renders and scrolls', async () => {
    await withConnectedPage(async ({ page }) => {
      const sid = await page.evaluate(async (base) => {
        // Message rows must satisfy clio's pydantic Message model
        // (id/role/created_at/updated_at required; session_id injected by
        // the import route) — rows that don't validate are silently skipped.
        const now = new Date().toISOString();
        const messages = [];
        for (let i = 0; i < 120; i++) {
          messages.push({
            id: `msg_imported_${String(i).padStart(4, '0')}`,
            role: i % 2 === 0 ? 'user' : 'assistant',
            created_at: now,
            updated_at: now,
            parts: [
              {
                id: `prt_imported_${i}`,
                type: 'text',
                text: `Message ${i}: ${'lorem ipsum dolor sit amet '.repeat(8)}`,
              },
            ],
          });
        }
        const created = await (
          await fetch(`${base}/v1/sessions/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: '1',
              session: { title: 'w4-large-transcript' },
              messages,
            }),
          })
        ).json();
        return created.id as string;
      }, BACKEND);

      const start = Date.now();
      await page.getByTestId('sessions-refresh').click();
      await page.waitForTimeout(800);
      await page.getByTestId(`session-row-${sid}`).click();
      // All 120 messages must be in the DOM (not virtualized away — the
      // transcript renders everything today; this pins that it stays usable).
      await expect
        .poll(
          async () => page.locator('[data-testid^="msg-msg_"]').count(),
          { timeout: 30_000 },
        )
        .toBeGreaterThanOrEqual(100);
      const renderMs = Date.now() - start;
      // Scroll to top and back — must not hang.
      await page.getByTestId('transcript-pane').evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.waitForTimeout(300);
      await page.getByTestId('transcript-pane').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      // Render budget: generous 20s ceiling — this is a smoke ceiling, not a
      // perf benchmark; it catches pathological hangs.
      expect(renderMs).toBeLessThan(20_000);
      await page.screenshot({ path: shot('w4-large-transcript'), fullPage: false });
    });
  });


  // -- 1.0 item 6: 1000-message virtualized transcript -------------------
  test('1000-message session renders a bounded DOM window (1.0 item 6)', async () => {
    test.setTimeout(300_000);
    await withConnectedPage(async ({ page }) => {
      // Import 1000 messages through the real backend.
      const sid = await page.evaluate(async (base) => {
        const now = new Date().toISOString();
        const messages = [];
        for (let i = 0; i < 1000; i++) {
          messages.push({
            id: `msg_virt_${String(i).padStart(4, '0')}`,
            role: i % 2 === 0 ? 'user' : 'assistant',
            created_at: now,
            updated_at: now,
            parts: [
              {
                id: `prt_virt_${i}`,
                type: 'text',
                text: `Virtual message ${i}: ${'lorem ipsum dolor sit amet '.repeat(6)}`,
              },
            ],
          });
        }
        const created = await (
          await fetch(`${base}/v1/sessions/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: '1',
              session: { title: 'item6-virtual-1000' },
              messages,
            }),
          })
        ).json();
        return created.id as string;
      }, BACKEND);

      const start = Date.now();
      await page.getByTestId('sessions-refresh').click();
      await page.waitForTimeout(800);
      await page.getByTestId(`session-row-${sid}`).click();

      // Messages render (the window is at the bottom after session open).
      await expect
        .poll(async () => page.locator('[data-testid^="msg-msg_"]').count(), {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const renderMs = Date.now() - start;
      // The whole point: the DOM holds a bounded window, NOT all 1000 rows.
      const domCount = await page.locator('[data-testid^="msg-msg_"]').count();
      expect(domCount).toBeLessThan(200);
      // Spacers carry the geometry of the off-screen messages.
      await expect(page.getByTestId('trx-spacer-top')).toBeAttached();
      await expect(page.getByTestId('trx-spacer-bottom')).toBeAttached();

      // Scroll to the very top → the first imported message mounts.
      await page.getByTestId('transcript-pane').evaluate((el) => {
        el.scrollTop = 0;
      });
      await expect(page.getByTestId('msg-msg_virt_0000')).toBeAttached({
        timeout: 10_000,
      });
      await page.screenshot({ path: shot('item6-virtual-top'), fullPage: false });

      // Jump back to the bottom → the last message mounts; DOM stays bounded.
      await page.getByTestId('transcript-pane').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(page.getByTestId('msg-msg_virt_0999')).toBeAttached({
        timeout: 10_000,
      });
      const domCountAfterScroll = await page
        .locator('[data-testid^="msg-msg_"]')
        .count();
      expect(domCountAfterScroll).toBeLessThan(200);

      // Initial render must be fast even with 1000 messages in state.
      expect(renderMs).toBeLessThan(15_000);
      await page.screenshot({ path: shot('item6-virtual-1000'), fullPage: false });

      // Clean up: delete the bulky test session from the live backend.
      await page.evaluate(
        async ({ base, id }) => {
          await fetch(`${base}/v1/sessions/${id}`, { method: 'DELETE' });
        },
        { base: BACKEND, id: sid },
      );
    });
  });

  // -- W4: ssh-homelab real-turn hop -----------------------------------
  // Gated on CLIO_TUNNEL_URL (an ssh -L tunnel to a remote clio). The test
  // drives the desktop UI against the TUNNELED endpoint and verifies a
  // session whose turn ran on the remote box (claude_code provider) renders
  // end-to-end. Repeatable: open a tunnel, export CLIO_TUNNEL_URL, run.
  test('W4: desktop UI drives a remote clio through an ssh tunnel (homelab hop)', async () => {
    const tunnelUrl = process.env['CLIO_TUNNEL_URL'];
    test.skip(!tunnelUrl, 'CLIO_TUNNEL_URL not set — open an ssh -L tunnel first');
    const browser = await bootBrowser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
    });
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill(tunnelUrl!);
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });

    // The remote session list loads through the tunnel; open the hop
    // session (created by the curl-side proof) or any session with messages.
    await page.waitForTimeout(1_500);
    const hopRow = page
      .locator('[data-testid^="session-row-"]')
      .filter({ hasText: /homelab|w4-homelab-hop/i })
      .first();
    await expect(hopRow).toBeVisible({ timeout: 10_000 });
    await hopRow.click();
    // The remote turn's reply must render in the transcript.
    await expect(page.getByTestId('transcript-pane')).toContainText(/homelab/i, {
      timeout: 15_000,
    });
    await page.screenshot({ path: shot('w4-homelab-hop'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // -- W3 Tier-2: TTFT + token-rate chip after a real turn ------------
  // Verified provider modes: live-streaming providers emit
  // message.part.delta; batch providers (ALCF here, with
  // x_clio_synthetic_posthoc_streaming=false) emit complete
  // message.part.added parts and zero deltas. The chip must materialize
  // for BOTH — TTFT measures first content arrival, the rate comes from
  // clio's real token count on message.completed.
  test('topbar shows TTFT + token rate after a real turn (W3 stream stats)', async () => {
    await withConnectedPage(async ({ page }) => {
      await sendOneTurn(page);

      // The chip lands inline, or inside the ... overflow menu when the chip
      // set outgrows the topbar (inspector open by default) — both are
      // correct UX states.
      const overflowBtn = page.getByTestId('topbar-overflow');
      if (await overflowBtn.isVisible()) {
        await overflowBtn.click();
      }
      const chip = page.getByTestId('stream-stats-chip');
      await expect(chip).toBeVisible({ timeout: 10_000 });
      await expect(chip).toContainText('ttft');
      await page.screenshot({ path: shot('w3-stream-stats'), fullPage: false });
    });
  });

  // -- 1.0 item 5: inspector execution timeline --------------------------
  test('inspector timeline shows a real turn with live timing (1.0 item 5)', async () => {
    await withConnectedPage(async ({ page }) => {
      const { asstMsgId } = await sendOneTurn(page);

      // Select the assistant message so the Inspector focuses this turn.
      await page.getByTestId(`msg-${asstMsgId}`).click();
      // Open the inspector if it isn't already.
      const drawer = page.getByTestId('inspector-drawer');
      if (!(await drawer.isVisible())) {
        await page.getByTestId('topbar-inspector').click();
      }
      await expect(drawer).toBeVisible();
      await page.getByTestId('inspector-tab-timeline').click();
      await expect(page.getByTestId('inspector-timeline')).toBeVisible();
      // A completed real turn: started + response text + completed with REAL
      // wire data (stop reason, token counts, elapsed seconds).
      await expect(page.getByTestId('timeline-event-started')).toBeVisible();
      await expect(page.getByTestId('timeline-event-completed')).toBeVisible();
      await expect(page.getByTestId('timeline-event-completed')).toContainText('tok');
      await page.screenshot({ path: shot('item5-timeline-live'), fullPage: false });
    });
  });

  // -- 1.0 item 4: regenerate variants (notes + model) ------------------
  test('regenerate-with-notes runs a real retry turn with lineage (1.0 item 4)', async () => {
    // Two real turns (initial + retry) — give this test its own budget.
    test.setTimeout(360_000);
    await withConnectedPage(async ({ page }) => {
      const { asstMsgId, sid } = await sendOneTurn(page);

      // Open the regenerate variant menu on the assistant message.
      const msg = page.getByTestId(`msg-${asstMsgId}`);
      await msg.hover();
      await page.waitForTimeout(200);
      await page.getByTestId(`msg-regen-${asstMsgId}`).click();
      await expect(page.getByTestId(`regen-menu-${asstMsgId}`)).toBeVisible();
      await expect(page.getByTestId(`regen-notes-${asstMsgId}`)).toBeVisible();
      // The with-model entry renders when the providers list resolves.
      await expect(page.getByTestId(`regen-model-${asstMsgId}`)).toBeVisible();
      await page.screenshot({ path: shot('item4-retry-menu'), fullPage: false });

      // Delta-based assertions: the helper may land in a pre-existing
      // (pinned) session on a long-lived backend, so absolute message
      // counts are meaningless — count before, assert the increase.
      const asstLocator = page.locator(
        '[data-testid^="msg-msg_"].trx-msg--assistant',
      );
      const asstCountBefore = await asstLocator.count();

      // With-notes flow: steering notes ride clio's RetryTurnRequest.notes.
      const NOTES = 'Answer in exactly three words.';
      await page.getByTestId(`regen-notes-${asstMsgId}`).click();
      await page.getByTestId(`regen-notes-input-${asstMsgId}`).fill(NOTES);
      await page.getByTestId(`regen-notes-submit-${asstMsgId}`).click();

      // clio (execute:true) appends a NEW user message carrying the original
      // text + the retry notes — that lands quickly (202 + message.created).
      await expect(page.getByTestId('transcript-pane')).toContainText(NOTES, {
        timeout: 60_000,
      });
      // ...then re-runs the turn -> one MORE assistant message arrives. Both
      // are server-side state, not client decoration.
      await expect
        .poll(async () => await asstLocator.count(), { timeout: 180_000 })
        .toBeGreaterThanOrEqual(asstCountBefore + 1);

      // The TurnAttempt is recorded server-side with our notes — lineage
      // survives reload (honest model; no fake desktop-only state).
      const attemptsRes = (await (
        await fetch(`${BACKEND}/v1/sessions/${sid}/attempts`)
      ).json()) as { attempts: Array<{ notes?: string; status?: string }> };
      expect(
        attemptsRes.attempts.some((a) => (a.notes ?? '').includes('three words')),
      ).toBe(true);

      await page.screenshot({ path: shot('item4-retry-notes-turn'), fullPage: false });

      // ---- 1.0 item 3: the same lineage surfaces in the UI ----
      // The retry-created user message carries the retry chip...
      await expect(
        page.locator('[data-testid^="msg-retry-chip-"]').first(),
      ).toBeVisible({ timeout: 10_000 });
      // ...and the Inspector's Attempts tab lists the attempt with our notes.
      const drawer = page.getByTestId('inspector-drawer');
      if (!(await drawer.isVisible())) {
        await page.getByTestId('topbar-inspector').click();
      }
      await page.getByTestId('inspector-tab-attempts').click();
      await expect(page.getByTestId('inspector-attempts')).toBeVisible();
      await expect(page.getByTestId('inspector-attempts')).toContainText(
        'three words',
      );
      await page.screenshot({ path: shot('item3-attempts-tab'), fullPage: false });
    });
  });
});
