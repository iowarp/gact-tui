import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const draftRoute = '/workspaces/ws_flat_ndp/new';
const h5Path = 'results/water.h5';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Recording = Record<string, { status: number; contentType: string; body: string }>;

/** h5grove responses from the HDF Group data route; see fixtures/hdf5/record_h5grove.py. */
const recorded = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/hdf5/water-h5grove.json'), 'utf8'),
) as Recording;

/** The recorder's key: endpoint, then sorted parameters without `file`. */
function recordingKey(url: URL): string {
  const name = url.pathname.split('/').at(-1) ?? '';
  const params = [...url.searchParams.entries()]
    .filter(([param]) => param !== 'file')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${name}?${new URLSearchParams(params).toString()}`;
}

function desktopCsp(): string {
  const conf = JSON.parse(
    readFileSync(resolve(__dirname, '../../desktop/src-tauri/tauri.conf.json'), 'utf8'),
  ) as { app: { security: { csp: string } } };
  return conf.app.security.csp;
}

/**
 * Serve water.h5 from the fixture workspace: list it among the files and
 * answer the workspace h5grove route from the recording.
 */
async function serveHdf5(page: Page) {
  const calls: string[] = [];
  const problems: string[] = [];
  await page.route(`${endpoint}/v1/workspaces/ws_flat_ndp/files*`, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { entries: unknown[] };
    body.entries.push({ path: h5Path, type: 'file', size: 40_960 });
    await route.fulfill({ response, json: body });
  });
  await page.route(`${endpoint}/v1/workspaces/ws_flat_ndp/h5grove/**`, async (route) => {
    const url = new URL(route.request().url());
    const key = recordingKey(url);
    calls.push(key);
    if (url.searchParams.get('file') !== h5Path) problems.push(`wrong file for ${key}`);
    const hit = recorded[key];
    if (!hit) {
      problems.push(`no recording for ${key}`);
      await route.fulfill({ status: 404, json: { message: `no recording for ${key}` } });
      return;
    }
    await route.fulfill({
      status: hit.status,
      contentType: hit.contentType,
      body: Buffer.from(hit.body, 'base64'),
    });
  });
  return { calls, problems };
}

async function openWaterH5(page: Page) {
  await page.goto(draftRoute);
  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  // Maximize first: the viewer then mounts once, at full width. h5web starts
  // with its sidebar collapsed in a narrow pane.
  await page.getByRole('button', { name: 'Maximize canvas' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const file = canvas.getByText('water.h5', { exact: true });
  const folder = canvas.getByText('results', { exact: true }).first();
  // Wait for the listing before deciding whether the folder needs expanding.
  await expect(file.or(folder).first()).toBeVisible();
  if (!(await file.isVisible())) await folder.click();
  await file.click();
  // h5web's chunk is large; the frame mounts once it has loaded.
  await expect(page.locator(`iframe[data-hdf5-viewer="${h5Path}"]`)).toBeVisible({
    timeout: 15_000,
  });
  return page.frameLocator(`iframe[data-hdf5-viewer="${h5Path}"]`);
}

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
});

test('opens an HDF5 file in h5web, reading only slices through the app', async ({ page }) => {
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  const { calls, problems } = await serveHdf5(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The viewer frame loads its own page and assets; any other request from it
  // would bypass the app's authenticated transport.
  const frameRequests: string[] = [];
  page.on('request', (request) => {
    if (request.frame() !== page.mainFrame()) frameRequests.push(request.url());
  });

  const viewer = await openWaterH5(page);

  // NeXus defaults: the file opens at /entry/results as a line plot of I
  // against q, with units from the file.
  await expect(viewer.getByRole('tab', { name: 'NX Line' })).toBeVisible({ timeout: 15_000 });
  await expect(viewer.getByText('I (counts)').first()).toBeVisible();
  await expect(viewer.getByText('q (1/nm)')).toBeVisible();
  await expect(viewer.locator('canvas').first()).toBeVisible();
  expect(calls).toContain('data?dtype=safe&format=bin&path=%2Fentry%2Fresults%2FI');

  // The default plot opens without expanding the tree to it.
  const entry = viewer.locator('[role="treeitem"][data-path="/entry"]');
  if (!(await entry.isVisible()))
    await viewer.getByRole('button', { name: 'Toggle sidebar' }).click();
  await entry.click();
  await viewer.locator('[role="treeitem"][data-path="/entry/image"]').click();
  await expect(viewer.getByRole('tab', { name: 'Heatmap' })).toBeVisible();
  await expect.poll(() => calls).toContain('data?dtype=safe&format=bin&path=%2Fentry%2Fimage');

  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(frameRequests.filter((url) => !url.startsWith(`${origin}/hdf5-viewer/`))).toEqual([]);
});

test('the desktop CSP blocks the HDF5 viewer (known gap)', async ({ page }) => {
  // h5web's ndarray and ndarray-ops build functions from strings at load,
  // which the desktop CSP (no 'unsafe-eval') refuses, so the viewer never
  // renders in the desktop app. Upstream: silx-kit/h5web#2047. This test pins
  // that behavior; when it fails because the viewer renders, the gap is
  // closed: turn it into a positive test.
  const csp = desktopCsp();
  // Deliver the CSP on every HTML document, as the desktop shell does. An
  // init-script <meta> (attachment-upload-csp.spec.ts) does not reach the
  // viewer iframe's document.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    });
  });
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  await serveHdf5(page);
  const evalRefusals: string[] = [];
  const otherErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (/unsafe-eval/u.test(error.message)) evalRefusals.push(error.message);
    else otherErrors.push(error.message);
  });

  const viewer = await openWaterH5(page);
  await expect.poll(() => evalRefusals.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(viewer.getByRole('tab', { name: 'NX Line' })).toHaveCount(0);
  expect(otherErrors).toEqual([]);
});
