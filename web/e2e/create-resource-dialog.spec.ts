import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('a create menu opened while the conversation is loading stays open once it loads', async ({
  page,
}) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((value) => {
    if (window !== window.top) return;
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
  }, endpoint);
  let releaseSessions!: () => void;
  const sessionsReleased = new Promise<void>((resolve) => (releaseSessions = resolve));
  await page.route(
    (url) => url.pathname === '/v1/sessions',
    async (route) => {
      await sessionsReleased;
      await route.continue();
    },
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  const restoring = page.getByText('Restoring saved messages now', { exact: false });
  await expect(restoring).toBeVisible();
  // The left bar's header menu: it must survive the shell finishing its load.
  const trigger = page.locator('[data-sidebar="header"] [data-connection-state]');
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  releaseSessions();
  // The open menu hides the rest of the page from the accessibility tree, so
  // read the shell through attributes rather than roles.
  await expect(page.locator('[aria-label="Workspace canvas loading"]')).toHaveCount(0);
  await expect(restoring).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
});
