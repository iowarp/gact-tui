import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('General hides native update controls in the browser and redirects the old Desktop route', async ({
  page,
}) => {
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
    // A saved channel from an earlier browser version must not expose native controls.
    localStorage.setItem('clio.update-channel', 'beta');
  }, endpoint);
  await page.goto('/settings/desktop');
  await expect(page).toHaveURL(/\/settings\/general$/);
  await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Conversation activity' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Hide dot files and folders' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Enable beta updates' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check for updates' })).toHaveCount(0);
  await expect(page.getByText('Desktop integration', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Installed app only', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Desktop', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'General', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('textbox', { name: 'Search settings', exact: true }).fill('beta');
  await expect(page.getByRole('status')).toHaveText('No matching settings.');
  await page.getByRole('button', { name: 'Clear settings search' }).click();
  const hiddenFiles = page.getByRole('switch', { name: 'Hide dot files and folders' });
  await hiddenFiles.click();
  await page.reload();
  await expect(hiddenFiles).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('clio.update-channel'))).toBe('beta');
  await page.screenshot({ path: test.info().outputPath('general-web-settings.png') });
});
