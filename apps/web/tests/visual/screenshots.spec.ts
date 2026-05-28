import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const screenshotDir = resolve(import.meta.dirname, '..', '..', 'screenshots');
mkdirSync(screenshotDir, { recursive: true });

function shot(name: string) {
  return resolve(screenshotDir, `${name}.png`);
}

test.describe('CLIO harness — visual proofs', () => {
  test('connect-screen renders wordmark and form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await expect(page.getByTestId('connect-submit')).toBeVisible();
    await page.screenshot({ path: shot('connect-screen'), fullPage: false });
  });

  test('empty-sidebar fixture shows zero-session affordance', async ({ page }) => {
    await page.goto('/?route=chat&fixture=empty-sidebar');
    await expect(page.getByTestId('sidebar-empty')).toBeVisible();
    await page.screenshot({ path: shot('empty-sidebar'), fullPage: false });
  });

  test('chat-streaming fixture shows assistant mid-response', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat-streaming'), fullPage: false });
  });

  test('permission-card fixture renders inline approval card', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permission-card')).toBeVisible();
    await page.screenshot({ path: shot('permission-card'), fullPage: false });
  });

  test('density-verbose shows full tool-call bodies', async ({ page }) => {
    await page.goto('/?route=chat&fixture=verbose');
    await expect(page.getByTestId('density-chip')).toContainText('verbose');
    await page.screenshot({ path: shot('density-verbose'), fullPage: false });
  });

  test('density-summary hides tool noise', async ({ page }) => {
    await page.goto('/?route=chat&fixture=summary');
    await expect(page.getByTestId('density-chip')).toContainText('summary');
    await page.screenshot({ path: shot('density-summary'), fullPage: false });
  });
});
