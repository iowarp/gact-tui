/**
 * P4.R acceptance: the fresh React app boots and connects to a backend.
 *
 * This is the failing-first spec for gact-tui#330 — red until the scaffold
 * renders a connect screen and completes a handshake through @clio/core.
 */
import { expect, test } from '@playwright/test';
import { connectMockBackend, installMockBackend, refuseDefaultBackends } from './mock-backend';

/**
 * Clears the saved-backend registry so a case starts from a genuinely COLD
 * boot. Autoconnect makes boot depend on persisted state, so any case
 * asserting boot behaviour must own its starting state rather than inherit
 * whatever a previous case saved.
 *
 * Deliberately not a file-wide beforeEach: it re-runs on every navigation,
 * including the reload the autoconnect case depends on.
 */
async function coldBoot(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('clio.backends.v3');
      localStorage.removeItem('clio.backend.last-url.v3');
    } catch {
      // No storage in this context; boot is already cold.
    }
  });
}


test('boots to the connect screen', async ({ page }) => {
  await coldBoot(page);
  await refuseDefaultBackends(page);
  await installMockBackend(page);
  await page.goto('/');

  await expect(page.getByTestId('connect-screen')).toBeVisible();
  await expect(page.getByTestId('connect-url')).toBeVisible();
  await expect(page.getByTestId('connect-submit')).toBeVisible();
});

test('connects to a backend and lands on its sessions', async ({ page }) => {
  await connectMockBackend(page);

  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();
  // The row is identified by its title, as the rail labels it.
  await expect(page.getByRole('button', { name: 'Boot smoke session', exact: true })).toBeVisible();
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
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });

  // A SUCCESSFUL boot must be silent. Under splash-first boot (slice F) the
  // app probes the brand default itself, so the mock serves that origin and
  // no form is ever touched; an unreachable-default cold boot legitimately
  // logs its refusals and is covered by the boot-splash fallback spec.
  await coldBoot(page);
  await installMockBackend(page, { origin: 'http://127.0.0.1:17800' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();

  // Print what was captured: a flake that names itself is diagnosable; one
  // that only reports "expected []" is not.
  expect(errors, `console errors during boot: ${errors.join(' | ')}`).toEqual([]);
});

test('autoconnects to the last-used backend without typing', async ({ page }) => {
  // The feature the beforeEach above suppresses for the other cases: with a
  // saved backend, boot must reach the sessions rail on its own.
  await installMockBackend(page);
  await connectMockBackend(page);
  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();
  await expect(page.getByTestId('connect-screen')).toHaveCount(0);
});
