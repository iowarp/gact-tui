import { expect, test } from '@playwright/test';

test('Settings explains beta updates and preserves an explicit choice across reloads', async ({ page }) => {
  const endpoint = `http://127.0.0.1:${process.env.CLIO_FIXTURE_PORT ?? '18799'}`;
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((url) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([url]));
  }, endpoint);
  await page.route('https://api.github.com/repos/*/*/releases?*', (route) => route.fulfill({
    json: [{ tag_name: 'v0.9.5-beta.2', draft: false, prerelease: true,
      published_at: '2026-10-03T12:00:00Z', assets: [{ name: 'latest-lite.json' }] }],
  }));
  await page.goto('/settings/desktop');
  const toggle = page.getByRole('switch', { name: 'Enable beta updates' });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/Beta releases may be unstable/);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('beta-update-settings.png') });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
});
