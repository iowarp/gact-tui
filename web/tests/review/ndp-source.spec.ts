import { test, expect, type Page } from '@playwright/test';

// Component regression fixture only: the account and catalog are synthetic.
// These screenshots do not qualify the deployed Attach dialog or NDP access.

for (const variant of ['light', 'dark', 'mobile']) {
  test(`fixture SSH endpoint capture and explicit mutation review (${variant})`, async ({
    page,
  }) => {
    if (variant === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await catalogFixture(page);
    await page.route('**/v1/infrastructure/targets', (route) =>
      route.fulfill({ json: { targets: [] } }),
    );
    await page.route('**/v1/storage/ssh/profiles', (route) =>
      route.fulfill({ json: { profiles: ['ares'] } }),
    );
    const methods: string[] = [];
    let connected = false;
    const endpoint = {
      id: 'ep',
      workspace_id: 'workspace',
      name: 'Ares endpoint',
      url: 'http://127.0.0.1:8002',
      ssh_profile: 'ares',
      authentication: 'none',
      observed_at: '2026-10-18T08:00:00Z',
      api_title: 'NDP Endpoint',
      operations: [
        {
          id: 'GET /stations',
          method: 'GET',
          path: '/stations',
          summary: 'Find stations',
          description: 'Filter station metadata.',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
          body_schema: null,
          body_required: false,
          read_only: true,
        },
        {
          id: 'POST /sessions',
          method: 'POST',
          path: '/sessions',
          summary: 'Start stream',
          description: 'Create a remote stream session.',
          parameters: [],
          body_schema: { type: 'object' },
          body_required: true,
          read_only: false,
        },
      ],
    };
    const capture = {
      id: 'capture',
      endpoint_id: 'ep',
      operation_id: 'GET /stations',
      method: 'GET',
      started_at: '2026-10-18T08:00:00Z',
      completed_at: '2026-10-18T08:00:01Z',
      status_code: 200,
      content_type: 'text/plain',
      bytes_received: 21,
      events: 0,
      stop_reason: 'completed',
      resource_id: 'res_capture',
      sha256: '1234567890abcdef',
      preview: 'station,east\nANMO,1.2',
      workspace_path: '/workspace/inputs/stations.txt',
      source_artifact_id: 'artifact_capture',
    };
    await page.route('**/v1/workspaces/workspace/ndp-endpoints**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/captures'))
        return route.fulfill({ json: { captures: methods.length ? [capture] : [] } });
      if (url.pathname.endsWith('/request')) {
        methods.push(route.request().postDataJSON().operation_id);
        return route.fulfill({ json: capture });
      }
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({
          name: 'Ares endpoint',
          url: 'http://127.0.0.1:8002',
          ssh_profile: '',
          ssh_route: {
            profile: 'ares',
            host: '',
            user: '',
            port: 22,
            jump_hosts: [],
            identity_file: '',
            platform: 'auto',
          },
          authentication: 'none',
        });
        connected = true;
        return route.fulfill({ json: endpoint });
      }
      return route.fulfill({ json: { endpoints: connected ? [endpoint] : [] } });
    });
    await page.goto(`/tests/review/ndp-source.html?theme=${variant === 'dark' ? 'dark' : 'light'}`);
    await page.getByRole('button', { name: 'Endpoints & streams', exact: true }).click();
    await page.getByRole('button', { name: 'SSH', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Ares endpoint');
    await page.getByRole('combobox', { name: 'Saved SSH host', exact: true }).click();
    await page.getByRole('option', { name: 'ares', exact: true }).click();
    await page.getByLabel('Remote API URL').fill('http://127.0.0.1:8002');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByText('Advanced API tools', { exact: true }).click();
    await page.getByRole('button', { name: /Find stations/ }).click();
    await page.getByLabel('limit', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Run and save response' }).click();
    await expect(page.getByRole('link', { name: 'Open captured response' })).toBeVisible();
    await expect(page.getByLabel('Endpoint response')).toContainText('ANMO,1.2');
    await page.getByRole('button', { name: /Start stream/ }).click();
    await page.getByLabel('Request JSON').fill('{"sncl_codes":["ANMO"]}');
    await page.getByRole('button', { name: 'Review action' }).click();
    expect(methods).toEqual(['GET /stations']);
    await page.getByRole('button', { name: 'Confirm operation' }).click();
    await expect.poll(() => methods.length).toBe(2);
    const evidence = process.env.CLIO_REVIEW_EVIDENCE;
    if (evidence)
      await page.screenshot({
        path: `${evidence}/fixture-ndp-endpoint-${variant}.png`,
        fullPage: true,
      });
  });
}

const sea = {
  id: 'sea',
  name: 'coastal_stations_2026',
  title: 'Coastal sea observations',
  description: 'Wave height and station measurements from the coastal research network.',
  organization: 'earthscope_consortium',
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
};
const atmosphere = {
  ...sea,
  id: 'climate',
  name: 'NCAR_CESM2_historical_surface_v202610',
  title: 'Historical surface temperatures',
  description: 'Daily temperature measurements from a global climate simulation.',
  organization: 'climate-research',
  endpoint_id: 'climate',
  endpoint_name: 'Climate Research Endpoint',
  resources: [
    { ...sea.resources[0], id: 'temperatures', name: 'Surface temperature.nc', format: 'NetCDF' },
  ],
};
const astro = {
  ...sea,
  id: 'astro',
  name: 'stellar_spectra_2026',
  title: 'Stellar spectra survey',
  description: 'Spectra and photometry for nearby stars.',
  endpoint_name: 'Astronomy Endpoint',
  resources: [{ ...sea.resources[0], id: 'stars', name: 'stellar-spectra.fits', format: 'FITS' }],
};

async function catalogFixture(page: Page) {
  const selections: { dataset_id: string; resource_ids: string[] }[] = [];
  const searches: string[] = [];
  let linked = false;
  const source = {
    id: 'source-ndp',
    label: sea.title,
    provider: 'ndp',
    root: 'sea',
    owner: { clio_id: 'clio', host_id: 'local' },
    mode: 'read_only',
    capabilities: { supported_modes: ['read_only'], download: true, link_folder: true },
    connected: true,
    authenticated: true,
    configuration: {},
    local_path: null,
    linked: false,
    link_available: true,
    download_available: true,
    link_access: 'read_only',
    download_access: 'editable',
  };
  await page.route('**/v1/storage/ndp/search', async (route) => {
    const input = route.request().postDataJSON();
    searches.push(input.query);
    const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      json: {
        datasets: [sea, atmosphere, astro].filter(
          (dataset) =>
            (!input.organization || dataset.organization === input.organization) &&
            words.every((word: string) => JSON.stringify(dataset).toLowerCase().includes(word)),
        ),
        warnings: input.only_groups
          ? ['NDP could not check Endpoint access. Catalog browsing is still available.']
          : [],
      },
    });
  });
  await page.route('**/v1/storage/ndp/organizations', (route) =>
    route.fulfill({
      json: {
        organizations: [
          {
            id: 'earthscope_consortium',
            endpoint_id: 'ocean',
            endpoint_name: 'Ocean Research Endpoint',
          },
          {
            id: 'climate-research',
            endpoint_id: 'climate',
            endpoint_name: 'Climate Research Endpoint',
          },
        ],
      },
    }),
  );
  await page.route('**/v1/workspaces/workspace/sources/ndp', async (route) => {
    selections.push(route.request().postDataJSON());
    await route.fulfill({ json: source });
  });
  await page.route('**/sources/source-ndp/operations', (route) =>
    route.fulfill({ json: { operations: [] } }),
  );
  await page.route('**/sources/source-ndp/mapping-options', (route) =>
    route.fulfill({
      json: {
        link_access: ['read_only'],
        write_permission: false,
        reason: 'NDP originals cannot be changed through this connection.',
      },
    }),
  );
  await page.route('**/sources/source-ndp/browse', (route) =>
    route.fulfill({
      json: {
        source_id: 'source-ndp',
        entries: sea.resources.map((resource) => ({
          path: resource.path,
          kind: 'file',
          size: resource.size,
          revision: resource.revision,
        })),
        next_offset: null,
      },
    }),
  );
  await page.route('**/sources/source-ndp/draft', (route) =>
    route.fulfill({ json: { id: 'draft' } }),
  );
  await page.route('**/sources/source-ndp/link', async (route) => {
    linked = true;
    await route.fulfill({ json: { ...source, linked: true } });
  });
  await page.route('**/sources/source-ndp/reference', (route) =>
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
  return { selections, searches, isLinked: () => linked };
}

test('fixture catalog filtering, selection and the shared source review render in both themes and on mobile', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const fixture = await catalogFixture(page);
  await page.setViewportSize({ width: 1100, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.goto(`/tests/review/ndp-source.html?theme=${theme}`);
    await expect(page.getByRole('button', { name: /Coastal sea observations/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Historical surface temperatures/ }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`fixture-ndp-browse-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole('textbox', { name: 'Search NDP datasets' }).fill('station');
    await expect(page.getByRole('button', { name: /Historical surface temperatures/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole('checkbox', { name: /Station measurements.csv/ })).toBeVisible();
    await page.getByRole('checkbox', { name: /Station measurements.csv/ }).check();
    await page.getByRole('checkbox', { name: /Ocean wave heights.nc/ }).check();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await expect(page.getByText(/Nothing is downloaded/)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`fixture-ndp-${theme}.png`),
      fullPage: true,
    });
  }
  expect(fixture.selections).toEqual([]);
  expect(fixture.isLinked()).toBe(false);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'How do you want to use these files?' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download selected files' })).toBeVisible();
  await expect(page.getByText('stations.csv', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fixture.selections).toEqual([
    { endpoint_id: 'ocean', dataset_id: 'sea', resource_ids: ['stations', 'waves'] },
  ]);
  expect(fixture.isLinked()).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('fixture-ndp-source-review.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Link selected files' }).click();
  await expect(page.getByText('Attached: Coastal sea observations')).toBeVisible();
  expect(fixture.isLinked()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('textbox', { name: 'Search NDP datasets' }).fill('station');
  await expect(page.getByRole('checkbox', { name: /Station measurements.csv/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('fixture-ndp-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('fixture selections survive filtering and remote result changes', async ({ page }) => {
  const fixture = await catalogFixture(page);
  await page.goto('/tests/review/ndp-source.html');
  await page.getByRole('textbox', { name: 'Search NDP datasets' }).fill('station');
  await page.getByRole('checkbox', { name: /Station measurements.csv/ }).check();
  await page.getByRole('textbox', { name: 'Search NDP datasets' }).fill('temperature');
  await page.getByRole('checkbox', { name: /Surface temperature.nc/ }).check();
  await page.getByRole('button', { name: 'Selected (2)' }).click();
  await expect(page.getByRole('button', { name: /Coastal sea observations/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Historical surface temperatures/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'How do you want to use these files?' }),
  ).toBeVisible();
  expect(
    fixture.selections.map((selection) => [selection.dataset_id, selection.resource_ids]),
  ).toEqual([
    ['sea', ['stations']],
    ['climate', ['temperatures']],
  ]);
});

test('fixture organization search narrows datasets without granting organization access', async ({
  page,
}, testInfo) => {
  await catalogFixture(page);
  await page.goto('/tests/review/ndp-source.html?theme=light');
  await page.getByRole('combobox', { name: 'Organization filter' }).click();
  await page.getByPlaceholder('Find an organization…').fill('earthscope');
  await page.getByRole('option', { name: /earthscope_consortium/ }).click();
  await expect(page.getByRole('combobox', { name: 'Organization filter' })).toContainText(
    'earthscope_consortium',
  );
  await expect(page.getByRole('button', { name: /Coastal sea observations/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Historical surface temperatures/ })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath('fixture-ndp-organization.png'),
    fullPage: true,
  });
});

test('fixture large catalog keeps selection actions visible and finds results beyond the rendered page', async ({
  page,
}) => {
  await catalogFixture(page);
  const rows = Array.from({ length: 50 }, (_, index) => ({
    ...sea,
    id: `catalog-${index}`,
    name: `CESM2_historical_daily_v01_${index}`,
    title: `Catalog example ${index}`,
    resources: [{ ...sea.resources[0], name: `${index}-data.csv` }],
  }));
  await page.route('**/v1/storage/ndp/search', (route) => {
    const query = route.request().postDataJSON().query;
    return route.fulfill({
      json: { datasets: rows.filter((row) => JSON.stringify(row).includes(query)), warnings: [] },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/review/ndp-source.html');
  await expect(page.getByRole('button', { name: 'Catalog example 0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Catalog example 39', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Show more datasets' }).click();
  await expect(page.getByRole('button', { name: 'Catalog example 39', exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByRole('button', { name: 'Continue' })).toBeInViewport();
  await page.getByRole('textbox', { name: 'Search NDP datasets' }).fill('39');
  await expect(page.getByRole('checkbox', { name: /39-data.csv/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
