/**
 * Opt-in real-system first-impression validation:
 *
 *   production web app -> clean isolated CLIO backend -> empty chat opens as
 *   conversation-first, normal chat still exposes the sessions rail.
 */

import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED = process.env['CLIO_OVERNIGHT_REAL_UI'] === '1';
const BACKEND = process.env['CLIO_FIRST_IMPRESSION_URL'] ?? 'http://127.0.0.1:18132';
const WORKSPACE_ID = process.env['CLIO_FIRST_IMPRESSION_WORKSPACE_ID'] ?? 'ws_default';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface SessionRow {
  id: string;
  title?: string;
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

async function createSession(title: string): Promise<SessionRow> {
  return await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title,
      workspace_id: WORKSPACE_ID,
    }),
  });
}

async function clearSessions(): Promise<void> {
  const rows = (await api<{ sessions: SessionRow[] }>('/v1/sessions?include_all_workspaces=true')).sessions ?? [];
  for (const row of rows) {
    await api(`/v1/sessions/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
  }
}

interface OpenOptions {
  viewport?: { width: number; height: number };
  activeSessionId?: string;
  sessionsOpen?: boolean;
}

async function openConnected(browser: Browser, options: OpenOptions = {}): Promise<{
  ctx: BrowserContext;
  page: Page;
}> {
  const ctx = await browser.newContext(options.viewport ? { viewport: options.viewport } : undefined);
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ backend, activeSessionId, sessionsOpen }) => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
      window.localStorage.setItem('clio.sessions-open.v1', sessionsOpen ? 'true' : 'false');
      window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
      window.localStorage.setItem('clio.selected-workspace.v1', '__all');
      if (activeSessionId) {
        window.localStorage.setItem(`clio.active-session.${backend}`, activeSessionId);
      }
    },
    {
      backend: BACKEND,
      activeSessionId: options.activeSessionId ?? '',
      sessionsOpen: options.sessionsOpen ?? true,
    },
  );
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  return { ctx, page };
}

async function connectWithSeededBackend(options?: { width: number; height: number } | OpenOptions): Promise<{
  browser: Browser;
  ctx: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const normalized =
    options && 'width' in options
      ? { viewport: options, sessionsOpen: true }
      : (options ?? {});
  const { ctx, page } = await openConnected(browser, normalized);
  return { browser, ctx, page };
}

test.setTimeout(5 * 60 * 1000);

test('overnight real empty chat opens as a focused conversation surface', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const { browser, ctx, page } = await connectWithSeededBackend();
  try {
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.getByTestId('inspector-drawer')).toHaveCount(0);
    await expect(page.getByTestId('preview-rail')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toContainText(/Start the conversation|Pick a session or start fresh/i);
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-first-impression-empty'), fullPage: false });
    writeFileSync(
      resolve(auditDir, 'overnight-real-first-impression-empty.json'),
      JSON.stringify({ backend: BACKEND, workspaceId: WORKSPACE_ID, sessionsColumn: false }, null, 2),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('overnight real short desktop window keeps empty chat readable', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const { browser, ctx, page } = await connectWithSeededBackend({ width: 960, height: 600 });
  try {
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toContainText('Pick a session or start fresh', { timeout: 10_000 });
    await expect(page.getByText('wired into your workspace')).toBeVisible();
    await expect(page.locator('.chat__empty-prompts')).toBeHidden();
    await expect(page.locator('.chat__empty-tip')).toBeHidden();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-first-impression-short'), fullPage: false });
    writeFileSync(
      resolve(auditDir, 'overnight-real-first-impression-short.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          viewport: { width: 960, height: 600 },
          optionalPromptsHidden: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('overnight real mobile empty chat keeps the composer reachable', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const { browser, ctx, page } = await connectWithSeededBackend({ width: 390, height: 844 });
  try {
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toContainText('Pick a session or start fresh', { timeout: 10_000 });
    await expect(page.getByText('wired into your workspace')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await expect(page.getByTestId('backend-picker')).toBeVisible();
    await expect(page.locator('.chat__empty-prompts')).toBeHidden();
    await page.screenshot({ path: shot('overnight-real-first-impression-mobile'), fullPage: false });
    writeFileSync(
      resolve(auditDir, 'overnight-real-first-impression-mobile.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          viewport: { width: 390, height: 844 },
          sessionsColumn: false,
          composerVisible: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('overnight real mobile session keeps conversation first and opens the session drawer', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const stamp = Date.now();
  const session = await createSession(`mobile active ${stamp}`);
  const { browser, ctx, page } = await connectWithSeededBackend({
    viewport: { width: 390, height: 844 },
    activeSessionId: session.id,
    sessionsOpen: false,
  });
  try {
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toContainText('Start the conversation', { timeout: 10_000 });
    await expect(page.getByText(`mobile active ${stamp}`)).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-first-impression-mobile-session'), fullPage: false });

    await page.getByTestId('topbar-sessions').click({ timeout: 5_000 });
    await expect(page.getByTestId('sessions-column')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`session-row-${session.id}`)).toBeVisible({ timeout: 10_000 });
    const drawerBox = await page.getByTestId('sessions-column').boundingBox();
    expect(drawerBox?.width ?? 0).toBeGreaterThanOrEqual(388);
    await page.screenshot({ path: shot('overnight-real-first-impression-mobile-drawer'), fullPage: false });
    await page.getByTestId(`session-row-${session.id}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-first-impression-mobile-after-select'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-first-impression-mobile-session.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          viewport: { width: 390, height: 844 },
          session,
          drawerOpens: true,
          drawerClosesAfterSelect: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('overnight real mobile opens settings from the session drawer and returns to chat', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const stamp = Date.now();
  const session = await createSession(`mobile settings ${stamp}`);
  const { browser, ctx, page } = await connectWithSeededBackend({
    viewport: { width: 390, height: 844 },
    activeSessionId: session.id,
    sessionsOpen: false,
  });
  try {
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await page.getByTestId('topbar-sessions').click({ timeout: 5_000 });
    await expect(page.getByTestId('sessions-column')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sessions-settings')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });

    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('settings-back')).toContainText('Back to CLIO');
    await expect(page.getByTestId('settings-nav-about')).toBeVisible();
    await page.getByTestId('settings-nav-about').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-about')).toContainText('About CLIO Web', {
      timeout: 5_000,
    });
    await page.screenshot({ path: shot('overnight-real-mobile-settings-about'), fullPage: false });

    await page.getByTestId('settings-back').first().click({ timeout: 5_000 });
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sessions-column')).toHaveCount(0);
    await expect(page.locator('.chat__crumb-head')).toContainText(`mobile settings ${stamp}`, {
      timeout: 10_000,
    });
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-mobile-settings-return'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-mobile-settings.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceId: WORKSPACE_ID,
          viewport: { width: 390, height: 844 },
          session,
          settingsReachableFromDrawer: true,
          returnsToChat: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('overnight real normal chat still exposes sessions when sessions exist', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_REAL_UI=1 to run the overnight real-system proof');
  test.skip(!reachable, `no clean CLIO backend reachable at ${BACKEND}`);

  await clearSessions();
  const stamp = Date.now();
  const session = await createSession(`first impression normal ${stamp}`);
  const { browser, ctx, page } = await connectWithSeededBackend();
  try {
    await expect(page.getByTestId('sessions-column')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`session-row-${session.id}`)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${session.id}`).click();
    await expect(page.getByTestId('transcript-skeleton')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('transcript-pane')).toContainText('Start the conversation', { timeout: 10_000 });
    await expect(page.getByTestId('inspector-drawer')).toHaveCount(0);
    await expect(page.getByTestId('preview-rail')).toHaveCount(0);
    await expect(page.getByTestId('composer-input')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-first-impression-normal'), fullPage: false });
    writeFileSync(
      resolve(auditDir, 'overnight-real-first-impression-normal.json'),
      JSON.stringify({ backend: BACKEND, workspaceId: WORKSPACE_ID, session }, null, 2),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});
