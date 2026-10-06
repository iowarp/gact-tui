import { expect, test } from '@playwright/test';

test('a reconnect closes its menu and animates the row until the request finishes', async ({
  page,
}, testInfo) => {
  const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((url) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([url]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  const server = {
    id: 'mcp_ext_science',
    name: 'Science tools',
    status: 'ready',
    transport: 'http',
    tools_count: 1,
    tools: ['catalog_search'],
    spec: { transport: 'http', url: 'https://mcp.example.test' },
  };
  await page.route(`${endpoint}/v1/mcp/servers*`, (route) =>
    route.fulfill({ json: { servers: [server] } }),
  );
  await page.route(`${endpoint}/v1/tools`, (route) => route.fulfill({ json: { tools: [] } }));
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(`${endpoint}/v1/mcp/servers/${server.id}/reconnect`, async (route) => {
    requests += 1;
    await response;
    await route.fulfill({ json: server });
  });
  await page.goto('/settings/tools');
  const actions = page.getByRole('button', { name: 'Actions for Science tools' });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Reconnect' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(actions).toHaveAttribute('aria-busy', 'true');
  await expect(actions).toBeDisabled();
  const icon = actions.locator('svg');
  await expect(icon).toHaveCSS('animation-name', 'spin');
  const before = await icon.evaluate((element) => getComputedStyle(element).transform);
  await expect
    .poll(() => icon.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(before);
  await page.screenshot({ path: testInfo.outputPath('reconnect-pending.png') });
  expect(requests).toBe(1);
  release();
  await expect(actions).toBeEnabled();
  await expect(actions).toHaveAttribute('aria-busy', 'false');
  await expect(actions.locator('svg')).not.toHaveClass(/animate-spin/);
  await page.screenshot({ path: testInfo.outputPath('reconnect-complete.png') });
});
