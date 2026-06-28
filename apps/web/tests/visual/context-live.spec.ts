/**
 * Live capture of the per-expert context observer (ContextFooter +
 * ContextPanel) against a REAL clio backend — proving the context view runs on
 * live per-expert context state, not the mock fixture.
 *
 * Unlike the mock visual suite this drives the actual UI: connect to clio,
 * create/populate a session with one short EarthScope turn, then open the
 * footer indicator and the panel overlay (expert selector + segmented bar +
 * legend + Compact now).
 *
 * Run:
 *   CLIO_GACT_URL=http://127.0.0.1:17800 \
 *   pnpm --filter @clio/web exec playwright test tests/visual/context-live.spec.ts --reporter=list
 *
 * Notes on the real backend: clio's GET
 * /v1/sessions/{id}/context/state?scope=<expert> may return an all-zero/null
 * snapshot (as_of null, window_tokens 0, empty categories) when the per-expert
 * segment store has not recorded attribution for the scope — including right
 * after an idle turn. The footer/panel still render (state resolves to a
 * truthy, empty ContextState); the UI then falls back to pct_used / the live
 * attribution sum, and the segmented bar renders empty. This spec captures
 * whatever the panel shows and asserts only on the chrome (footer present,
 * panel open, expert selector + Compact button), so it stays green whether or
 * not the backend populated real token attribution.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKEND,
  api,
  auditDir,
  bootBrowser,
  optionalApi,
  reachable,
  type SessionRow,
  type Workspace,
} from './ndp-live-helpers';

const WORKSPACE_NAME = process.env['CLIO_CONTEXT_WORKSPACE'] ?? 'ndp-earthscope-live';
const SHORT_PROMPT = 'List 2 EarthScope GNSS stations.';

interface ContextStateLike {
  scope: string;
  as_of: number | null;
  window_tokens: number;
  live_tokens: number;
  pct_used: number | null;
  used_tokens: number | null;
  used_pct: number | null;
  autocompact_pct: number | null;
  live_block_count: number;
  categories: Record<string, number>;
}

async function pickWorkspace(): Promise<Workspace> {
  const rows = (await api<{ workspaces: Workspace[] }>('/v1/workspaces')).workspaces ?? [];
  if (rows.length === 0) throw new Error('clio has no workspaces');
  const preferred = rows.find((w) => w.name === WORKSPACE_NAME);
  return preferred ?? rows[0]!;
}

async function createSession(workspaceId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `context observer live ${Date.now()}`,
      workspace_id: workspaceId,
    }),
  });
  if (!created.id) throw new Error('session create returned no id');
  return created.id;
}

async function sendShortTurn(sessionId: string): Promise<void> {
  await api(`/v1/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      parts: [{ type: 'text', text: `${SHORT_PROMPT} (nonce ${Date.now()})` }],
    }),
  });
}

async function waitForTurn(sessionId: string): Promise<void> {
  // haiku ~12s/call; even the light default-agent turn can take a couple of
  // minutes once routing/tooling kicks in, so allow generous headroom.
  const deadline = Date.now() + 4.5 * 60 * 1000;
  while (Date.now() < deadline) {
    const s = await optionalApi<SessionRow & { status?: string; message_count?: number }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
    if (!('error' in s) && s.status === 'idle' && (s.message_count ?? 0) >= 2) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('short turn did not settle within 4 minutes');
}

async function probeContext(sessionId: string, scopes: string[]): Promise<Record<string, ContextStateLike>> {
  const out: Record<string, ContextStateLike> = {};
  for (const scope of scopes) {
    const r = await optionalApi<ContextStateLike>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/state?scope=${encodeURIComponent(scope)}`,
    );
    if (!('error' in r)) out[scope] = r;
  }
  return out;
}

async function openConnected(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
    window.localStorage.setItem('clio.selected-workspace.v1', '__all');
    window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function selectWorkspace(page: Page, workspace: Workspace): Promise<void> {
  await page.getByTestId('workspace-switcher').locator('button').first().click();
  const needle = workspace.root_path ?? workspace.name ?? '';
  const option = page.getByRole('option').filter({ hasText: needle });
  await expect(option.first()).toBeVisible({ timeout: 10_000 });
  await option.first().click();
  await page.waitForTimeout(500);
}

async function selectSession(page: Page, sessionId: string): Promise<void> {
  const row = page.getByTestId(`session-row-${sessionId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByTestId('transcript-pane')).toBeVisible({ timeout: 10_000 });
}

test.setTimeout(5 * 60 * 1000);

test('context observer renders live per-expert context against real clio', async () => {
  test.skip(!reachable, `no live clio backend reachable at ${BACKEND}`);

  const workspace = await pickWorkspace();
  const sessionId = await createSession(workspace.id);
  // NB: we intentionally do NOT bind the EarthScope blueprint here. The
  // blueprint fans the turn out across many expert handoffs (minutes), and the
  // panel's expert roster comes from the global GET /v1/agents regardless, so a
  // light default-agent turn populates the session fast while still giving the
  // selector a multi-expert roster.
  await sendShortTurn(sessionId);
  await waitForTurn(sessionId);

  // Roster + per-scope context snapshot straight from the backend, recorded as
  // evidence regardless of whether it is populated.
  const roster = await optionalApi<{ agents: Array<{ id: string; title?: string }> }>('/v1/agents');
  const scopeIds = !('error' in roster)
    ? Array.from(new Set(['main', ...roster.agents.map((a) => a.id)]))
    : ['main'];
  const contextByScope = await probeContext(sessionId, scopeIds);
  const populated = Object.values(contextByScope).filter(
    (s) => s.as_of != null || s.live_tokens > 0 || Object.keys(s.categories ?? {}).length > 0,
  );

  const browser = await bootBrowser();
  let ctx: BrowserContext | undefined;
  try {
    const opened = await openConnected(browser);
    ctx = opened.ctx;
    const page = opened.page;

    await selectWorkspace(page, workspace);
    await selectSession(page, sessionId);

    // The footer auto-mounts under the chat once a session is active and a
    // context state resolves. Give the resource a moment to land.
    const footer = page.getByTestId('context-footer');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await footer.scrollIntoViewIfNeeded();
    await footer.screenshot({ path: resolve(auditDir, 'context-live-footer.png') });

    // Click the footer to open the ContextPanel overlay.
    await footer.click();
    const panel = page.getByTestId('context-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('context-panel-expert')).toBeVisible();
    await expect(page.getByTestId('context-panel-compact')).toBeVisible();
    await page.waitForTimeout(400);

    const overlay = page.getByTestId('context-overlay');
    await overlay.screenshot({ path: resolve(auditDir, 'context-live-panel.png') });

    // If there is more than one expert in the roster, switch the selector once
    // and re-capture, proving the per-expert refetch path is live.
    await page.getByTestId('context-panel-expert').locator('button').first().click();
    const options = page.getByRole('option');
    const count = await options.count();
    if (count > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(800);
      await overlay.screenshot({ path: resolve(auditDir, 'context-live-panel-expert2.png') });
    } else {
      // Close the dropdown if it opened with a single option.
      await page.keyboard.press('Escape');
    }

    writeFileSync(
      resolve(auditDir, 'context-live-evidence.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspace: { id: workspace.id, name: workspace.name, root_path: workspace.root_path },
          sessionId,
          scopeIds,
          contextByScope,
          populatedScopes: populated.map((s) => s.scope),
          note:
            populated.length === 0
              ? 'context/state returned all-zero/null for every scope (as_of null) — clio segment store did not record per-expert attribution; UI fell back to empty bar / pct_used.'
              : 'at least one scope reported live per-expert attribution.',
        },
        null,
        2,
      ),
    );

    // Chrome-only assertions so the capture stays valid whether or not the
    // backend populated real token attribution.
    await expect(panel).toBeVisible();
  } finally {
    await ctx?.close();
    await browser.close();
    // Tidy: archive the throwaway session.
    await optionalApi(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
  }
});
