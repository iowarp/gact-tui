import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Settings explains beta updates and preserves an explicit choice across reloads', async ({
  page,
}) => {
  // Replaying the document with its packaged CSP gives Chromium a synthetic
  // response, so explicitly allow this test's loopback fixture connection.
  await page.context().grantPermissions(['local-network-access']);
  const desktopConfig = JSON.parse(
    readFileSync(new URL('../../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': desktopConfig.app.security.csp,
      },
    });
  });
  const endpoint = `http://127.0.0.1:${process.env.CLIO_FIXTURE_PORT ?? '18799'}`;
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((url) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([url]));
  }, endpoint);
  await page.route(`${endpoint}/v1/capabilities`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        service: { name: 'clio-agent-gact', version: '0.9.5b1' },
      },
    });
  });
  let betaChecks = 0;
  await page.route('https://api.github.com/repos/*/*/releases?*', (route) => {
    betaChecks += 1;
    return route.fulfill({
      json: [
        {
          tag_name: 'v0.9.5-beta.2',
          draft: false,
          prerelease: true,
          published_at: '2026-10-03T12:00:00Z',
          assets: [{ name: 'latest-lite.json' }],
        },
      ],
    });
  });
  await page.goto('/settings/desktop');
  const toggle = page.getByRole('switch', { name: 'Enable beta updates' });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/Beta releases may be unstable/);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect.poll(() => betaChecks).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Software update available' })).toBeVisible();
  await page.goto('/settings/desktop');
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('beta-update-settings.png') });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
});
