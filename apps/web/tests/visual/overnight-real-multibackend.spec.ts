/**
 * Opt-in extended real-system UI validation:
 *
 *   web app -> two isolated CLIO backends -> real backend switching,
 *   settings, slash commands, workspace files, and file-list refresh.
 *
 * This is not a CI default. It assumes the caller already launched two
 * backend processes and wants screenshots/evidence from the real app.
 *
 * Run:
 *   CLIO_OVERNIGHT_EXTENDED_UI=1 \
 *   CLIO_BACKEND_A_URL=http://127.0.0.1:18131 \
 *   CLIO_BACKEND_B_URL=http://127.0.0.1:18132 \
 *   CLIO_WORKSPACE_A_ROOT=/tmp/.../backend-a/workspace \
 *   pnpm test:visual --grep "overnight extended real UI"
 */

import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED = process.env['CLIO_OVERNIGHT_EXTENDED_UI'] === '1';
const BACKEND_A = process.env['CLIO_BACKEND_A_URL'] ?? 'http://127.0.0.1:18131';
const BACKEND_B = process.env['CLIO_BACKEND_B_URL'] ?? 'http://127.0.0.1:18132';
const WORKSPACE_A_ROOT = process.env['CLIO_WORKSPACE_A_ROOT'] ?? '';

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

interface WorkspaceRow {
  id: string;
  name?: string;
  root_path?: string;
}

interface SessionRow {
  id: string;
  title?: string;
}

interface AgentRow {
  id?: string;
}

let reachableA = false;
let reachableB = false;
try {
  const [a, b] = await Promise.all([
    fetch(`${BACKEND_A}/v1/capabilities`, { signal: AbortSignal.timeout(2_000) }),
    fetch(`${BACKEND_B}/v1/capabilities`, { signal: AbortSignal.timeout(2_000) }),
  ]);
  reachableA = a.ok;
  reachableB = b.ok;
} catch {
  reachableA = false;
  reachableB = false;
}

function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

async function api<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${base} ${init.method ?? 'GET'} ${path} failed: ${r.status} ${body}`);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

async function diagnosticsJson<T>(base: string, path: string): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json' },
  });
  const body = (await r.json().catch(async () => {
    const text = await r.text().catch(() => '');
    return { error: text || `HTTP ${r.status}` };
  })) as T;
  if (r.status < 200 || r.status >= 600) {
    throw new Error(`${base} GET ${path} failed: ${r.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function cleanupValidationAgents(base: string): Promise<number> {
  const prefixes = [
    'file_editor_',
    'freshness_probe_',
    'streaming_probe_',
    'markdown_probe_',
  ];
  let deleted = 0;
  try {
    const agents = (await api<{ agents: AgentRow[] }>(base, '/v1/agents')).agents ?? [];
    for (const agent of agents) {
      const id = String(agent.id ?? '');
      if (!prefixes.some((prefix) => id.startsWith(prefix))) continue;
      try {
        await api(base, `/v1/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
        deleted += 1;
      } catch {
        // Best effort: stale validation agents should not block unrelated
        // catalog proof, but delete them when the backend supports it.
      }
    }
  } catch {
    // Older backends may not expose /v1/agents; keep the visual gate focused
    // on the catalog surface.
  }
  return deleted;
}

async function firstWorkspace(base: string): Promise<WorkspaceRow> {
  const rows = (await api<{ workspaces: WorkspaceRow[] }>(base, '/v1/workspaces')).workspaces;
  const row = rows[0];
  if (!row?.id) throw new Error(`${base} has no workspace`);
  return row;
}

async function workspaceByRoot(base: string, rootPath: string): Promise<WorkspaceRow> {
  const rows = (await api<{ workspaces: WorkspaceRow[] }>(base, '/v1/workspaces')).workspaces;
  const row = rows.find((workspace) => workspace.root_path === rootPath);
  if (row?.id) return row;
  if (!rootPath) return firstWorkspace(base);
  throw new Error(`${base} has no workspace rooted at ${rootPath}`);
}

async function createSession(base: string, workspaceId: string, title: string): Promise<SessionRow> {
  return await api<SessionRow>(base, '/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ title, workspace_id: workspaceId }),
  });
}

async function seedRegistry(page: Page, currentId = 'overnight:a'): Promise<void> {
  const [capsA, capsB] = await Promise.all([
    api<Record<string, unknown>>(BACKEND_A, '/v1/capabilities'),
    api<Record<string, unknown>>(BACKEND_B, '/v1/capabilities'),
  ]);
  await page.addInitScript(
    ({ backendA, backendB, capsASeed, capsBSeed, currentIdSeed }) => {
      window.localStorage.setItem('clio.onboarding-done.v1', '1');
      window.localStorage.setItem('clio.selected-workspace.v1', '__all');
      window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
      window.localStorage.setItem(
        'clio.backends.v1',
        JSON.stringify({
          backends: [
            {
              id: 'overnight:a',
              label: 'Overnight A',
              url: backendA,
              bearerToken: '',
              kind: 'http',
              capabilities: capsASeed,
            },
            {
              id: 'overnight:b',
              label: 'Overnight B',
              url: backendB,
              bearerToken: '',
              kind: 'http',
              capabilities: capsBSeed,
            },
          ],
          currentId: currentIdSeed,
        }),
      );
    },
    {
      backendA: BACKEND_A,
      backendB: BACKEND_B,
      capsASeed: capsA,
      capsBSeed: capsB,
      currentIdSeed: currentId,
    },
  );
}

async function allowBackendCors(page: Page): Promise<void> {
  if (process.env['CLIO_PLAYWRIGHT_CORS_SHIM'] !== '1') return;
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
}

async function openBrowser(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

test.setTimeout(8 * 60 * 1000);

test('overnight extended real UI switches between two CLIO backends', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA || !reachableB, `backends not reachable: A=${reachableA} B=${reachableB}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const workspaceB = await firstWorkspace(BACKEND_B);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight A ${stamp}`);
  const sessionB = await createSession(BACKEND_B, workspaceB.id, `overnight B ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('backend-picker')).toContainText('Overnight A', {
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${sessionA.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(`overnight B ${stamp}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-backend-a-sessions'), fullPage: false });

    await page.getByTestId('backend-picker').click({ timeout: 5_000 });
    await page.getByTestId('backend-picker-item-overnight:b').click({ timeout: 5_000 });
    await expect(page.getByTestId('backend-picker')).toContainText('Overnight B', {
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${sessionB.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(`overnight A ${stamp}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-backend-b-sessions'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-backend-switch.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        backendB: BACKEND_B,
        workspaceA,
        workspaceB,
        sessionA,
        sessionB,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI shows settings and refreshes real workspace files', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);
  test.skip(!WORKSPACE_A_ROOT, 'set CLIO_WORKSPACE_A_ROOT to validate live file refresh');

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight file refresh ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  const readmePath = resolve(WORKSPACE_A_ROOT, 'README.md');
  const createdPath = resolve(WORKSPACE_A_ROOT, `agent-created-${stamp}.md`);
  try {
    writeFileSync(
      readmePath,
      [
        '# Evidence Checklist',
        '',
        '- Workspace markdown preview should render this file.',
        '- File refresh should reveal artifacts created after the session opens.',
        '',
      ].join('\n'),
    );
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('backend-picker')).toContainText('Overnight A', {
      timeout: 10_000,
    });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('preview-rail')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('overnight-real-selected-session-before-settings'), fullPage: false });

    await expect(page.getByTestId('sessions-settings')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-backends')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Overnight A')).toBeVisible();
    await expect(page.getByText('Overnight B')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-settings-backends'), fullPage: false });
    await page.getByTestId('settings-back').first().click({ timeout: 5_000 });
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('preview-rail-filter').fill('README.md');
    await expect(page.getByTestId('preview-rail-row-README.md')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('preview-rail-row-README.md').click({ timeout: 5_000 });
    await expect(page.getByTestId('preview-rail-markdown')).toContainText('Evidence Checklist', {
      timeout: 10_000,
    });

    writeFileSync(
      createdPath,
      `# Agent Created Artifact\n\nCreated during extended live UI validation ${stamp}.\n`,
    );
    await page.getByTestId('preview-rail-filter').fill(`agent-created-${stamp}.md`);
    await expect(page.getByTestId('preview-rail-empty')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('preview-rail-refresh').click({ timeout: 5_000 });
    await expect(page.getByTestId(`preview-rail-row-agent-created-${stamp}.md`)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId(`preview-rail-row-agent-created-${stamp}.md`).click({ timeout: 5_000 });
    await expect(page.getByTestId('preview-rail-markdown')).toContainText('Agent Created Artifact', {
      timeout: 10_000,
    });
    await page.screenshot({ path: shot('overnight-real-file-refresh'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-file-refresh.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        createdPath,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI exposes session defaults and Ctrl+B session semantics', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight session semantics ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-session-defaults').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-session-defaults')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('session-default-blueprint')).toBeVisible();
    await expect(page.getByTestId('session-default-expert-pack')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-session-defaults-settings'), fullPage: false });

    await page.getByTestId('settings-back').click({ timeout: 5_000 });
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Control+B');
    await expect(page.getByTestId('session-semantics-modal')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('session-semantics-blueprint')).toBeVisible();
    await expect(page.getByTestId('session-semantics-expert-pack')).toBeVisible();
    await expect(page.getByTestId('session-semantics-save-default')).toBeVisible();
    await page.screenshot({ path: shot('overnight-real-session-semantics-modal'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-session-semantics.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        settings_screenshot: 'overnight-real-session-defaults-settings.png',
        modal_screenshot: 'overnight-real-session-semantics-modal.png',
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI dispatches a backend slash command', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight command ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  let status = 0;
  let url = '';
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });

    await page.getByTestId('composer-command').click({ timeout: 5_000 });
    await expect(page.getByTestId('slash-palette')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('slash-palette-input').fill('cache');
    await expect(page.locator('[data-testid^="slash-palette-item-"]').filter({ hasText: '/cache-stats' })).toBeVisible({
      timeout: 5_000,
    });
    const commandResponse = page.waitForResponse(
      (r) => /\/v1\/sessions\/.+\/commands\//.test(r.url()) && r.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await page.locator('[data-testid^="slash-palette-item-"]').filter({ hasText: '/cache-stats' }).first().click({ timeout: 5_000 });
    const resp = await commandResponse;
    status = resp.status();
    url = resp.url();
    expect(resp.ok()).toBe(true);
    await expect(page.getByTestId('command-result-card')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('command-result-card')).toContainText('/cache-stats');
    await expect(page.getByTestId('command-result-card')).toContainText(/ARC cache/i);
    await page.screenshot({ path: shot('overnight-real-command-cache-stats'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-command-cache-stats.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        status,
        url,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI searches the live unified catalog', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const validationAgentsDeleted = await cleanupValidationAgents(BACKEND_A);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight catalog ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  const categories: string[] = [];
  let filteredCount = 0;
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });

    await page.keyboard.press('Control+Shift+K');
    await expect(page.getByTestId('catalog-browser')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.cbr__group-head').filter({ hasText: 'Agents' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.cbr__group-head').filter({ hasText: 'Workspaces' })).toBeVisible({
      timeout: 10_000,
    });
    categories.push(
      ...(await page.locator('.cbr__group-head span:nth-child(2)').evaluateAll((nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      )),
    );
    await page.screenshot({ path: shot('overnight-real-catalog-all'), fullPage: false });

    await page.getByTestId('catalog-browser-input').fill('workspace');
    await expect(page.locator('[data-testid^="catalog-item-"]').first()).toBeVisible({
      timeout: 5_000,
    });
    filteredCount = await page.locator('[data-testid^="catalog-item-"]').count();
    await page.screenshot({ path: shot('overnight-real-catalog-filtered'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  expect(categories.length).toBeGreaterThan(0);
  expect(filteredCount).toBeGreaterThan(0);
  writeFileSync(
    resolve(auditDir, 'overnight-real-catalog.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        categories,
        filteredCount,
        validationAgentsDeleted,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI expands live MCP server details', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight mcp detail ${stamp}`);
  const serverList = await api<{ servers: Array<{ id: string; name: string; status?: string; tools_count?: number }> }>(
    BACKEND_A,
    '/v1/mcp/servers',
  );
  const target =
    serverList.servers.find((server) => server.status === 'ready' && (server.tools_count ?? 0) > 0) ??
    serverList.servers.find((server) => (server.tools_count ?? 0) > 0) ??
    serverList.servers[0];

  if (!target) {
    test.skip(true, `${BACKEND_A} returned no MCP servers`);
    return;
  }

  const { browser, ctx, page } = await openBrowser();
  let detailSections: string[] = [];
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-mcp').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible({ timeout: 10_000 });

    const card = page.getByTestId(`mcp-card-${target.id}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTestId(`mcp-expand-${target.id}`).click({ timeout: 5_000 });
    await expect(card.locator('.mcp__detail')).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('.mcp__detail-status').filter({ hasText: 'Loading' })).toHaveCount(0, {
      timeout: 10_000,
    });
    detailSections = await card.locator('.mcp__detail-title').evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean),
    );
    await page.screenshot({ path: shot('overnight-real-mcp-detail'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  expect(detailSections.length).toBeGreaterThan(0);
  writeFileSync(
    resolve(auditDir, 'overnight-real-mcp-detail.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        target,
        detailSections,
        servers: serverList.servers,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI installs, reconnects, and uninstalls an MCP server', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const serverName = `everything_live_${stamp}`;
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight mcp lifecycle ${stamp}`);
  const beforeServers = await api<{ servers: unknown[] }>(BACKEND_A, '/v1/mcp/servers');

  const { browser, ctx, page } = await openBrowser();
  let installedId = '';
  let installStatus = 0;
  let reconnectStatus = 0;
  let deleteStatus = 0;
  let afterInstallServers: unknown = null;
  let afterDeleteServers: unknown = null;
  try {
    page.on('dialog', (dialog) => void dialog.accept());
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-mcp').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-mcp-servers')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('mcp-install-open').click({ timeout: 5_000 });
    await expect(page.getByTestId('mcp-install-modal')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('mcp-install-name').fill(serverName);
    await page.getByTestId('mcp-install-command').fill('npx');
    await page
      .getByTestId('mcp-install-args')
      .fill('-y\n@modelcontextprotocol/server-everything');
    await page.screenshot({ path: shot('overnight-real-mcp-install-form'), fullPage: false });

    const [installResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/v1/mcp/servers') && r.request().method() === 'POST',
        { timeout: 45_000 },
      ),
      page.getByTestId('mcp-install-submit').click({ timeout: 5_000 }),
    ]);
    installStatus = installResponse.status();
    expect(installResponse.ok()).toBe(true);
    const installBody = (await installResponse.json()) as { id?: string };
    installedId = installBody.id ?? '';
    expect(installedId).toMatch(/^mcp_/);

    const installedCard = page.getByTestId(`mcp-card-${installedId}`);
    await expect(installedCard).toBeVisible({ timeout: 20_000 });
    await expect(installedCard).toContainText(serverName);
    await expect(installedCard).toContainText('ready');
    await expect(installedCard).toContainText('13 tools');
    afterInstallServers = await api(BACKEND_A, '/v1/mcp/servers');
    await installedCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('overnight-real-mcp-installed'), fullPage: false });

    await installedCard.getByTestId(`mcp-expand-${installedId}`).click({ timeout: 5_000 });
    await expect(installedCard.locator('.mcp__detail')).toBeVisible({ timeout: 10_000 });
    await expect(
      installedCard.locator('.mcp__detail .mcp__detail-name').filter({ hasText: 'echo' }),
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('overnight-real-mcp-expanded'), fullPage: false });

    const [reconnectResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/mcp/servers/${installedId}/reconnect`) &&
          r.request().method() === 'POST',
        { timeout: 45_000 },
      ),
      installedCard.getByTestId(`mcp-reconnect-${installedId}`).click({ timeout: 5_000 }),
    ]);
    reconnectStatus = reconnectResponse.status();
    expect(reconnectResponse.ok()).toBe(true);
    await expect(installedCard).toContainText('ready', { timeout: 20_000 });
    await page.screenshot({ path: shot('overnight-real-mcp-reconnected'), fullPage: false });

    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/mcp/servers/${installedId}`) &&
          r.request().method() === 'DELETE',
        { timeout: 20_000 },
      ),
      installedCard.getByTestId(`mcp-uninstall-${installedId}`).click({ timeout: 5_000 }),
    ]);
    deleteStatus = deleteResponse.status();
    expect(deleteStatus).toBeLessThan(400);
    await expect(page.getByTestId(`mcp-card-${installedId}`)).toHaveCount(0, {
      timeout: 20_000,
    });
    afterDeleteServers = await api(BACKEND_A, '/v1/mcp/servers');
    await page.screenshot({ path: shot('overnight-real-mcp-deleted'), fullPage: false });
    installedId = '';
  } finally {
    await ctx.close();
    await browser.close();
    if (installedId) {
      await fetch(`${BACKEND_A}/v1/mcp/servers/${encodeURIComponent(installedId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-mcp-lifecycle.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        serverName,
        installStatus,
        reconnectStatus,
        deleteStatus,
        beforeServers,
        afterInstallServers,
        afterDeleteServers,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI validates and saves a live prompt draft', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight prompt save ${stamp}`);
  const promptList = await api<{ prompts: Array<{ id: string; title?: string; scope?: string }> }>(
    BACKEND_A,
    '/v1/prompts',
  );
  const target =
    promptList.prompts.find((prompt) => prompt.id === 'clio.chat') ?? promptList.prompts[0];
  if (!target) {
    test.skip(true, `${BACKEND_A} returned no prompts`);
    return;
  }

  const { browser, ctx, page } = await openBrowser();
  let resultText = '';
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-prompts').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-prompts')).toBeVisible({ timeout: 10_000 });

    const card = page.getByTestId(`prompt-card-${target.id}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click({ timeout: 5_000 });
    await expect(page.getByTestId('prompt-edit-text')).toBeVisible({ timeout: 10_000 });

    const editor = page.getByTestId('prompt-edit-text');
    const original = await editor.inputValue();
    await editor.fill(`${original}\n\nUI validation marker ${stamp}.`);
    await page.getByTestId('prompt-save-scope').selectOption('session');
    await page.getByTestId('prompt-validate').click({ timeout: 5_000 });
    await expect(page.getByTestId('prompt-save-result')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('prompt-save').click({ timeout: 5_000 });
    await expect(page.getByTestId('prompt-save-result')).toContainText('Saved', {
      timeout: 10_000,
    });
    resultText = (await page.getByTestId('prompt-save-result').textContent())?.trim() ?? '';
    await page.screenshot({ path: shot('overnight-real-prompt-save'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  expect(resultText).toContain('Saved');
  writeFileSync(
    resolve(auditDir, 'overnight-real-prompt-save.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        target,
        resultText,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI installs, updates, and deletes an expert pack', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  test.skip(!workspaceA.root_path, 'backend workspace has no root_path for pack source creation');
  const stamp = Date.now();
  const packId = `toolkit-live-${stamp}`;
  const marketplaceRoot = resolve(workspaceA.root_path!, `expert-pack-marketplace-${stamp}`);
  const packRoot = resolve(marketplaceRoot, packId);
  mkdirSync(resolve(packRoot, 'experts'), { recursive: true });
  writeFileSync(
    resolve(packRoot, 'AGENT.md'),
    `---\nid: ${packId}\nversion: 0.1.0\ntitle: Live Toolkit ${stamp}\n---\nA loose pack installed through the web UI live gate.\n`,
  );
  writeFileSync(
    resolve(packRoot, 'experts', 'helper.md'),
    `---\nid: helper\ntitle: Helper Expert\ntier: 1\n---\nA helper expert for the live web UI lifecycle gate.\n`,
  );
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight expert packs ${stamp}`);
  const beforePacks = await api<{ expert_packs?: unknown[]; packs?: unknown[] }>(
    BACKEND_A,
    `/v1/expert-packs?workspace_id=${encodeURIComponent(workspaceA.id)}`,
  );

  const { browser, ctx, page } = await openBrowser();
  let afterInstallBlueprints: unknown = null;
  let afterDeleteBlueprints: unknown = null;
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-expert-packs').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-expert-packs')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('expertpack-validate-toggle').click({ timeout: 5_000 });
    await expect(page.getByTestId('expertpack-validate-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('expertpack-validate-scope')).toHaveValue('workspace');
    await page.getByTestId('expertpack-validate-input').fill(marketplaceRoot);
    await page.screenshot({ path: shot('overnight-real-expert-packs-install-form'), fullPage: false });

    await page.getByTestId('expertpack-install-submit').click({ timeout: 5_000 });
    await expect(page.getByTestId('expertpack-verdict')).toContainText('Installed', {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`expertpack-${packId}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`expertpack-${packId}`)).toContainText('pack');
    await expect(page.getByTestId(`expertpack-${packId}`)).toContainText('workspace');
    afterInstallBlueprints = await api(
      BACKEND_A,
      `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceA.id)}`,
    );
    await page.screenshot({ path: shot('overnight-real-expert-packs-installed'), fullPage: false });

    await page.getByTestId(`expertpack-update-${packId}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('expertpack-verdict')).toContainText(`Updated ${packId}`, {
      timeout: 20_000,
    });
    await page.screenshot({ path: shot('overnight-real-expert-packs-updated'), fullPage: false });

    await page.getByTestId(`expertpack-delete-${packId}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('expertpack-verdict')).toContainText(`Deleted ${packId}`, {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`expertpack-${packId}`)).toHaveCount(0, { timeout: 20_000 });
    afterDeleteBlueprints = await api(
      BACKEND_A,
      `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceA.id)}`,
    );
    await page.screenshot({ path: shot('overnight-real-expert-packs-deleted'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-expert-packs.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        packId,
        marketplaceRoot,
        beforePacks,
        afterInstallBlueprints,
        afterDeleteBlueprints,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI installs and uninstalls an agent blueprint', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  test.skip(!workspaceA.root_path, 'backend workspace has no root_path for blueprint source creation');
  const stamp = Date.now();
  const blueprintId = `workflow-live-${stamp}`;
  const blueprintRoot = resolve(workspaceA.root_path!, `agent-blueprint-source-${stamp}`, blueprintId);
  mkdirSync(resolve(blueprintRoot, 'experts'), { recursive: true });
  writeFileSync(
    resolve(blueprintRoot, 'AGENT.md'),
    `---\nid: ${blueprintId}\nversion: 0.1.0\ntitle: Live Workflow ${stamp}\ndescription: Workspace blueprint installed through the web UI live gate.\nroot_expert: main\nblueprint:\n  format: agent-blueprint-v1\nexperts:\n  - experts/main.md\n---\nA workflow blueprint installed through Settings.\n`,
  );
  writeFileSync(
    resolve(blueprintRoot, 'experts', 'main.md'),
    `---\nid: main\ntitle: Main Expert\ntier: 1\n---\nA minimal orchestrator expert for the live web UI lifecycle gate.\n`,
  );
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight blueprint ${stamp}`);
  const beforeBlueprints = await api(
    BACKEND_A,
    `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceA.id)}`,
  );

  const { browser, ctx, page } = await openBrowser();
  let afterInstallBlueprints: unknown = null;
  let afterDeleteBlueprints: unknown = null;
  try {
    page.on('dialog', (dialog) => void dialog.accept());
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-blueprints').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-agent-blueprints')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('blueprint-install-toggle').click({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-install-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-install-scope')).toHaveValue('workspace');
    await page.getByTestId('blueprint-install-input').fill(blueprintRoot);
    await page.screenshot({ path: shot('overnight-real-blueprints-install-form'), fullPage: false });

    await page.getByTestId('blueprint-install-submit').click({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-verdict')).toContainText('Installed', {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`blueprint-${blueprintId}`)).toBeVisible({ timeout: 20_000 });
    afterInstallBlueprints = await api(
      BACKEND_A,
      `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceA.id)}`,
    );
    await page.getByTestId(`blueprint-${blueprintId}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('overnight-real-blueprints-installed'), fullPage: false });

    await page.getByTestId(`blueprint-uninstall-${blueprintId}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-verdict')).toContainText(`Uninstalled Live Workflow ${stamp}`, {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`blueprint-${blueprintId}`)).toHaveCount(0, { timeout: 20_000 });
    afterDeleteBlueprints = await api(
      BACKEND_A,
      `/v1/agent-blueprints?workspace_id=${encodeURIComponent(workspaceA.id)}`,
    );
    await page.screenshot({ path: shot('overnight-real-blueprints-deleted'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-blueprints.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        blueprintId,
        blueprintRoot,
        beforeBlueprints,
        afterInstallBlueprints,
        afterDeleteBlueprints,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI adds, refreshes, and removes a blueprint source', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  test.skip(!workspaceA.root_path, 'backend workspace has no root_path for source registry proof');
  const stamp = Date.now();
  const sourceName = `live-source-${stamp}`;
  const sourceRoot = resolve(workspaceA.root_path!, `blueprint-registry-source-${stamp}`);
  const blueprintId = `source-workflow-${stamp}`;
  const blueprintRoot = resolve(sourceRoot, blueprintId);
  mkdirSync(resolve(blueprintRoot, 'experts'), { recursive: true });
  writeFileSync(
    resolve(blueprintRoot, 'AGENT.md'),
    `---\nid: ${blueprintId}\nversion: 0.1.0\ntitle: Source Workflow ${stamp}\nroot_expert: main\nblueprint:\n  format: agent-blueprint-v1\nexperts:\n  - experts/main.md\n---\nBlueprint source registry live proof.\n`,
  );
  writeFileSync(
    resolve(blueprintRoot, 'experts', 'main.md'),
    `---\nid: main\ntitle: Main Expert\ntier: 1\n---\nA minimal source-registry expert.\n`,
  );
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight blueprint source ${stamp}`);
  const beforeSources = await api(BACKEND_A, '/v1/agent-blueprints/sources');

  const { browser, ctx, page } = await openBrowser();
  let sourceId = '';
  let afterAddSources: { sources: Array<{ id: string; name?: string; source?: string }> } | null = null;
  let afterRefreshSources: unknown = null;
  let afterDeleteSources: unknown = null;
  try {
    page.on('dialog', (dialog) => void dialog.accept());
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-nav-blueprints').click({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-sources-panel')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('blueprint-source-input').fill(sourceRoot);
    await page.getByTestId('blueprint-source-name').fill(sourceName);
    await page.screenshot({ path: shot('overnight-real-blueprint-sources-add-form'), fullPage: false });

    await page.getByTestId('blueprint-source-add').click({ timeout: 5_000 });
    await expect(page.getByTestId('blueprint-sources-list')).toContainText(sourceName, {
      timeout: 20_000,
    });
    afterAddSources = await api<{ sources: Array<{ id: string; name?: string; source?: string }> }>(
      BACKEND_A,
      '/v1/agent-blueprints/sources',
    );
    sourceId =
      afterAddSources.sources.find((source) => source.source === sourceRoot || source.name === sourceName)
        ?.id ?? '';
    expect(sourceId).toBeTruthy();
    await page.getByTestId(`blueprint-source-row-${sourceId}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('overnight-real-blueprint-sources-added'), fullPage: false });

    await page.getByTestId(`blueprint-source-refresh-${sourceId}`).click({ timeout: 5_000 });
    await expect(page.getByTestId(`blueprint-source-row-${sourceId}`)).toContainText(/ready|ok|synced/i, {
      timeout: 20_000,
    });
    afterRefreshSources = await api(BACKEND_A, '/v1/agent-blueprints/sources');
    await page.screenshot({ path: shot('overnight-real-blueprint-sources-refreshed'), fullPage: false });

    await page.getByTestId(`blueprint-source-remove-${sourceId}`).click({ timeout: 5_000 });
    await expect(page.getByTestId(`blueprint-source-row-${sourceId}`)).toHaveCount(0, {
      timeout: 20_000,
    });
    afterDeleteSources = await api(BACKEND_A, '/v1/agent-blueprints/sources');
    await page.screenshot({ path: shot('overnight-real-blueprint-sources-deleted'), fullPage: false });
    sourceId = '';
  } finally {
    await ctx.close();
    await browser.close();
    if (sourceId) {
      await fetch(`${BACKEND_A}/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-blueprint-sources.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        sourceName,
        sourceRoot,
        beforeSources,
        afterAddSources,
        afterRefreshSources,
        afterDeleteSources,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI renders live diagnostics pages', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight diagnostics ${stamp}`);
  const [metrics, health, memory] = await Promise.all([
    api<Record<string, unknown>>(BACKEND_A, '/v1/metrics'),
    diagnosticsJson<Record<string, unknown>>(BACKEND_A, '/v1/health'),
    api<Record<string, unknown>>(BACKEND_A, '/v1/memory/stats'),
  ]);

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('settings-nav-metrics').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-metrics')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.dp__section-title').filter({ hasText: 'Backend latency' })).toBeVisible({
      timeout: 10_000,
    });
    const latencyStats = page.getByTestId('metrics-latency-stats');
    const latencyEmpty = page.getByTestId('metrics-latency-empty');
    await expect
      .poll(
        async () => {
          if ((await latencyStats.count()) > 0) return 'stats';
          if ((await latencyEmpty.count()) > 0) return 'empty';
          return 'pending';
        },
        { timeout: 10_000 },
      )
      .not.toBe('pending');
    if ((await latencyStats.count()) > 0) {
      await latencyStats.scrollIntoViewIfNeeded();
    } else {
      await latencyEmpty.scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: shot('overnight-real-diagnostics-metrics'), fullPage: false });

    await page.getByTestId('settings-nav-doctor').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-doctor')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('overall')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('doctor-integrations')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('overnight-real-diagnostics-doctor'), fullPage: false });

    await page.getByTestId('settings-nav-memory').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-memory')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.dp__section-title').filter({ hasText: 'Cache' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('memory-events-list')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('overnight-real-diagnostics-memory'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }

  writeFileSync(
    resolve(auditDir, 'overnight-real-diagnostics.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        metrics,
        health,
        memory,
      },
      null,
      2,
    ),
  );
});

test('overnight extended real UI round-trips live hooks and policies', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);

  const workspaceA = WORKSPACE_A_ROOT
    ? await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT)
    : await firstWorkspace(BACKEND_A);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `overnight hooks policies ${stamp}`);
  let createdHookId = '';
  let hookPostStatus = 0;
  let hookDeleteStatus = 0;
  let policiesPutStatus = 0;

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await allowBackendCors(page);

    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('settings-nav-hooks').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-hooks')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('hooks-runtime-panel')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('hook-event').selectOption('post_message');
    await page.getByTestId('hook-value').fill(`echo overnight-hook-${stamp}`);
    const [hookPost] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/hooks') && r.request().method() === 'POST',
        { timeout: 10_000 },
      ),
      page.getByTestId('hook-add').click({ timeout: 5_000 }),
    ]);
    hookPostStatus = hookPost.status();
    expect(hookPost.ok()).toBe(true);
    const hookBody = (await hookPost.json()) as { id?: string };
    createdHookId = hookBody.id ?? '';
    expect(createdHookId).toMatch(/^hook_/);
    const hookRow = page.getByTestId(`hook-${createdHookId}`);
    await expect(hookRow).toBeVisible({ timeout: 10_000 });
    await expect(hookRow).toContainText(`echo overnight-hook-${stamp}`);
    await page.screenshot({ path: shot('overnight-real-hooks-created'), fullPage: false });

    const [hookDelete] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/v1/hooks/${createdHookId}`) &&
          r.request().method() === 'DELETE',
        { timeout: 10_000 },
      ),
      page.getByTestId(`hook-delete-${createdHookId}`).click({ timeout: 5_000 }),
    ]);
    hookDeleteStatus = hookDelete.status();
    expect(hookDeleteStatus).toBeLessThan(400);
    await expect(page.getByTestId(`hook-${createdHookId}`)).toHaveCount(0, {
      timeout: 10_000,
    });
    await page.screenshot({ path: shot('overnight-real-hooks-deleted'), fullPage: false });
    createdHookId = '';

    await page.getByTestId('settings-nav-policies').click({ timeout: 5_000 });
    await expect(page.getByTestId('dp-policies')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No policy entries configured')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('policies-edit').click({ timeout: 5_000 });
    await expect(page.getByTestId('policies-editor')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('policies-editor')).toHaveValue('[]');
    const [policiesPut] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/policies') && r.request().method() === 'PUT',
        { timeout: 10_000 },
      ),
      page.getByTestId('policies-save').click({ timeout: 5_000 }),
    ]);
    policiesPutStatus = policiesPut.status();
    expect(policiesPut.ok()).toBe(true);
    await expect(page.getByTestId('policies-save-result')).toContainText('Policies saved', {
      timeout: 10_000,
    });
    await page.screenshot({ path: shot('overnight-real-policies-saved'), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
    if (createdHookId) {
      await fetch(`${BACKEND_A}/v1/hooks/${encodeURIComponent(createdHookId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  }

  const [hooksAfter, policiesAfter] = await Promise.all([
    api<Record<string, unknown>>(BACKEND_A, '/v1/hooks'),
    api<Record<string, unknown>>(BACKEND_A, '/v1/policies'),
  ]);
  writeFileSync(
    resolve(auditDir, 'overnight-real-hooks-policies.json'),
    JSON.stringify(
      {
        backendA: BACKEND_A,
        workspaceA,
        sessionA,
        hookPostStatus,
        hookDeleteStatus,
        policiesPutStatus,
        hooksAfter,
        policiesAfter,
      },
      null,
      2,
    ),
  );
});
