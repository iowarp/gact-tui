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
      ).toBeCloseTo((13 * size) / 100, 1);
      if (width >= 1280) {
        const navigation = page.getByRole('link', { name: 'General', exact: true });
        expect(
          await navigation.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeCloseTo((12.5 * size) / 100, 1);
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

test('larger interface keeps the composer and the centred New workspace dialog reachable', async ({
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
    // The row ends in one square: Stop while the fixture run works with nothing typed.
    await expect(
      composer.getByRole('button', { name: /^(?:Send|Stop|Steer|Queue)$/u }),
    ).toBeInViewport();
    // New conversation is a draft in place; New workspace opens the one create dialog.
    const create = page.getByRole('button', { name: 'New workspace', exact: true });
    if (!(await create.isVisible())) {
      await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    }
    await create.click();
    const dialog = page.getByRole('dialog', { name: 'New workspace', exact: true });
    await expect(dialog).toBeVisible();
    const settled = () =>
      dialog.evaluate((element) =>
        Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
      );
    await settled();
    const opened = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    if (width >= 600) {
      // Opens centred like every DialogFrame.
      expect(Math.abs(opened.x + opened.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(opened.y + opened.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
    }
    expect(opened.y).toBeGreaterThanOrEqual(0);
    expect(opened.y + opened.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(opened.x).toBeGreaterThanOrEqual(0);
    expect(opened.x + opened.width).toBeLessThanOrEqual(width);
    await expect(
      dialog.getByRole('textbox', { name: 'Workspace folder', exact: true }),
    ).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Browse', exact: true })).toBeInViewport();
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
