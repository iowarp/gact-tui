import { expect, test } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${fixtureEndpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
  }, fixtureEndpoint);
});

test.afterAll(async ({ request }) => {
  await request.post(`${fixtureEndpoint}/__test/reset`);
});

test('an unprotected start asks for acknowledgement on every start', async ({ page }) => {
  expect((await page.request.post(`${fixtureEndpoint}/__test/sandbox-inactive`)).ok()).toBe(true);
  await page.goto(workspaceUrl);
  const banner = page.getByRole('alert', { name: 'Protected execution is off' });
  await expect(banner).toContainText('Agent commands will run without OS isolation.');
  await expect(banner).toContainText(
    'Codex not installed. Next step: Reinstall CLIO Desktop to restore the bundled Codex sandbox.',
  );
  // The banner sits above the page in flow; the page still fits the window.
  const overflow = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    return root.scrollHeight - root.clientHeight;
  });
  expect(overflow).toBeLessThanOrEqual(0);

  await banner.getByRole('button', { name: 'Continue without protection' }).click();
  await expect(banner).toHaveCount(0);

  await page.reload();
  await expect(banner).toBeVisible();

  expect((await page.request.post(`${fixtureEndpoint}/__test/reset`)).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('main').first()).toBeVisible();
  await expect(banner).toHaveCount(0);
});
