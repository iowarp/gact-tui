/**
 * Slice F failing-first spec — splash + auto-probe boot (P5 inventory F1–F2).
 *
 * The web.old semantic being ported: the connect form is NEVER the default
 * route. Boot shows a Splash that probes the saved backends and then the
 * brand default (:17800 in every profile, both host forms); the form appears
 * only when every candidate fails.
 */
import { expect, test } from '@playwright/test';
import { installMockBackend } from './mock-backend';

/** Both host forms of the brand-default backend the splash probes. */
const DEFAULT_ORIGINS = ['http://127.0.0.1:17800', 'http://localhost:17800'];

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

test('cold boot shows the splash; the connect form appears only as fallback', async ({ page }) => {
  await coldBoot(page);
  for (const origin of DEFAULT_ORIGINS) {
    await page.route(`${origin}/**`, (route) => route.abort('connectionrefused'));
  }

  await page.goto('/');

  // The splash is the default route — the form must not be first paint.
  await expect(page.getByTestId('splash-screen')).toBeVisible();

  // Every candidate refused -> the form appears, carrying the typed reason
  // rather than a blank card (no silent fallback).
  await expect(page.getByTestId('connect-screen')).toBeVisible();
  await expect(page.getByTestId('connect-error')).toContainText(/unreachable|refused|failed/i);
});

test('splash reaches the shell on its own when the brand default answers', async ({ page }) => {
  await coldBoot(page);
  // Record whether the connect form EVER attaches — asserting on a final
  // state alone would miss a form that flashed and was replaced.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawConnectForm: boolean };
    w.__sawConnectForm = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="connect-screen"]')) {
        w.__sawConnectForm = true;
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  await installMockBackend(page, { origin: 'http://127.0.0.1:17800' });

  await page.goto('/');

  await expect(page.getByRole('navigation', { name: /workspaces/i })).toBeVisible();
  const sawForm = await page.evaluate(
    () => (window as unknown as { __sawConnectForm: boolean }).__sawConnectForm,
  );
  expect(sawForm, 'the connect form must never appear on an auto-probed boot').toBe(false);
});
