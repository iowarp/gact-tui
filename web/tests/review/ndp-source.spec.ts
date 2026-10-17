import { test, expect } from '@playwright/test';

test('NDP dataset selection renders in both themes and attaches ordinary references', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let groups = false;
  let attached = false;
  await page.route('**/v1/storage/ndp/search', async (route) => {
    groups = Boolean(route.request().postDataJSON().only_groups);
    await route.fulfill({
      json: {
        datasets: [
          {
            id: 'sea',
            name: 'sea',
            title: 'Coastal sea observations',
            description: 'Wave height and station measurements from the coastal research network.',
            endpoint_id: 'ocean',
            endpoint_name: 'Ocean Research Endpoint',
            access: null,
            resources: [
              {
                id: 'stations',
                path: 'stations.csv',
                name: 'Station measurements.csv',
                format: 'CSV',
                size: 16384,
                revision: 'r1',
              },
              {
                id: 'waves',
                path: 'waves.nc',
                name: 'Ocean wave heights.nc',
                format: 'NetCDF',
                size: 5242880,
                revision: 'r2',
              },
            ],
          },
        ],
        warnings: groups
          ? ['NDP could not check Endpoint access. Catalog browsing is still available.']
          : [],
      },
    });
  });
  await page.route('**/v1/workspaces/workspace/sources/ndp', async (route) => {
    expect(route.request().postDataJSON().resource_ids).toEqual(['stations', 'waves']);
    attached = true;
    await route.fulfill({
      json: {
        id: 'source-ndp',
        label: 'Coastal sea observations',
        provider: 'ndp',
        root: 'sea',
        owner: { clio_id: 'clio', host_id: 'local' },
        mode: 'read_only',
        capabilities: { supported_modes: ['read_only'] },
        connected: true,
        authenticated: true,
        configuration: {},
      },
    });
  });
  await page.route('**/v1/workspaces/workspace/sources/source-ndp/draft', (route) =>
    route.fulfill({ json: { id: 'draft' } }),
  );
  await page.route('**/v1/workspaces/workspace/sources/source-ndp/reference', (route) =>
    route.fulfill({
      json: {
        id: 'resource-ndp',
        workspace_id: 'workspace',
        name: 'folder-index.json',
        state: 'ready',
        detected_mime: 'application/json',
        declared_size: 100,
        received_size: 100,
        revision: 1,
        sha256: 'a'.repeat(64),
        created_at: '2026-10-17T00:00:00Z',
        updated_at: '2026-10-17T00:00:00Z',
      },
    }),
  );
  await page.setViewportSize({ width: 1100, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.goto(`/tests/review/ndp-source.html?theme=${theme}`);
    await page.getByRole('button', { name: /Coastal sea observations/ }).click();
    await expect(page.getByLabel(/Station measurements.csv/)).toBeVisible();
    await expect(page.getByText('Viewer', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Nothing is downloaded/)).toBeVisible();
    await page.getByRole('checkbox').first().check();
    await page.getByRole('checkbox').last().check();
    await expect(page.getByRole('button', { name: 'Attach 2 resources' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`ndp-${theme}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Attach 2 resources' }).click();
  await expect(page.getByText('Attached: Coastal sea observations')).toBeVisible();
  expect(attached).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: /Coastal sea observations/ }).click();
  await expect(page.getByRole('button', { name: 'Attach 0 resources' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ndp-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
