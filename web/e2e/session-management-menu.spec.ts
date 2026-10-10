import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const title = 'EarthScope NDP evidence review';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
});

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`session header menu is complete and fits at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        ({ address, theme }) => {
          localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
          localStorage.setItem('theme', theme);
        },
        { address: endpoint, theme },
      );
      await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
      await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
      const menu = page.getByRole('menu');
      for (const name of [
        'Rename session',
        'Pin session',
        'Branch into a new session',
        'Share read-only link',
        'Export session',
        'Compact conversation',
        'Remove last message',
        'Archive session',
        'Delete session',
      ]) {
        await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
      }
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-header-menu.png`) });
      await menu.getByRole('menuitem', { name: 'Export session', exact: true }).hover();
      await expect(
        page.getByRole('menuitem', { name: 'Download HTML', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('menuitemcheckbox', { name: 'Include workspace files', exact: true })
        .click();
      await expect(
        page.getByRole('menuitemcheckbox', { name: 'Include session artifacts', exact: true }),
      ).toBeChecked();
      await expect(page.getByRole('menuitem', { name: 'Download ZIP', exact: true })).toBeVisible();
      const submenu = page
        .getByRole('menu')
        .filter({ has: page.getByRole('menuitem', { name: 'Download ZIP', exact: true }) });
      const subBox = (await submenu.boundingBox())!;
      expect(subBox.x).toBeGreaterThanOrEqual(0);
      expect(subBox.x + subBox.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-export-menu.png`) });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      // A destructive menu entry must open the same confirmation as the sidebar.
      await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Delete session', exact: true }).click();
      const confirmation = page.getByRole('alertdialog');
      await expect(confirmation).toContainText('permanently removes the session');
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-delete-confirmation.png`),
      });
      await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(
        page.getByRole('button', { name: `Actions for ${title}`, exact: true }),
      ).toBeEnabled();
    });
  }
}

test('header rename and pin refresh both the header and sidebar menus', async ({ page }) => {
  await page.addInitScript((address) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
  }, endpoint);
  let changes: Record<string, unknown> = {};
  await page.route(`${endpoint}/v1/sessions**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v1/sessions/sess_flat_ndp' && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      // The API accepts pin in metadata and returns its normalized root field.
      changes = {
        ...changes,
        ...body,
        ...(body.metadata?.pinned !== undefined ? { pinned: body.metadata.pinned } : {}),
      };
      const response = await page.request.get(`${endpoint}/v1/sessions`);
      const value = await response.json();
      const session = value.sessions.find((item: { id: string }) => item.id === 'sess_flat_ndp');
      await route.fulfill({ json: { ...session, ...changes } });
      return;
    }
    if (url.pathname === '/v1/sessions' && route.request().method() === 'GET') {
      const response = await route.fetch();
      const value = await response.json();
      await route.fulfill({
        response,
        json: {
          ...value,
          sessions: value.sessions.map((session: { id: string }) =>
            session.id === 'sess_flat_ndp' ? { ...session, ...changes } : session,
          ),
        },
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename session', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename session', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Renamed evidence review');
  await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
  const header = page.getByRole('button', {
    name: 'Actions for Renamed evidence review',
    exact: true,
  });
  await expect(header).toBeVisible();
  const sidebar = page.getByRole('button', {
    name: 'Session actions for Renamed evidence review',
    exact: true,
  });
  await expect(sidebar).toBeAttached();
  await header.click();
  await page.getByRole('menuitem', { name: 'Pin session', exact: true }).click();
  await header.click();
  await expect(page.getByRole('menuitem', { name: 'Unpin session', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await sidebar.click();
  await expect(page.getByRole('menuitem', { name: 'Unpin session', exact: true })).toBeVisible();
});
