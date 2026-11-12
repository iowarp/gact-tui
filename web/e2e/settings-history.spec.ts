import { expect, test } from '@playwright/test';
import { installSearchFixture } from './search-fixture.mjs';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('browser Back closes Settings, Forward reopens it, and × or Esc add no history entry', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const fixture = await installSearchFixture(page, endpoint);
  const sessionPath = `/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}`;
  await page.goto(sessionPath);
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeAttached();
  const entry = () => page.evaluate(() => (history.state as { idx?: number } | null)?.idx);
  const before = await entry();
  const settings = page.getByRole('dialog', { name: 'Settings' });

  await page.keyboard.press('ControlOrMeta+Comma');
  await expect(settings).toBeVisible();
  // Moving between sections stays one history entry.
  await settings
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Appearance' })
    .click();
  await expect(page).toHaveURL(/\/settings\/appearance$/u);
  await expect(settings.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();

  await page.goBack();
  await expect(settings).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sessionPath}$`, 'u'));
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeVisible();

  await page.goForward();
  await expect(settings).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/appearance$/u);
  await expect(settings.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();

  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sessionPath}$`, 'u'));
  expect(await entry()).toBe(before);

  await page.keyboard.press('ControlOrMeta+Comma');
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sessionPath}$`, 'u'));
  expect(await entry()).toBe(before);
  expect(errors).toEqual([]);
});
