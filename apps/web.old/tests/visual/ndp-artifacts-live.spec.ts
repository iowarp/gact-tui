/**
 * Opt-in live artifact-preview gate:
 *
 *   web app -> real CLIO workspace files -> preview rail ->
 *   generated EarthScope CSV/PNG artifacts.
 *
 * This does not run the NDP benchmark itself. It validates the UI against
 * artifacts produced by a real NDP/EarthScope run.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKEND,
  api,
  archiveSession,
  auditDir,
  bootBrowser,
  reachable,
  shot,
  type SessionRow,
  type Workspace,
  type WorkspaceFileEntry,
} from './ndp-live-helpers';

const ENABLED =
  process.env['CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE'] === '1' ||
  process.env['CLIO_NDP_EARTHSCOPE_LIVE'] === '1';
const WORKSPACE_ROOT =
  process.env['CLIO_NDP_EARTHSCOPE_WORKSPACE'] ??
  '/home/jcernuda/gact-tui/tmp/owned-clio-ndp-20260617-120216/workspace';

async function workspaceByRoot(): Promise<Workspace> {
  const rows = (await api<{ workspaces: Workspace[] }>('/v1/workspaces')).workspaces ?? [];
  const found = rows.find((workspace) => workspace.root_path === WORKSPACE_ROOT);
  if (!found?.id) throw new Error(`No workspace registered for ${WORKSPACE_ROOT}`);
  return found;
}

async function workspaceFiles(workspaceId: string): Promise<WorkspaceFileEntry[]> {
  const raw = await api<{ entries?: WorkspaceFileEntry[]; files?: WorkspaceFileEntry[] }>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/files`,
  );
  return raw.entries ?? raw.files ?? [];
}

async function createSession(workspaceId: string): Promise<string> {
  const created = await api<SessionRow>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      title: `ndp artifact preview ${Date.now()}`,
      workspace_id: workspaceId,
    }),
  });
  if (!created.id) throw new Error('create session returned no id');
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
    window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
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
  await expect(page.getByTestId('preview-rail')).toBeVisible({ timeout: 10_000 });
}

async function previewPath(page: Page, path: string): Promise<void> {
  await page.getByTestId('preview-rail-filter').fill(path);
  const row = page.getByTestId(`preview-rail-row-${path}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
}

async function waitForImagePreviewOutcome(page: Page): Promise<'image' | 'diagnostic'> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rendered = await page.getByTestId('preview-rail-image').locator('img').count();
    if (rendered > 0) return 'image';
    const diagnostic = await page.getByTestId('preview-rail-image-error').count();
    if (diagnostic > 0) return 'diagnostic';
    await page.waitForTimeout(250);
  }
  throw new Error('image preview neither rendered nor showed a diagnostic');
}

function generatedPngArtifactPath(files: WorkspaceFileEntry[]): string {
  const png = files
    .filter((file) => file.type === 'file' && file.path.toLowerCase().endsWith('.png'))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (!png) throw new Error('workspace is missing a generated PNG artifact');
  return png.path;
}

test.setTimeout(4 * 60 * 1000);

test('web preview rail renders real NDP EarthScope artifacts', async () => {
  test.skip(!ENABLED, 'set CLIO_NDP_EARTHSCOPE_ARTIFACTS_LIVE=1 to run the live artifact preview gate');
  test.skip(!reachable, `no live clio backend reachable at ${BACKEND}`);

  const workspace = await workspaceByRoot();
  const files = await workspaceFiles(workspace.id);
  const pngPath = generatedPngArtifactPath(files);
  const required = [
    'earthscope_stations_clean.csv',
    'MTA1.CI.LY_.30.csv',
    pngPath,
  ];
  for (const path of required) {
    if (!files.some((file) => file.path === path && file.type === 'file')) {
      test.skip(true, `workspace is missing generated artifact ${path}`);
      return;
    }
  }

  const sessionId = await createSession(workspace.id);
  const browser = await bootBrowser();
  let ctx: BrowserContext | undefined;
  try {
    const opened = await openConnected(browser);
    ctx = opened.ctx;
    const page = opened.page;
    await selectSession(page, sessionId);
    await expect(page.getByText('Previewing workspace files')).toBeVisible();

    await previewPath(page, 'earthscope_stations_clean.csv');
    await expect(page.getByTestId('preview-rail-text')).toContainText('Site', { timeout: 10_000 });
    await expect(page.getByTestId('preview-rail-text')).toContainText('Latitude', { timeout: 10_000 });
    await page.screenshot({ path: shot('ndp-artifact-preview-metadata-csv'), fullPage: false });

    await previewPath(page, pngPath);
    const plotOutcome = await waitForImagePreviewOutcome(page);
    let naturalWidth = 0;
    let naturalHeight = 0;
    if (plotOutcome === 'image') {
      const img = page.getByTestId('preview-rail-image').locator('img');
      await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
      naturalWidth = await img.evaluate((node) => (node as HTMLImageElement).naturalWidth);
      naturalHeight = await img.evaluate((node) => (node as HTMLImageElement).naturalHeight);
      expect(naturalWidth).toBeGreaterThan(0);
      expect(naturalHeight).toBeGreaterThan(0);
    } else {
      await expect(page.getByTestId('preview-rail-image-error')).toContainText(/backend|image|bytes/i);
    }
    await page.screenshot({ path: shot('ndp-artifact-preview-plot-png'), fullPage: false });

    await previewPath(page, 'MTA1.CI.LY_.30.csv');
    await expect(page.getByTestId('preview-rail-binary')).toContainText('File too large', {
      timeout: 10_000,
    });
    await page.screenshot({ path: shot('ndp-artifact-preview-large-csv'), fullPage: false });

    const archiveResult = await archiveSession(sessionId);
    writeFileSync(
      resolve(auditDir, 'ndp-artifact-preview-evidence.json'),
      JSON.stringify(
        {
          backend: BACKEND,
          workspaceRoot: workspace.root_path ?? WORKSPACE_ROOT,
          workspace,
          sessionId,
          artifacts: files.filter((file) => required.includes(file.path)),
          pngPath,
          plotOutcome,
          plot: { outcome: plotOutcome, naturalWidth, naturalHeight },
          archiveResult,
          archivedAfterEvidence: 'archived' in archiveResult ? archiveResult.archived === true : false,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx?.close();
    await browser.close();
  }
});
