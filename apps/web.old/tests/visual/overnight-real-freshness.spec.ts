/**
 * Opt-in real-system transcript freshness validation:
 *
 *   production web app opens a real CLIO session -> an external client posts a
 *   real turn to the same session -> the visible transcript updates without
 *   navigating away or re-entering the session.
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
}

interface Message {
  id?: string;
  role?: string;
  stop_reason?: string;
  error_info?: unknown;
  parts?: Array<{ type?: string; text?: string; metadata?: Record<string, unknown> }>;
}

interface FreshnessSample {
  elapsed_ms: number;
  ui_has_user_marker: boolean;
  ui_has_assistant_marker: boolean;
  api_message_count: number;
  stopped: boolean;
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

async function ensureFreshnessAgent(): Promise<string> {
  const id = `freshness_probe_${Date.now()}`;
  await api('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: 'Freshness Probe Agent',
      description: 'Answers directly so session update freshness can be validated.',
      system_prompt: [
        'You are a direct conversational agent used for UI freshness validation.',
        'Answer directly in one short sentence.',
        'Always include the exact marker token from the user prompt.',
        'Do not ask for tools or child experts.',
      ].join(' '),
      tools: [],
      tier: 1,
      specialization: 'freshness_validation',
      keywords: ['freshness', 'validation'],
    }),
  });
  return id;
}

async function deleteAgent(agentId: string): Promise<void> {
  try {
    await api(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup only; the freshness proof should still report the
    // UI/backend behavior even if an older backend cannot delete ad-hoc agents.
  }
}

async function createSession(agentId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `overnight freshness ${Date.now()}`,
      workspace_id: WORKSPACE_ID,
      routing_mode: 'chat',
      agent: { id: agentId },
    }),
  });
  return created.id;
}

async function openConnected(browser: Browser, opts: { blockEvents?: boolean } = {}): Promise<{
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
    if (opts.blockEvents && route.request().url().includes('/events')) {
      await route.abort();
      return;
    }
    await route.continue();
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

async function externalSend(sessionId: string, text: string): Promise<void> {
  await api(`/v1/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ parts: [{ type: 'text', text }] }),
  });
}

function stopped(messages: Message[]): boolean {
  return messages.some((msg) => msg.role === 'assistant' && Boolean(msg.stop_reason || msg.error_info));
}

async function waitForAssistantText(sessionId: string, marker: string): Promise<Message[]> {
  const deadline = Date.now() + 30_000;
  let messages: Message[] = [];
  while (Date.now() < deadline) {
    messages = (await api<{ messages: Message[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    )).messages ?? [];
    const text = messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.parts ?? [])
      .map((part) => part.text ?? '')
      .join('\n');
    if (text.includes(marker)) return messages;
    await new Promise((resolveTick) => setTimeout(resolveTick, 500));
  }
  throw new Error(`session ${sessionId} did not record assistant marker ${marker}; messages=${JSON.stringify(messages).slice(0, 1000)}`);
}

test.setTimeout(10 * 60 * 1000);

test('overnight real UI receives external session updates without re-entry', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const marker = `FRESHNESS_MARKER_${Date.now()}`;
  const agentId = await ensureFreshnessAgent();
  const sessionId = await createSession(agentId);
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const { ctx, page } = await openConnected(browser);
  const samples: FreshnessSample[] = [];
  let messages: Message[] = [];

  try {
    await selectSession(page, sessionId);
    await page.screenshot({ path: shot('overnight-real-freshness-before'), fullPage: false });

    await externalSend(
      sessionId,
      `External freshness probe. Reply with this exact marker: ${marker}`,
    );

    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const transcriptText = await page.getByTestId('transcript-pane').innerText();
      const assistantText = await page
        .locator('.trx-msg--assistant')
        .last()
        .innerText({ timeout: 500 })
        .catch(() => '');
      messages = (await api<{ messages: Message[] }>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      )).messages ?? [];
      const sample = {
        elapsed_ms: Date.now() - start,
        ui_has_user_marker: transcriptText.includes(marker),
        ui_has_assistant_marker: assistantText.includes(marker),
        api_message_count: messages.length,
        stopped: stopped(messages),
      };
      samples.push(sample);
      if (sample.ui_has_user_marker && sample.stopped) break;
      await page.waitForTimeout(750);
    }

    await expect(page.getByTestId('transcript-pane')).toContainText(marker, { timeout: 10_000 });
    await expect(page.locator('.trx-msg--assistant').last()).toContainText(marker, { timeout: 10_000 });
    const finalAssistantText = await page.locator('.trx-msg--assistant').last().innerText();
    const finalTranscriptText = await page.getByTestId('transcript-pane').innerText();
    await page.screenshot({ path: shot('overnight-real-freshness-after'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-freshness.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          agentId,
          sessionId,
          marker,
          finalUi: {
            transcriptHasMarker: finalTranscriptText.includes(marker),
            assistantHasMarker: finalAssistantText.includes(marker),
            assistantText: finalAssistantText,
          },
          samples,
          messages,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
    await deleteAgent(agentId);
  }
});

test('overnight real UI heals missed events on focus without session re-entry', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const marker = `FOCUS_RECONCILE_MARKER_${Date.now()}`;
  const agentId = await ensureFreshnessAgent();
  const sessionId = await createSession(agentId);
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const { ctx, page } = await openConnected(browser, { blockEvents: true });
  let messages: Message[] = [];

  try {
    await selectSession(page, sessionId);
    await externalSend(
      sessionId,
      `Focus reconcile probe. Reply with this exact marker: ${marker}`,
    );
    messages = await waitForAssistantText(sessionId, marker);

    const beforeFocusText = await page.getByTestId('transcript-pane').innerText();
    await page.screenshot({ path: shot('overnight-real-focus-reconcile-before'), fullPage: false });

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('transcript-pane')).toContainText(marker, { timeout: 10_000 });
    await expect(page.locator('.trx-msg--assistant').last()).toContainText(marker, { timeout: 10_000 });
    const afterFocusText = await page.getByTestId('transcript-pane').innerText();
    const assistantText = await page
      .locator('.trx-msg--assistant')
      .last()
      .innerText({ timeout: 500 })
      .catch(() => '');
    await page.screenshot({ path: shot('overnight-real-focus-reconcile-after'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-focus-reconcile.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          agentId,
          sessionId,
          marker,
          beforeFocus: {
            transcriptHasMarker: beforeFocusText.includes(marker),
            transcriptText: beforeFocusText,
          },
          afterFocus: {
            transcriptHasMarker: afterFocusText.includes(marker),
            assistantText,
            assistantHasMarker: assistantText.includes(marker),
          },
          messages,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
    await deleteAgent(agentId);
  }
});
