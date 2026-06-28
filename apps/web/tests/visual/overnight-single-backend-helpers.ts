import { chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const ENABLED = process.env['CLIO_OVERNIGHT_REAL_UI'] === '1';
export const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:18131';
export const WORKSPACE_ID = process.env['CLIO_OVERNIGHT_WORKSPACE_ID'] ?? 'ws_default';

export const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface SessionRow {
  id: string;
}

export let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(2_000),
  });
  reachable = r.ok || r.status === 503;
} catch {
  reachable = false;
}

export function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function deleteAgent(agentId: string): Promise<void> {
  try {
    await api(`/v1/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup only; screenshot evidence should not fail just
    // because an older backend cannot delete ad-hoc validation agents.
  }
}

export async function createAgentSession(agentId: string, title: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title,
      workspace_id: WORKSPACE_ID,
      routing_mode: 'chat',
      agent: { id: agentId },
    }),
  });
  return created.id;
}

export async function bootBrowser(args: string[] = []): Promise<Browser> {
  return await chromium.launch(args.length > 0 ? { args } : {});
}

export async function openConnected(browser: Browser): Promise<{
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

export async function selectSession(page: Page, sessionId: string): Promise<void> {
  const row = page.getByTestId(`session-row-${sessionId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('transcript-pane')).toBeVisible();
}

export async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const composer = page.getByTestId('composer-input');
  await composer.click();
  await composer.fill(prompt);
  await page.getByTestId('composer-send').click();
}
