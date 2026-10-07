import { expect, test } from '@playwright/test';

test('long dialog headings clear the close control and expansion preserves the anchor', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/tests/review/dialog-layout.html');
    const opener = page.getByRole('button', { name: 'Open document dialog', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const heading = dialog.getByRole('heading');
    const text = await heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().toJSON();
    });
    const close = (await dialog.getByRole('button', { name: 'Close', exact: true }).boundingBox())!;
    expect(text.right).toBeLessThanOrEqual(close.x - 4);
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThan(2);
    const details = dialog.getByRole('button', { name: 'Review details', exact: true });
    const before = (await dialog.boundingBox())!;
    const trigger = (await details.boundingBox())!;
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    const after = (await dialog.boundingBox())!;
    const expandedTrigger = (await details.boundingBox())!;
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(expandedTrigger.x).toBeCloseTo(trigger.x, 0);
    expect(expandedTrigger.y).toBeCloseTo(trigger.y, 0);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`dialog-expanded-${viewport.width}.png`) });
    await page.setViewportSize({ width: viewport.width, height: 440 });
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(425);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    const options = dialog.getByRole('region', { name: 'Document options', exact: true });
    await options.hover();
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => options.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByText('Recorded document detail 16', { exact: true })).toBeInViewport();
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('long select options remain readable within the viewport and preserve nested keyboard focus', async ({
  page,
}, testInfo) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto('/tests/review/dialog-layout.html');
    await page.getByRole('button', { name: 'Open document dialog', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const select = dialog.getByRole('combobox', { name: 'Destination workspace', exact: true });
    await select.click();
    const menu = page.getByRole('listbox');
    const option = menu.getByRole('option', { name: /Sensor field observations/ });
    await expect(option).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(
      await menu.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThan(2);
    const label = await option.evaluate((element) => {
      const text = element.querySelector('span:last-child')!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getBoundingClientRect().toJSON();
    });
    expect(label.right).toBeLessThanOrEqual(box.x + box.width - 8);
    if (width === 390) expect(label.height).toBeGreaterThan(25);
    await page.screenshot({ path: testInfo.outputPath(`select-long-label-${width}.png`) });
    await option.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(select).toBeFocused();
    await expect(dialog).toBeVisible();
    await select.press('Enter');
    await page.getByRole('option', { name: 'Review archive', exact: true }).click();
    await expect(select).toHaveText('Review archive');
    await expect(select).toBeFocused();
    await select.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Open document dialog', exact: true }),
    ).toBeFocused();
  }
});

test('confirmation dialogs fit narrow windows with long recorded filenames', async ({
  page,
}, testInfo) => {
  for (const width of [390, 280]) {
    await page.setViewportSize({ width, height: 440 });
    await page.goto('/tests/review/dialog-layout.html');
    const opener = page.getByRole('button', { name: 'Open confirmation', exact: true });
    await opener.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThan(2);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`confirmation-${width}.png`) });
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});
