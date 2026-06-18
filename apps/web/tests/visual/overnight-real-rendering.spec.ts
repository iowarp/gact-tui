/**
 * Opt-in real-system transcript rendering validation:
 *
 *   production web app -> isolated live CLIO backend -> real model response ->
 *   markdown table/list/code rendering in the transcript.
 *
 * This is not a default CI gate. It is for burn-in runs where screenshots and
 * backend messages are evidence that real CLIO output remains readable.
 */

import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED = process.env['CLIO_OVERNIGHT_REAL_UI'] === '1';
const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:18131';
const WORKSPACE_ID = process.env['CLIO_OVERNIGHT_WORKSPACE_ID'] ?? 'ws_default';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface SessionRow {
  id: string;
  title?: string;
  workspace_id?: string;
}

interface Message {
  id?: string;
  role?: string;
  stop_reason?: string;
  error_info?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}

let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2_000),
  });
  reachable = r.ok || r.status === 503;
} catch {
  reachable = false;
}

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} failed: ${r.status} ${body}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

async function ensureMarkdownAgent(): Promise<string> {
  const id = `markdown_probe_${Date.now()}`;
  await api('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: 'Markdown Rendering Probe Agent',
      description: 'Answers directly in markdown so transcript rendering can be validated.',
      system_prompt: [
        'You are a direct conversational agent used for UI rendering validation.',
        'Answer ordinary writing requests directly in markdown.',
        'Do not ask for tools or child experts.',
        'Do not refuse formatting-only requests.',
      ].join(' '),
      tools: [],
      tier: 1,
      specialization: 'rendering_validation',
      keywords: ['markdown', 'rendering', 'validation'],
    }),
  });
  return id;
}

async function deleteAgent(agentId: string): Promise<void> {
  try {
    await api(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup only; the screenshot evidence is more important than
    // failing the proof because an older backend cannot delete user agents.
  }
}

async function createSession(agentId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `overnight markdown rendering ${Date.now()}`,
      workspace_id: WORKSPACE_ID,
      routing_mode: 'chat',
      agent: { id: agentId },
    }),
  });
  return created.id;
}

async function openConnected(browser: Browser): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
    window.localStorage.setItem('clio.selected-workspace.v1', '__all');
    window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
    window.localStorage.setItem('clio.inspector-open.v1', 'false');
  });
  await page.route('**/v1/**', async (route) => {
    if (route.request().url().includes('/events')) {
      await route.continue();
      return;
    }
    const resp = await route.fetch();
    await route.fulfill({
      response: resp,
      headers: { ...resp.headers(), 'access-control-allow-origin': '*' },
    });
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  return { ctx, page };
}

async function selectSession(page: Page, sessionId: string): Promise<void> {
  const row = page.getByTestId(`session-row-${sessionId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('transcript-pane')).toBeVisible();
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.fill(prompt);
  await page.getByTestId('composer-send').click();
}

async function waitForAssistant(sessionId: string): Promise<Message[]> {
  const deadline = Date.now() + 8 * 60 * 1000;
  let last: Message[] = [];
  while (Date.now() < deadline) {
    const raw = await api<{ messages: Message[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    last = raw.messages ?? [];
    if (last.some((msg) => msg.role === 'assistant' && (msg.stop_reason || msg.error_info))) {
      return last;
    }
    await new Promise((resolveTick) => setTimeout(resolveTick, 2_000));
  }
  throw new Error(`assistant markdown rendering turn did not finish; last=${JSON.stringify(last).slice(0, 1000)}`);
}

test.setTimeout(10 * 60 * 1000);

test('overnight real UI renders a real markdown table list and code block', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const agentId = await ensureMarkdownAgent();
  const sessionId = await createSession(agentId);
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const { ctx, page } = await openConnected(browser);
  try {
    await selectSession(page, sessionId);
    await sendPrompt(
      page,
      [
        'Return only markdown. Do not wrap the whole answer in a code fence.',
        'Use exactly this structure:',
        '# Rendering Probe',
        '',
        '| Surface | Expected UI |',
        '| --- | --- |',
        '| table | rendered as a table |',
        '| list | rendered as bullets |',
        '| code | rendered as a fenced code block |',
        '',
        '- first bullet',
        '- second bullet with `inline_code_probe`',
        '',
        '```python',
        'def probe_rendering(value: int) -> int:',
        '    return value + 1',
        '```',
      ].join('\n'),
    );
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: shot('overnight-real-rendering-early'), fullPage: false });

    const messages = await waitForAssistant(sessionId);
    writeFileSync(
      resolve(auditDir, 'overnight-real-rendering-messages.json'),
      JSON.stringify({ backend: BACKEND, workspaceId: WORKSPACE_ID, sessionId, messages }, null, 2),
    );

    const assistant = page.locator('.trx-msg--assistant').last();
    const table = page.locator('.trx-msg--assistant .im__table').last();
    const list = page.locator('.trx-msg--assistant .im__list').last();
    const code = page.locator('.trx-msg--assistant .im__code').last();
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(code).toBeVisible({ timeout: 10_000 });
    await expect(assistant).toContainText('inline_code_probe', { timeout: 10_000 });
    await table.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.screenshot({ path: shot('overnight-real-rendering-table'), fullPage: false });
    await code.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.screenshot({ path: shot('overnight-real-rendering-settled'), fullPage: false });
  } finally {
    await deleteAgent(agentId);
    await ctx.close();
    await browser.close();
  }
});
