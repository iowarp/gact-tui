/**
 * clio #534 surface verification: semantic execution event spine,
 * hook-blocked turns, and the hooks settings page (runtime + declarative).
 *
 * Ground truth: the SSE trace captured live against clio develop@176518d
 * with a CLIO_HOOKS_DIR pre_message hook that blocks messages containing
 * "BLOCKME" (saved at clio-hooks-test/sse-trace-blocked-and-success.log).
 *
 * Blocked-turn wire contract (gap-01):
 *   message.created(user) → semantic.event(turn.started)
 *   → semantic.event(hook.invocation.started)
 *   → semantic.event(hook.pre_message.blocked, status=blocked)
 *   → semantic.event(turn.failed, status=blocked)
 *   → message.completed {message_id: <USER msg>, stop_reason: "blocked",
 *                        error_info: {error: "permission_error", …}}
 *   → session.status_changed {status: "error"}
 *   No assistant message is ever created.
 *
 * Needs:
 *   CLIO_GACT_URL — clio with x_clio_semantic_events; the blocked-turn and
 *   hooks-runtime tests additionally need a registered pre_message hook
 *   (x_clio_hook_events.pre_message ≥ 1) — skipped gracefully otherwise.
 */

import { test, expect, chromium, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17803';
const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

// ---- backend feature probe (top-level, like audit.spec.ts) ----
interface HookCaps {
  reachable: boolean;
  semanticEvents: boolean;
  hookBackend: string;
  preMessageHooks: number;
}

let caps: HookCaps = {
  reachable: false,
  semanticEvents: false,
  hookBackend: '',
  preMessageHooks: 0,
};
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2000),
  });
  if (r.ok) {
    const j = (await r.json()) as {
      capabilities?: Record<string, unknown>;
    };
    const c = j.capabilities ?? {};
    caps = {
      reachable: true,
      semanticEvents: c['x_clio_semantic_events'] === true,
      hookBackend: typeof c['x_clio_hook_backend'] === 'string' ? c['x_clio_hook_backend'] : '',
      preMessageHooks:
        ((c['x_clio_hook_events'] as Record<string, number> | undefined)?.['pre_message']) ?? 0,
    };
  }
} catch {
  // unreachable — all tests skip below
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
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Create a fresh session via the API and select exactly its row. */
async function openFreshSession(page: Page): Promise<string> {
  const created = (await (
    await fetch(`${BACKEND}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
  ).json()) as { id: string };
  const sid = created.id;
  if (!sid) throw new Error('POST /v1/sessions returned no id');
  await page.getByTestId('sessions-refresh').click();
  const row = page.getByTestId(`session-row-${sid}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await page.waitForTimeout(600);
  return sid;
}

async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.pressSequentially(text, { delay: 8 });
  await page.getByTestId('composer-send').click();
}

test.setTimeout(240_000);

test.describe('clio #534 — semantic events + hooks', () => {
  test.skip(!caps.reachable, `no live clio at ${BACKEND}`);

  // ---- gap-01: hook-blocked turn renders, not a silent failure ----
  test('blocked turn renders a Turn-blocked pill on the user message (gap-01)', async () => {
    test.skip(
      caps.preMessageHooks < 1,
      'backend has no pre_message runtime hook registered (CLIO_HOOKS_DIR)',
    );
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await openFreshSession(page);

    // The registered test hook blocks any message containing BLOCKME.
    await send(page, 'Please tell me about BLOCKME and what it does.');

    // The pill must appear on the USER message — no LLM call happens, so
    // this is fast. Its absence was the gap-01 silent failure.
    const pill = page.locator('[data-testid^="msg-blocked-"]').first();
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(pill).toContainText(/blocked by test policy/i);

    // No assistant message may exist — clio never creates one for a
    // blocked turn.
    await expect(
      page.locator('[data-testid^="msg-msg_"].trx-msg--assistant'),
    ).toHaveCount(0);

    await page.screenshot({ path: shot('534-blocked-turn'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // ---- gap-01 follow-through: blocked session recovers ----
  test('a session recovers after a blocked turn — next clean turn completes (gap-01)', async () => {
    test.skip(
      caps.preMessageHooks < 1,
      'backend has no pre_message runtime hook registered (CLIO_HOOKS_DIR)',
    );
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await openFreshSession(page);

    await send(page, 'This message contains BLOCKME so it gets blocked.');
    await expect(
      page.locator('[data-testid^="msg-blocked-"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    // Now send a clean turn through the same session — proven live: clio
    // accepts new turns after a hook block (session error state is not
    // terminal).
    await send(
      page,
      `What is the capital of France? One word. (nonce ${Date.now()})`,
    );
    await expect(page.getByTestId('transcript-pane')).toContainText(/Paris/i, {
      timeout: 120_000,
    });
    await page.screenshot({ path: shot('534-blocked-then-recovered'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // ---- gap-03: semantic execution timeline in the Inspector ----
  test('inspector timeline shows semantic execution events for a real turn (gap-03)', async () => {
    test.skip(!caps.semanticEvents, 'backend does not advertise x_clio_semantic_events');
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await openFreshSession(page);

    await send(
      page,
      `What is the capital of France? One word. (nonce ${Date.now()})`,
    );
    await expect(page.getByTestId('transcript-pane')).toContainText(/Paris/i, {
      timeout: 120_000,
    });

    // Focus the turn: click the assistant message, open the Inspector
    // timeline tab.
    const asst = page
      .locator('[data-testid^="msg-msg_"].trx-msg--assistant')
      .first();
    await asst.click();
    const drawer = page.getByTestId('inspector-drawer');
    if (!(await drawer.isVisible())) {
      await page.getByTestId('topbar-inspector').click();
    }
    await page.getByTestId('inspector-tab-timeline').click();
    await expect(page.getByTestId('inspector-timeline')).toBeVisible();

    // Semantic rows render from the live semantic.event feed. Assert on
    // the real summaries clio emits (ground-truth trace):
    //   llm.request.started  → "LLM request started for CLIO orchestrator."
    //   turn.completed       → "CLIO turn completed."
    const timeline = page.getByTestId('inspector-timeline');
    await expect(timeline).toContainText(/LLM request|CLIO orchestrator/i, {
      timeout: 10_000,
    });
    await expect(timeline).toContainText(/turn completed/i);

    // Redaction honesty: redacted payload strings must never render as
    // content anywhere in the inspector.
    await expect(drawer).not.toContainText('[redacted]');

    await page.screenshot({ path: shot('534-semantic-timeline'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // ---- gap-07: binding provenance (workspace-management work) ----
  // Also proves the field-rename fix: current clio sends
  // `active_agent_blueprint_id` (not `blueprint_id`), so before the fix
  // the bound blueprint never displayed in the dropdown.
  test('inspector Bindings tab binds a blueprint and shows provenance (gap-07)', async () => {
    // The backend must list at least one blueprint for the tab to render.
    const bps = (await (
      await fetch(`${BACKEND}/v1/agent-blueprints`)
    ).json()) as { agent_blueprints?: Array<{ id: string }>; blueprints?: Array<{ id: string }> };
    const available = bps.agent_blueprints ?? bps.blueprints ?? [];
    test.skip(available.length === 0, 'backend has no agent blueprints installed');
    const bpId = available[0]!.id;

    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);
    await openFreshSession(page);

    const drawer = page.getByTestId('inspector-drawer');
    if (!(await drawer.isVisible())) {
      await page.getByTestId('topbar-inspector').click();
    }
    await page.getByTestId('inspector-tab-bindings').click();

    // Drive the REAL user flow: pick the blueprint in the dropdown →
    // POST /agent-blueprint → refetch → the binding + provenance render.
    await page.getByTestId('binding-blueprint').selectOption(bpId);

    // The bound blueprint displays in the dropdown after the refetch
    // (field-rename fix: clio sends active_agent_blueprint_id, which the
    // desktop now reads — before the fix this stayed on "— None —").
    await expect(page.getByTestId('binding-blueprint')).toHaveValue(bpId, {
      timeout: 15_000,
    });
    // The provenance block renders the real workspace + activation rows
    // from clio's workspace-management work (#479/#480/#482).
    await expect(page.getByTestId('binding-provenance')).toBeVisible();
    await expect(page.getByTestId('binding-workspace')).toContainText(/ws_/);
    await page.screenshot({ path: shot('534-binding-provenance'), fullPage: false });
    await ctx.close();
    await browser.close();
  });

  // ---- gaps 2/5/4: hooks settings page ----
  test('hooks page shows runtime-hook status + declarative add/delete round-trip (gaps 2/5/4)', async () => {
    const browser = await bootBrowser();
    const { ctx, page } = await openConnected(browser);

    await page.getByTestId('sessions-settings').click();
    await page.getByTestId('settings-nav-hooks').click();

    // -- gap-04: runtime hooks status panel (read-only, from capabilities)
    await expect(page.getByTestId('hooks-runtime-panel')).toBeVisible({
      timeout: 8_000,
    });
    if (caps.hookBackend) {
      await expect(page.getByTestId('hooks-runtime-backend')).toContainText(
        caps.hookBackend,
      );
    }
    if (caps.preMessageHooks >= 1) {
      await expect(
        page.getByTestId('hooks-runtime-count-pre_message'),
      ).toContainText(String(caps.preMessageHooks));
    }

    // -- gap-05: the event-kind select offers all 6 kinds
    const kinds = await page
      .getByTestId('hook-event')
      .locator('option')
      .allTextContents();
    for (const k of [
      'pre_tool',
      'post_tool',
      'pre_message',
      'post_message',
      'semantic_event',
      'on_error',
    ]) {
      expect(kinds.join(' ')).toContain(k);
    }

    // -- gap-02: declarative add round-trips against the REAL wire shape
    // ({event, command} — the old {type, handler_uri} body 400'd).
    await page.getByTestId('hook-event').selectOption('post_message');
    await page.getByTestId('hook-value').fill('echo 534-spec-probe');
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/hooks') && r.request().method() === 'POST',
        { timeout: 10_000 },
      ),
      page.getByTestId('hook-add').click(),
    ]);
    // The fix under test: clio must ACCEPT the body (not 400 it).
    expect(resp.status()).toBeLessThan(400);

    // The created row renders with event + command (not undefined).
    const newRow = page.locator('[data-testid^="hook-hook_"]').last();
    await expect(newRow).toBeVisible({ timeout: 8_000 });
    await expect(newRow).toContainText('post_message');
    await expect(newRow).toContainText('echo 534-spec-probe');
    await page.screenshot({ path: shot('534-hooks-page'), fullPage: false });

    // Cleanup: delete the probe hook so reruns stay clean.
    const rowTestId = (await newRow.getAttribute('data-testid')) ?? '';
    const hookId = rowTestId.replace(/^hook-/, '');
    await page.getByTestId(`hook-delete-${hookId}`).click();
    await expect(page.getByTestId(rowTestId)).toHaveCount(0, { timeout: 8_000 });
    await page.screenshot({ path: shot('534-hooks-deleted'), fullPage: false });

    await ctx.close();
    await browser.close();
  });
});
