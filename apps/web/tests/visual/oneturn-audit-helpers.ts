import { expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_SEMANTICS_EXPECT, uniqueDataSemanticsPrompt } from './live-prompts.js';

export const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17801';

export const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

export let realBackendReachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(1500),
  });
  realBackendReachable = r.ok;
} catch {
  realBackendReachable = false;
}

export function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

export async function bootBrowser(): Promise<Browser> {
  return await chromium.launch({ args: ['--disable-web-security'] });
}

export async function openConnected(browser: Browser): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Returning-user profile: the first-run onboarding tour has its own
  // dedicated test in audit.spec.ts and must not overlay these flows.
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

export async function withConnectedPage<T>(
  run: (env: { browser: Browser; ctx: BrowserContext; page: Page }) => Promise<T>,
): Promise<T> {
  const browser = await bootBrowser();
  const { ctx, page } = await openConnected(browser);
  try {
    return await run({ browser, ctx, page });
  } finally {
    await ctx.close();
    await browser.close();
  }
}

let turnNonce = 0;

/** Create a fresh session, activate it, send one turn, wait for the
 * assistant text to render. Returns the message ids + session id so the
 * caller can target per-message UI and per-session APIs.
 *
 * Hardened (1.0 closure run): the session is created via the API and
 * selected by its EXACT row id. The old "click the first row" heuristic
 * silently landed in a pre-existing session whenever any older session
 * was pinned (pinned rows sort first), which broke every fresh-session
 * assumption downstream. */
export async function sendOneTurn(
  page: Page,
  text?: string,
): Promise<{ userMsgId: string; asstMsgId: string; sid: string }> {
  const created = (await (
    await fetch(`${BACKEND}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
  ).json()) as { id: string };
  const sid = created.id;
  if (!sid) throw new Error('POST /v1/sessions returned no id');

  // Unique nonce per turn: clio's planner rejects direct answers it
  // considers stale when the IDENTICAL prompt is replayed across runs
  // (DSPy LM cache -> routing_error "stale_or_invalid_answer_text").
  // A nonce keeps every test turn a real, fresh LM call.
  const prompt = text ?? uniqueDataSemanticsPrompt(`turn ${turnNonce++}: `);

  // Surface the new session in the UI list and select exactly it.
  await page.getByTestId('sessions-refresh').click();
  const row = page.getByTestId(`session-row-${sid}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await page.waitForTimeout(600);

  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.pressSequentially(prompt, { delay: 8 });
  await page.getByTestId('composer-send').click();

  // Wait for assistant text to land; the session is guaranteed fresh, so
  // the first assistant bubble is this turn's response.
  await expect(page.getByTestId('transcript-pane')).toContainText(DATA_SEMANTICS_EXPECT, {
    timeout: 120_000,
  });

  // Pull the two msg ids from the rendered DOM. Message containers are
  // `msg-<id>` where the id itself starts with `msg_`, so the container
  // testid is `msg-msg_...`. Action buttons are `msg-<verb>-msg_...`,
  // which do NOT start with `msg-msg_`.
  const msgIds = await page
    .locator('[data-testid^="msg-msg_"]')
    .evaluateAll((els: Element[]) =>
      els.map((e) => (e as HTMLElement).dataset['testid'] ?? ''),
    );
  const userMsgId = (msgIds[0] ?? '').replace(/^msg-/, '');
  const asstMsgId = (msgIds[1] ?? '').replace(/^msg-/, '');
  return { userMsgId, asstMsgId, sid };
}

/** Create a fresh session via the UI without waiting for an assistant
 * reply; used by flows that pause mid-turn, such as permission prompts. */
export async function startSessionFromUi(page: Page): Promise<void> {
  await page.getByTestId('sessions-new').click();
  await page.getByTestId('session-semantics-start').click();
  await page.waitForTimeout(1_200);
  await page.locator('[data-testid^="session-row-"]').first().click();
  await page.waitForTimeout(600);
}

export async function newSessionAndSend(page: Page, text: string): Promise<void> {
  await startSessionFromUi(page);
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.pressSequentially(text, { delay: 6 });
  await page.getByTestId('composer-send').click();
}
