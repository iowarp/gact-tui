/**
 * P4.R acceptance: the fresh React app boots and connects to a backend.
 *
 * This is the failing-first spec for gact-tui#330 — red until the scaffold
 * renders a connect screen and completes a handshake through @clio/core.
 */
import { expect, test } from '@playwright/test';
import {
  MOCK_BACKEND,
  MOCK_SESSION_ID,
  connectMockBackend,
  installMockBackend,
} from './mock-backend';

test('boots to the connect screen', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');

  await expect(page.getByTestId('connect-screen')).toBeVisible();
  await expect(page.getByTestId('connect-url')).toBeVisible();
  await expect(page.getByTestId('connect-submit')).toBeVisible();
});

test('connects to a backend and lands on its sessions', async ({ page }) => {
  await connectMockBackend(page);

  await expect(page.getByTestId('connected-backend')).toContainText(MOCK_BACKEND);
  await expect(page.getByTestId(`session-row-${MOCK_SESSION_ID}`)).toBeVisible();
});

test('surfaces a typed reason when the backend is unreachable', async ({ page }) => {
  // No silent fallback: an unreachable backend must say so on the surface,
  // never strand the user on a blank or perpetually-pending screen.
  await connectMockBackend(page, { failWithStatus: 503 });

  const error = page.getByTestId('connect-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/503|unreachable|failed/i);
  await expect(page.getByTestId('connect-screen')).toBeVisible();
});

test('refuses a backend whose contract version is not supported', async ({ page }) => {
  await connectMockBackend(page, { contract: 'GACT v0.1' });

  const error = page.getByTestId('connect-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/contract/i);
});

test('boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await connectMockBackend(page);
  await expect(page.getByTestId('connected-backend')).toBeVisible();

  expect(errors).toEqual([]);
});
