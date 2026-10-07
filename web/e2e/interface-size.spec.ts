import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('interface size persists and keeps Settings readable from ultrawide to phone', async ({
  page,
}, testInfo) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript(
    (value) => localStorage.setItem('clio.recent-connections', JSON.stringify([value])),
    endpoint,
  );
  await page.goto('/settings/appearance');
  const choices = page.getByRole('radiogroup', { name: 'Interface size', exact: true });
  await expect(choices).toBeVisible();
  for (const size of [100, 125, 150]) {
    await choices.getByText(`${size}%`, { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-clio-interface-size', String(size));
    for (const width of [3840, 3440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: width >= 3440 ? 1440 : 900 });
      await choices.scrollIntoViewIfNeeded();
      const content = page.getByRole('region', { name: 'Settings content' });
      const label = content.getByRole('heading', { name: 'Interface size', exact: true });
      expect(
        await label.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      ).toBeCloseTo((14 * size) / 100, 1);
      if (width >= 1280) {
        const navigation = page.getByRole('link', { name: 'General', exact: true });
        expect(
          await navigation.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeCloseTo((13 * size) / 100, 1);
      }
      expect(
        await content.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await expect(choices.getByRole('radio', { name: `${size}%`, exact: true })).toBeChecked();
      const themeOptions = await page
        .getByRole('radiogroup', { name: 'Theme', exact: true })
        .locator('label')
        .evaluateAll((labels) =>
          labels.map((label) => {
            const outer = label.getBoundingClientRect();
            const text = label.querySelector(':scope > span')!.getBoundingClientRect();
            const icon = label.querySelector(':scope > svg')!.getBoundingClientRect();
            return {
              left: outer.left,
              right: outer.right,
              textLeft: text.left,
              textRight: text.right,
              iconLeft: icon.left,
              iconRight: icon.right,
              overlap:
                Math.max(0, Math.min(text.right, icon.right) - Math.max(text.left, icon.left)) *
                Math.max(0, Math.min(text.bottom, icon.bottom) - Math.max(text.top, icon.top)),
            };
          }),
        );
      for (const option of themeOptions) {
        expect(option.textLeft).toBeGreaterThanOrEqual(option.left);
        expect(option.textRight).toBeLessThanOrEqual(option.right);
        expect(option.iconLeft).toBeGreaterThanOrEqual(option.left);
        expect(option.iconRight).toBeLessThanOrEqual(option.right);
        expect(option.overlap).toBe(0);
      }
      if (size === 150 && (width === 3840 || width === 390)) {
        await page.screenshot({ path: testInfo.outputPath(`settings-${size}-${width}.png`) });
      }
    }
  }
  await page.reload();
  await expect(page.getByRole('radio', { name: '150%', exact: true })).toBeChecked();
  await choices.getByRole('radio', { name: '150%', exact: true }).press('ArrowLeft');
  await expect(choices.getByRole('radio', { name: '125%', exact: true })).toBeChecked();
  await choices.getByRole('radio', { name: '125%', exact: true }).press('ArrowRight');
  await expect(choices.getByRole('radio', { name: '150%', exact: true })).toBeChecked();
  await choices.getByText('100%', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-clio-interface-size', '100');
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).fontSize)).toBe(
    '16px',
  );
});

test('larger interface keeps the composer and anchored Create dialog reachable', async ({
  page,
}, testInfo) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('clio.appearance.v1', JSON.stringify({ interfaceSize: 150 }));
  }, endpoint);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [3840, 1280, 390]) {
    await page.setViewportSize({ width, height: width === 3840 ? 1600 : 844 });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    const composer = page.locator('form[data-slot="clio-composer"]');
    await expect(composer).toBeVisible();
    expect(
      await composer.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(composer.locator('button[type="submit"]')).toBeInViewport();
    const create = page.getByRole('button', { name: 'Create or import', exact: true });
    if (!(await create.isVisible())) {
      await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    }
    await create.click();
    await page.getByRole('menuitem', { name: 'New session', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create', exact: true });
    await expect(dialog).toBeVisible();
    const before = (await dialog.boundingBox())!;
    await dialog.getByRole('button', { name: 'Advanced session behavior', exact: true }).click();
    const after = (await dialog.boundingBox())!;
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(width);
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`create-150-${width}.png`) });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
