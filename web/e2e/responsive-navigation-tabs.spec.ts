import { expect, test, type Locator } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((address) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
});

for (const width of [1100, 1600]) {
  test(`collapsed navigation previews over content and stays interactive at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    // The opening placeholder has its own shell; exercise the restored session.
    await expect(
      page.getByText('Review the EarthScope station evidence and keep provenance visible.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    if (width === 1600) await page.locator('[data-slot="sidebar-trigger"]').click();
    const sidebar = page
      .locator('[data-slot="sidebar"]')
      .filter({ has: page.getByRole('navigation', { name: 'Workspace navigation' }) });
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    const content = page.locator('#workspace-content');
    const before = await content.boundingBox();
    const cookie = await page.evaluate(() => document.cookie);
    await sidebar.hover();
    await expect(sidebar).toHaveAttribute('data-preview', 'true');
    const panel = sidebar.locator('[data-slot="sidebar-container"]');
    expect((await panel.boundingBox())!.width).toBeGreaterThan(216);
    expect(await content.boundingBox()).toEqual(before);
    await expect(sidebar.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('navigation-hover.png') });
    await page.getByRole('button', { name: 'Maximize canvas', exact: true }).hover();
    await expect(sidebar).not.toHaveAttribute('data-preview');
    expect(await page.evaluate(() => document.cookie)).toBe(cookie);

    await sidebar.hover();
    const actions = sidebar.getByRole('button', {
      name: 'Workspace actions for flat-NDP',
      exact: true,
    });
    await actions.click();
    const edit = page.getByRole('menuitem', { name: 'Edit workspace', exact: true });
    await expect(edit).toBeVisible();
    await edit.hover();
    await expect(sidebar).toHaveAttribute('data-preview', 'true');
    await page.screenshot({ path: testInfo.outputPath('workspace-menu-from-flyout.png') });
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);
    await expect(actions).toBeFocused();
    await page.getByRole('button', { name: 'Maximize canvas', exact: true }).hover();
    await expect(sidebar).not.toHaveAttribute('data-preview');

    // Keyboard navigation can hold a temporary preview; mouse focus cannot.
    await page.keyboard.press('Tab');
    await sidebar.hover();
    await sidebar.getByRole('link', { name: 'Settings', exact: true }).focus();
    await page.getByRole('button', { name: 'Maximize canvas', exact: true }).hover();
    await expect(sidebar).toHaveAttribute('data-preview', 'true');
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveAttribute('data-preview');
    await expect(sidebar).toBeFocused();
    await sidebar.hover();
    await sidebar.getByRole('link', { name: 'Settings', exact: true }).focus();
    const composer = page.locator('[data-slot="clio-composer-stack"] [contenteditable="true"]');
    await composer.click();
    await expect(composer).toBeFocused();
    await expect(sidebar).not.toHaveAttribute('data-preview');
    await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
    await page.mouse.move(width - 20, 850);
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await sidebar.hover();
    await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
  });
}

test('sidebar clicks stay temporary and collapsed icons share one center line', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();
  await page.locator('[data-slot="sidebar-trigger"]').click();
  const sidebar = page.locator('[data-slot="sidebar"]').filter({
    has: page.getByRole('navigation', { name: 'Workspace navigation' }),
  });
  await page.mouse.move(1500, 850);
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  const centers = await sidebar.evaluate((element) =>
    [...element.querySelectorAll('[data-sidebar="menu-button"], button[aria-label*=" workspace "]')]
      .map((button) => button.querySelector('svg, img, [style*="mask"]'))
      .filter((icon): icon is Element => Boolean(icon && icon.getBoundingClientRect().width))
      .map((icon) => {
        const bounds = icon.getBoundingClientRect();
        return bounds.x + bounds.width / 2;
      }),
  );
  expect(centers.length).toBeGreaterThanOrEqual(6);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('collapsed-alignment.png') });
  const cookie = await page.evaluate(() => document.cookie);
  await sidebar.hover();
  await sidebar.getByRole('link', { name: /EarthScope NDP evidence review/u }).click();
  await page.mouse.move(1500, 850);
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  await expect(sidebar).not.toHaveAttribute('data-preview');
  expect(await page.evaluate(() => document.cookie)).toBe(cookie);
  const controls = [
    sidebar.getByRole('button', { name: 'Search work', exact: true }),
    sidebar.getByRole('button', { name: 'Create or import', exact: true }),
    sidebar.locator('[data-slot="sidebar-header"] [data-sidebar="menu-button"]').first(),
  ];
  for (const control of controls) {
    await sidebar.hover();
    await expect(sidebar).toHaveAttribute('data-preview', 'true');
    await control.click();
    await page.mouse.move(1500, 850);
    await expect(sidebar).not.toHaveAttribute('data-preview');
    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await expect(sidebar).not.toHaveAttribute('data-preview');
    expect(await page.evaluate(() => document.cookie)).toBe(cookie);
  }
  await page.locator('[data-slot="sidebar-trigger"]').click();
  await page.mouse.move(1500, 850);
  await expect(sidebar).toHaveAttribute('data-state', 'expanded');
  await expect(sidebar).not.toHaveAttribute('data-preview');
});

async function expectSelectedTabVisible(canvas: Locator) {
  const tab = canvas.locator('[data-slot="canvas-header"] [role="tab"][aria-selected="true"]');
  await expect
    .poll(async () =>
      tab.evaluate((element) => {
        const wrapper = element.parentElement!;
        const strip = element.closest('[data-slot="canvas-header"]')!.firstElementChild!;
        const visible = strip.getBoundingClientRect();
        const selected = wrapper.getBoundingClientRect();
        return selected.left >= visible.left - 1 && selected.right <= visible.right + 1;
      }),
    )
    .toBe(true);
}

test('selected canvas tab stays fully visible through resizing, reordering and maximize/restore', async ({
  page,
}, testInfo) => {
  const longTitle = 'Station availability and morning rebalancing report';
  await page.addInitScript((label) => {
    localStorage.setItem(
      'clio.workbench-tabs.v1:ws_flat_ndp',
      JSON.stringify({
        activeTabId: 'session',
        tabs: [{ id: 'session', kind: 'session', label }],
      }),
    );
  }, longTitle);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(
    page.getByText('Review the EarthScope station evidence and keep provenance visible.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas', exact: true });
  for (const name of [
    'File explorer',
    'Workspace resources',
    'Session artifacts',
    'Conversation agent',
    'Work',
  ]) {
    await canvas.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
  for (const width of [1280, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await expectSelectedTabVisible(canvas);
  }
  await canvas.getByRole('tab', { name: 'Agent', exact: true }).click();
  await expectSelectedTabVisible(canvas);
  const resize = await page
    .getByRole('separator', { name: 'Resize workspace canvas', exact: true })
    .boundingBox();
  await page.mouse.move(resize!.x + resize!.width / 2, resize!.y + resize!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize!.x + 90, resize!.y + resize!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expectSelectedTabVisible(canvas);
  await page.screenshot({ path: testInfo.outputPath('selected-tab-resized.png') });
  await canvas.getByRole('tab', { name: 'Agent', exact: true }).press('Alt+ArrowLeft');
  await expectSelectedTabVisible(canvas);
  await canvas.getByRole('button', { name: 'Maximize canvas', exact: true }).click();
  await expectSelectedTabVisible(canvas);
  await page.keyboard.press('Escape');
  await expectSelectedTabVisible(canvas);
  await canvas.getByRole('tab', { name: longTitle, exact: true }).click();
  for (const width of [640, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expectSelectedTabVisible(
      page.getByRole('complementary', { name: 'Workspace canvas', exact: true }),
    );
  }
  await page.screenshot({ path: testInfo.outputPath('selected-long-tab-narrow.png') });
});
