/**
 * Opt-in real-system streaming validation:
 *
 *   production web app -> isolated live CLIO backend -> real model turn ->
 *   transcript text evolves before the assistant turn finishes.
 */

import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED = process.env['CLIO_OVERNIGHT_REAL_UI'] === '1';
const REQUIRE_LIVE = process.env['CLIO_REQUIRE_LIVE_STREAMING'] === '1';
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
  parts?: Array<{ type?: string; text?: string }>;
}

interface StreamSample {
  elapsed_ms: number;
  ui_chars: number;
  api_chars: number;
  ui_active: boolean;
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

async function ensureStreamingAgent(): Promise<string> {
  const id = `streaming_probe_${Date.now()}`;
  await api('/v1/agents', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: 'Streaming Probe Agent',
      description: 'Answers directly so live UI streaming can be validated.',
      system_prompt: [
        'You are a direct conversational agent used for UI streaming validation.',
        'Answer the user directly in plain markdown.',
        'Do not ask for tools or child experts.',
        'Do not refuse ordinary writing tasks.',
      ].join(' '),
      tools: [],
      tier: 1,
      specialization: 'streaming_validation',
      keywords: ['streaming', 'validation'],
    }),
  });
  return id;
}

async function deleteAgent(agentId: string): Promise<void> {
  try {
    await api(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup only; old backends may not support deleting ad-hoc
    // validation agents.
  }
}

async function createSession(agentId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `overnight streaming ${Date.now()}`,
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

function assistantText(messages: Message[]): string {
  const msg = [...messages].reverse().find((candidate) => candidate.role === 'assistant');
  return (msg?.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n');
}

function assistantStopped(messages: Message[]): boolean {
  return messages.some((msg) => msg.role === 'assistant' && Boolean(msg.stop_reason || msg.error_info));
}

function assertionNeedle(text: string): RegExp {
  if (text.includes('Streaming Probe')) return /Streaming Probe/i;
  if (text.includes('field-note')) return /field-note/i;
  if (text.includes('observation')) return /observation/i;
  const word = text
    .split(/\s+/)
    .find((candidate) => /^[a-z][a-z-]{7,}$/i.test(candidate));
  return new RegExp(word ? word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '.', 'i');
}

function assistantStreamFallback(messages: Message[]): unknown {
  const msg = [...messages].reverse().find((candidate) => candidate.role === 'assistant');
  const metaFallback = (msg as Message & { metadata?: Record<string, unknown> } | undefined)
    ?.metadata?.['stream_fallback'];
  const textPart = (msg?.parts ?? []).find((part) => part.type === 'text') as
    | ({ metadata?: Record<string, unknown> })
    | undefined;
  return metaFallback ?? textPart?.metadata?.['stream_fallback'];
}

test.setTimeout(10 * 60 * 1000);

test('overnight real UI captures live streaming or truthful fallback evidence', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no CLIO backend reachable at ${BACKEND}`);

  const agentId = await ensureStreamingAgent();
  const sessionId = await createSession(agentId);
  const browser = await chromium.launch();
  const { ctx, page } = await openConnected(browser);
  const samples: StreamSample[] = [];
  let messages: Message[] = [];
  rmSync(shot('overnight-real-streaming-midturn'), { force: true });
  rmSync(shot('overnight-real-streaming-no-live-midturn'), { force: true });
  try {
    await selectSession(page, sessionId);
    await sendPrompt(
      page,
      [
        'Write a streaming probe response with 16 numbered observations.',
        'Each observation must be one complete sentence about careful field-note writing.',
        'Do not use tools. Do not include a table. Keep the title "Streaming Probe".',
      ].join(' '),
    );

    const start = Date.now();
    let earlyShotTaken = false;
    while (Date.now() - start < 120_000) {
      const raw = await api<{ messages: Message[] }>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      );
      messages = raw.messages ?? [];
      const apiText = assistantText(messages);
      const uiText = await page
        .locator('.trx-msg--assistant')
        .last()
        .innerText({ timeout: 500 })
        .catch(() => '');
      const uiActive = (await page.getByTestId('chat-typing').count()) > 0;
      const stopped = assistantStopped(messages);
      samples.push({
        elapsed_ms: Date.now() - start,
        ui_chars: uiText.length,
        api_chars: apiText.length,
        ui_active: uiActive,
        stopped,
      });
      if (!earlyShotTaken && uiText.length > 120 && uiActive && !stopped) {
        await page.screenshot({ path: shot('overnight-real-streaming-midturn'), fullPage: false });
        earlyShotTaken = true;
      }
      if (stopped) break;
      await page.waitForTimeout(750);
    }

    const finalApiText = assistantText(messages);
    expect(finalApiText.length).toBeGreaterThan(0);
    await expect(page.locator('.trx-msg--assistant').last()).toContainText(
      assertionNeedle(finalApiText),
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('chat-typing')).toHaveCount(0, { timeout: 20_000 });
    await page.screenshot({ path: shot('overnight-real-streaming-final'), fullPage: false });
    if (!earlyShotTaken) {
      await page.screenshot({
        path: shot('overnight-real-streaming-no-live-midturn'),
        fullPage: false,
      });
    }
    const nonFinalUiLengths = samples
      .filter((sample) => sample.ui_active && !sample.stopped && sample.ui_chars > 0)
      .map((sample) => sample.ui_chars);
    const liveUiSampleCount = new Set(nonFinalUiLengths).size;
    const fallback = assistantStreamFallback(messages);
    writeFileSync(
      resolve(auditDir, 'overnight-real-streaming-samples.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          agentId,
          sessionId,
          liveUiSampleCount,
          requireLive: REQUIRE_LIVE,
          fallback,
          samples,
          messages,
        },
        null,
        2,
      ),
    );

    expect(samples.some((sample) => sample.stopped)).toBe(true);
    if (REQUIRE_LIVE) {
      expect(liveUiSampleCount).toBeGreaterThanOrEqual(2);
    } else {
      expect(liveUiSampleCount >= 2 || Boolean(fallback)).toBe(true);
    }
  } finally {
    await ctx.close();
    await browser.close();
    await deleteAgent(agentId);
  }
});
