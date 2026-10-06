import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('session creation expands downward from a stable corner and keeps actions reachable in small windows', async ({
  page,
}, testInfo) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((value) => {
    if (window !== window.top) return;
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'system');
  }, endpoint);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New session', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create', exact: true });
  const fields = dialog.getByRole('region', { name: 'Creation options', exact: true });
  const advanced = dialog.getByRole('button', { name: 'Advanced session behavior', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Session name', exact: true })
    .fill('Review station data');
  const collapsedBox = (await dialog.boundingBox())!;
  const collapsedTrigger = (await advanced.boundingBox())!;
  expect(collapsedBox.width).toBeGreaterThanOrEqual(650);
  await advanced.click();
  await expect(advanced).toHaveAttribute('aria-expanded', 'true');
  const expandedBox = (await dialog.boundingBox())!;
  const expandedTrigger = (await advanced.boundingBox())!;
  expect(expandedBox.height).toBeGreaterThan(collapsedBox.height);
  expect(expandedBox.x).toBeCloseTo(collapsedBox.x, 0);
  expect(expandedBox.y).toBeCloseTo(collapsedBox.y, 0);
  expect(expandedBox.width).toBeCloseTo(collapsedBox.width, 0);
  expect(expandedTrigger.y).toBeCloseTo(collapsedTrigger.y, 0);
  expect(expandedTrigger.x).toBeCloseTo(collapsedTrigger.x, 0);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    else await expect(page.locator('html')).not.toHaveClass(/dark/);
    const metrics = await fields.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1);
    for (const name of ['Default work mode', 'Confirmations']) {
      await expect(dialog.getByRole('combobox', { name, exact: true })).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath(`create-expanded-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 440 });
  // The browser applies dynamic viewport units on its next layout frame.
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeGreaterThanOrEqual(15);
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(425);
  await expect(
    dialog.getByRole('button', { name: 'Create session', exact: true }),
  ).toBeInViewport();
  await fields.hover();
  await page.mouse.wheel(0, 600);
  await expect(
    dialog.getByRole('combobox', { name: 'Confirmations', exact: true }),
  ).toBeInViewport();
  expect(await fields.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('create-expanded-short-window.png') });
  await dialog.getByRole('combobox', { name: 'Default work mode', exact: true }).click();
  await page.getByRole('option', { name: 'Deep research', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Default work mode', exact: true })).toHaveText(
    'Deep research',
  );
  await advanced.click();
  await expect(advanced).toHaveAttribute('aria-expanded', 'false');
  await expect(
    dialog.getByRole('combobox', { name: 'Default work mode', exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Workspace', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Workspace name', exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Create workspace', exact: true }),
  ).toBeInViewport();
  await dialog.getByRole('tab', { name: 'Session', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Session name', exact: true })).toHaveValue(
    'Review station data',
  );
  await advanced.click();
  await expect(dialog.getByRole('combobox', { name: 'Default work mode', exact: true })).toHaveText(
    'Deep research',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Desktop and mobile shells mount separately at their responsive breakpoint.
  // Open the mobile dialog through its real navigation rather than carrying an
  // open desktop modal across that shell replacement.
  await page.setViewportSize({ width: 390, height: 640 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New session', exact: true }).click();
  await advanced.click();
  const phoneBox = (await dialog.boundingBox())!;
  expect(phoneBox.x).toBeGreaterThanOrEqual(15);
  expect(phoneBox.x + phoneBox.width).toBeLessThanOrEqual(375);
  expect(
    await fields.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThan(2);
  await expect(
    dialog.getByRole('button', { name: 'Create session', exact: true }),
  ).toBeInViewport();
  await fields.hover();
  await page.mouse.wheel(0, 600);
  await expect(
    dialog.getByRole('combobox', { name: 'Confirmations', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('create-expanded-phone.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
