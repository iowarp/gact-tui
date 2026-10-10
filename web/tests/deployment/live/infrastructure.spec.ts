import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * Live-CLIO acceptance for the context control and long-operation progress.
 * Runs against a real CLIO (never the fixture server):
 *
 *   CLIO_ENDPOINT          required, e.g. http://127.0.0.1:8787 (loopback: no token needed)
 *   CLIO_TOKEN             bearer token when CLIO is reached by a non-loopback name
 *   CLIO_LIVE_TARGET       execution host id (default: local)
 *   CLIO_LIVE_SERVICE      a model runtime whose catalog declares context sizing (default: vllm)
 *   CLIO_LIVE_MODEL        the model to deploy (default: Qwen/Qwen3-0.6B)
 *   CLIO_LIVE_INSTALL_TIMEOUT_MS  how long one install may take (default: 40 min)
 *
 * The specs run in order: the second install expects the first one's artifacts
 * to be reused. They change the execution host (install/reinstall).
 */
const endpoint = (process.env['CLIO_ENDPOINT'] ?? '').replace(/\/+$/u, '');
const token = process.env['CLIO_TOKEN'] ?? '';
const targetId = process.env['CLIO_LIVE_TARGET'] ?? 'local';
const serviceId = process.env['CLIO_LIVE_SERVICE'] ?? 'vllm';
const model = process.env['CLIO_LIVE_MODEL'] ?? 'Qwen/Qwen3-0.6B';
const installTimeout = Number.parseInt(
  process.env['CLIO_LIVE_INSTALL_TIMEOUT_MS'] ?? `${40 * 60_000}`,
  10,
);

interface CatalogService {
  id: string;
  label: string;
  state: string;
  recommended_variant: string;
  parameters?: { id: string; context_sizing?: { fit_to_gpu_available: boolean } | null }[];
}

interface Controls {
  maximum?: number | null;
  fit_to_gpu: { available: boolean; strategies: { id: string; label: string }[] };
}

async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await request.fetch(`${endpoint}${path}`, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

async function catalogService(request: APIRequestContext): Promise<CatalogService> {
  const catalog = await api<{ services: CatalogService[] }>(
    request,
    'GET',
    `/v1/infrastructure/catalog?target_id=${encodeURIComponent(targetId)}`,
  );
  const service = catalog.services.find((row) => row.id === serviceId);
  expect(service, `${serviceId} in the catalog of ${targetId}`).toBeTruthy();
  return service!;
}

async function connect(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([{ endpoint: value }]));
  }, endpoint);
  if (token) {
    // Add the bearer at the network layer; route.continue keeps SSE streaming.
    await page.route(`${endpoint}/**`, (route) =>
      route.continue({
        headers: { ...route.request().headers(), authorization: `Bearer ${token}` },
      }),
    );
  }
}

/** Open the service's form: Set up for a new install, Configuration for an installed one. */
async function openService(page: Page, service: CatalogService): Promise<Locator> {
  await page.goto(
    targetId === 'local'
      ? '/infrastructure/services'
      : `/infrastructure/services?target=${encodeURIComponent(targetId)}`,
  );
  const installed = service.state === 'running' || service.state === 'stopped';
  if (installed) {
    await page.getByRole('button', { name: `Manage ${service.label}` }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Configuration' }).click();
    return dialog;
  }
  await page.getByRole('button', { name: 'Deploy new' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: `Set up ${service.label}` }).click();
  return dialog;
}

async function fillModel(dialog: Locator, service: CatalogService) {
  const field = dialog.getByLabel(`${service.label} Model`, { exact: true });
  if (await field.count()) await field.fill(model);
}

async function startInstall(dialog: Locator, page: Page) {
  const install = dialog.getByRole('button', { name: 'Install', exact: true });
  if (await install.count()) {
    await install.click();
    return;
  }
  await dialog.getByRole('button', { name: 'Apply configuration', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Apply configuration', exact: true })
    .click();
}

async function waitForEnd(progress: Locator) {
  await expect
    .poll(async () => progress.getAttribute('data-state'), { timeout: installTimeout })
    .toMatch(/^(succeeded|failed|cancelled)$/u);
}

test.describe.serial('live CLIO infrastructure', () => {
  test.skip(!endpoint, 'Set CLIO_ENDPOINT to a live CLIO');

  test.beforeEach(async ({ page }) => {
    await connect(page);
  });

  test('context control renders, with Fit to GPU only where CLIO offers it', async ({
    page,
    request,
  }) => {
    const service = await catalogService(request);
    const parameter = service.parameters?.find((row) => row.context_sizing);
    test.skip(!parameter, `${serviceId} declares no context sizing control on ${targetId}`);
    const preview = await api<Controls>(
      request,
      'POST',
      `/v1/infrastructure/services/${encodeURIComponent(serviceId)}/context-sizing`,
      { target_id: targetId, variant_id: '', configuration: { model } },
    );

    const dialog = await openService(page, service);
    await fillModel(dialog, service);
    const input = dialog.getByLabel('Context length', { exact: true });
    await expect(input).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Max', exact: true })).toBeVisible();
    await expect(dialog.getByText('Reading the model and this host’s GPUs…')).toBeHidden({
      timeout: 180_000,
    });
    const fit = dialog.getByRole('combobox', { name: 'Fit to GPU' });
    if (preview.fit_to_gpu.available && preview.fit_to_gpu.strategies.length) {
      await expect(fit).toBeVisible();
      await fit.click();
      for (const strategy of preview.fit_to_gpu.strategies) {
        await expect(
          page.getByRole('option', { name: `Fit to GPU · ${strategy.label}` }),
        ).toBeVisible();
      }
      await page.keyboard.press('Escape');
    } else {
      await expect(fit).toHaveCount(0);
    }
    await dialog.getByRole('button', { name: 'Max', exact: true }).click();
    if (preview.maximum) await expect(input).toHaveValue(String(preview.maximum));
    // Bounded: a value above the maximum is refused before anything is sent.
    if (preview.maximum) {
      await input.fill(String(preview.maximum + 1));
      await expect(dialog.getByRole('alert').filter({ hasText: /At most/u })).toBeVisible();
    }
  });

  test('an install shows ordered steps, a progress bar, elapsed time and the live log', async ({
    page,
    request,
  }) => {
    const service = await catalogService(request);
    const dialog = await openService(page, service);
    await fillModel(dialog, service);
    await startInstall(dialog, page);

    const progress = dialog.locator('[data-slot="operation-progress"]').first();
    await expect(progress).toBeVisible({ timeout: 60_000 });
    await expect(progress.getByRole('list', { name: 'Steps' })).toBeVisible({ timeout: 180_000 });
    await expect(progress.getByText(/^Elapsed /u)).toBeVisible();
    await expect
      .poll(async () => progress.getByRole('progressbar').count(), { timeout: 600_000 })
      .toBeGreaterThan(0);
    // Never a fake percentage: only a determinate bar carries a value.
    for (const bar of await progress.getByRole('progressbar').all()) {
      const determinate = await bar.getAttribute('data-determinate');
      if (determinate === 'false') await expect(bar).not.toHaveAttribute('aria-valuenow');
    }

    await progress.getByRole('button', { name: /^Live log/u }).click();
    const log = progress.locator('[data-slot="operation-log"] [role="log"]');
    await expect(log).toBeVisible();
    await expect
      .poll(async () => Number((await log.getAttribute('data-line-count')) ?? '0'), {
        timeout: 600_000,
      })
      .toBeGreaterThan(0);
    await expect(log.locator('.xterm-rows')).not.toHaveText('', { timeout: 30_000 });

    await waitForEnd(progress);
    await expect(progress).toHaveAttribute('data-state', 'succeeded');

    const sized = (await catalogService(request)).parameters?.some((row) => row.context_sizing);
    if (sized) {
      await page.reload();
      const after = await openService(page, await catalogService(request));
      await expect(after.getByText(/^In force:/u)).toBeVisible({ timeout: 60_000 });
    }
  });

  test('a second install reports what it reused instead of redoing', async ({
    page,
    request,
  }) => {
    const service = await catalogService(request);
    test.skip(
      service.state !== 'running' && service.state !== 'stopped',
      'The first install did not leave the service installed',
    );
    const dialog = await openService(page, service);
    await startInstall(dialog, page);
    const progress = dialog.locator('[data-slot="operation-progress"]').first();
    await expect(progress).toBeVisible({ timeout: 60_000 });
    await expect(progress.locator('[data-slot="reuse-note"]').first()).toBeVisible({
      timeout: installTimeout,
    });
    await expect(progress.locator('[data-slot="reuse-note"]').first()).toHaveText(/Reusing/u);
    await waitForEnd(progress);
    await expect(progress).toHaveAttribute('data-state', 'succeeded');
    await expect(progress.getByRole('button', { name: 'Reinstall from scratch' })).toBeVisible();
  });
});
