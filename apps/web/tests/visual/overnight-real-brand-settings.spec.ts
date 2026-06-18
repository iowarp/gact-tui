/**
 * Opt-in real-system brand/settings/workspace validation:
 *
 *   production web app -> isolated CLIO backends -> branding, settings
 *   backend probes, backend selection from Settings, and workspace filtering.
 *
 * This is not a CI default. It assumes the caller already launched two
 * backend processes and wants screenshots/evidence from the real app.
 *
 * Run:
 *   CLIO_OVERNIGHT_EXTENDED_UI=1 \
 *   CLIO_BACKEND_A_URL=http://127.0.0.1:18131 \
 *   CLIO_BACKEND_B_URL=http://127.0.0.1:18132 \
 *   CLIO_WORKSPACE_A_ROOT=/tmp/.../backend-a/workspace \
 *   GACT_BRAND=clio \
 *   pnpm exec playwright test tests/visual/overnight-real-brand-settings.spec.ts
 */

import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED = process.env['CLIO_OVERNIGHT_EXTENDED_UI'] === '1';
const BACKEND_A = process.env['CLIO_BACKEND_A_URL'] ?? 'http://127.0.0.1:18131';
const BACKEND_B = process.env['CLIO_BACKEND_B_URL'] ?? 'http://127.0.0.1:18132';
const WORKSPACE_A_ROOT = process.env['CLIO_WORKSPACE_A_ROOT'] ?? '';
const ALT_WORKSPACE_ROOT =
  process.env['CLIO_ALT_WORKSPACE_ROOT'] ??
  (WORKSPACE_A_ROOT
    ? resolve(WORKSPACE_A_ROOT, '..', 'workspace-alt')
    : '/tmp/gact-overnight-real-workspace-alt');

const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });
mkdirSync(ALT_WORKSPACE_ROOT, { recursive: true });

interface WorkspaceRow {
  id: string;
  name?: string;
  root_path?: string;
}

interface SessionRow {
  id: string;
  title?: string;
  workspace_id?: string;
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

async function workspaces(base: string): Promise<WorkspaceRow[]> {
  return (await api<{ workspaces: WorkspaceRow[] }>(base, '/v1/workspaces')).workspaces;
}

async function workspaceByRoot(base: string, rootPath: string): Promise<WorkspaceRow> {
  const row = (await workspaces(base)).find((workspace) => workspace.root_path === rootPath);
  if (row?.id) return row;
  throw new Error(`${base} has no workspace rooted at ${rootPath}`);
}

async function ensureWorkspaceByRoot(
  base: string,
  rootPath: string,
  name: string,
): Promise<WorkspaceRow> {
  const existing = (await workspaces(base)).find((workspace) => workspace.root_path === rootPath);
  if (existing?.id) return existing;
  return await api<WorkspaceRow>(base, '/v1/workspaces', {
    method: 'POST',
    body: JSON.stringify({
      name,
      root_path: rootPath,
      storage_root: `${rootPath}/.clio`,
    }),
  });
}

async function createSession(
  base: string,
  workspaceId: string,
  title: string,
): Promise<SessionRow> {
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
      window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
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

async function openBrowser(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

async function clickWorkspaceOptionByRoot(page: Page, rootPath: string): Promise<void> {
  const options = page.getByRole('option');
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const path = option.locator('.sx__ws-item-path');
    if ((await path.count()) === 0) continue;
    const pathText = (await path.textContent({ timeout: 250 }).catch(() => ''))?.trim();
    if (pathText === rootPath) {
      await option.click({ timeout: 5_000 });
      return;
    }
  }
  throw new Error(`Workspace option not found for root ${rootPath}`);
}

test.setTimeout(8 * 60 * 1000);

test('real CLIO shell uses CLIO branding and Settings can probe/select backends', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA || !reachableB, `backends not reachable: A=${reachableA} B=${reachableB}`);
  test.skip(!WORKSPACE_A_ROOT, 'set CLIO_WORKSPACE_A_ROOT to bind the live proof to a known workspace');

  const workspaceA = await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT);
  const workspaceB = (await workspaces(BACKEND_B))[0];
  if (!workspaceB?.id) throw new Error(`${BACKEND_B} has no workspace`);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `brand settings A ${stamp}`);
  const sessionB = await createSession(BACKEND_B, workspaceB.id, `brand settings B ${stamp}`);

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`session-row-${sessionA.id}`)).toBeVisible();
    await page.getByTestId(`session-row-${sessionA.id}`).click({ timeout: 5_000 });
    await expect(page.getByTestId('composer-input')).toHaveAttribute(
      'placeholder',
      /Ask CLIO anything/i,
    );
    await expect(page.getByTestId('backend-picker')).toContainText('Overnight A');
    await page.screenshot({ path: shot('overnight-real-brand-chat'), fullPage: false });

    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('settings-back')).toContainText('Back to CLIO');
    await expect(page.getByTestId('settings-backends')).toBeVisible();

    await page.getByTestId('settings-nav-about').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-about')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('settings-about')).toContainText('About CLIO Web');
    await expect(page.getByTestId('settings-about')).toContainText('web frontend');
    await expect(page.getByText('web + desktop frontend')).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-settings-about'), fullPage: false });

    await page.getByTestId('settings-nav-backends').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-backends')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('settings-row-test-overnight:a').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-row-test-result-overnight:a')).toContainText(
      /ok/i,
      { timeout: 10_000 },
    );
    await page.getByTestId('settings-row-test-overnight:b').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-row-test-result-overnight:b')).toContainText(
      /ok/i,
      { timeout: 10_000 },
    );
    await page.screenshot({ path: shot('overnight-real-settings-probe'), fullPage: false });

    await page.getByTestId('settings-row-select-overnight:b').click({ timeout: 5_000 });
    await page.getByTestId('settings-back').first().click({ timeout: 5_000 });
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('backend-picker')).toContainText('Overnight B', {
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${sessionB.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(`brand settings A ${stamp}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-settings-selected-backend'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-brand-settings.json'),
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
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test('real CLIO workspace switcher filters sessions by live workspace id', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA, `backend A not reachable: ${BACKEND_A}`);
  test.skip(!WORKSPACE_A_ROOT, 'set CLIO_WORKSPACE_A_ROOT to bind the live proof to a known workspace');

  const primary = await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT);
  const secondary = await ensureWorkspaceByRoot(
    BACKEND_A,
    ALT_WORKSPACE_ROOT,
    'overnight-alt',
  );
  const stamp = Date.now();
  const primarySession = await createSession(
    BACKEND_A,
    primary.id,
    `workspace primary ${stamp}`,
  );
  const secondarySession = await createSession(
    BACKEND_A,
    secondary.id,
    `workspace secondary ${stamp}`,
  );

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page);
    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`session-row-${primarySession.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${secondarySession.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: shot('overnight-real-workspaces-all'), fullPage: false });

    await page.getByTestId('workspace-switcher').locator('button').first().click();
    await clickWorkspaceOptionByRoot(page, secondary.root_path ?? '');
    await expect(page.getByTestId(`session-row-${secondarySession.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${primarySession.id}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-workspace-alt'), fullPage: false });

    await page.getByTestId('workspace-switcher').locator('button').first().click();
    await clickWorkspaceOptionByRoot(page, primary.root_path ?? '');
    await expect(page.getByTestId(`session-row-${primarySession.id}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId(`session-row-${secondarySession.id}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-workspace-primary'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-workspaces.json'),
      JSON.stringify(
        {
          backendA: BACKEND_A,
          primary,
          secondary,
          primarySession,
          secondarySession,
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

test('real CLIO settings can add and activate a remote HTTP backend', async () => {
  test.skip(!ENABLED, 'set CLIO_OVERNIGHT_EXTENDED_UI=1 to run the extended real-system proof');
  test.skip(!reachableA || !reachableB, `backends not reachable: A=${reachableA} B=${reachableB}`);
  test.skip(!WORKSPACE_A_ROOT, 'set CLIO_WORKSPACE_A_ROOT to bind the live proof to a known workspace');

  const workspaceA = await workspaceByRoot(BACKEND_A, WORKSPACE_A_ROOT);
  const workspaceB = (await workspaces(BACKEND_B))[0];
  if (!workspaceB?.id) throw new Error(`${BACKEND_B} has no workspace`);
  const stamp = Date.now();
  const sessionA = await createSession(BACKEND_A, workspaceA.id, `add remote A ${stamp}`);
  const sessionB = await createSession(BACKEND_B, workspaceB.id, `add remote B ${stamp}`);
  const addedLabel = `Added remote ${stamp}`;

  const { browser, ctx, page } = await openBrowser();
  try {
    await seedRegistry(page, 'overnight:a');
    await page.goto(`/?route=chat&backend=${encodeURIComponent(BACKEND_A)}`);
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`session-row-${sessionA.id}`)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId('sessions-settings').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-backends')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('settings-add-remote').click({ timeout: 5_000 });
    await expect(page.getByTestId('settings-add-remote-page')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('add-remote-label').fill(addedLabel);
    await page.getByTestId('add-remote-url').fill(`${BACKEND_B}/`);
    await page.screenshot({ path: shot('overnight-real-add-remote-form'), fullPage: false });

    await page.getByTestId('add-remote-save').click({ timeout: 5_000 });
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('backend-picker')).toContainText(addedLabel, {
      timeout: 20_000,
    });
    await expect(page.getByTestId(`session-row-${sessionB.id}`)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`add remote A ${stamp}`)).toHaveCount(0);
    await page.screenshot({ path: shot('overnight-real-add-remote-active'), fullPage: false });

    writeFileSync(
      resolve(auditDir, 'overnight-real-add-remote.json'),
      JSON.stringify(
        {
          backendA: BACKEND_A,
          backendB: BACKEND_B,
          workspaceA,
          workspaceB,
          sessionA,
          sessionB,
          addedLabel,
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
