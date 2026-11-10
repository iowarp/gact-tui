import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 780 },
] as const;
const THEMES = ['dark', 'light'] as const;

async function open(page: Page, query: string) {
  await page.goto(`/tests/review/component-gallery.html?${query}`);
  await expect(page.locator('main h1', { hasText: 'Shared component gallery' })).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

async function expectOneLine(page: Page, selector: string) {
  const heights = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const lineHeight =
        Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
      return {
        text: element.textContent ?? '',
        lines: Math.round(element.getBoundingClientRect().height / lineHeight),
      };
    }),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const { text, lines } of heights) expect(lines, text).toBeLessThanOrEqual(1);
}

for (const theme of THEMES) {
  for (const viewport of WIDTHS) {
    test(`gallery ${theme} ${viewport.width}px keeps rows on one line`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await open(page, `theme=${theme}`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThan(1);

      const rows = page.locator('[data-slot="list-row"]');
      for (const box of await rows.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      ))
        expect(box).toBe(28);
      await expectOneLine(page, '[data-slot="menu-row"] > span:nth-child(2) > span');
      await expectOneLine(page, '[data-slot="list-row"] .truncate');

      // Hover actions are transparent at rest, so showing them never moves the row.
      const first = rows.first();
      await first.scrollIntoViewIfNeeded();
      const title = first.locator('.truncate').first();
      const before = await title.boundingBox();
      const actions = first.locator('[data-slot="list-row-actions"]');
      await expect(actions).toHaveCSS('opacity', '0');
      await first.hover();
      await expect(actions).toHaveCSS('opacity', '1');
      expect(await title.boundingBox()).toEqual(before);
      await page.mouse.move(0, 0);

      await page.screenshot({
        path: testInfo.outputPath(`gallery-${theme}-${viewport.width}.png`),
        fullPage: true,
      });
    });

    for (const overlay of ['menu', 'dialog', 'confirm', 'window', 'shortcuts'] as const) {
      test(`${overlay} ${theme} ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await open(page, `theme=${theme}&view=${overlay}`);
        const surface = overlay === 'menu' ? page.getByRole('menu') : page.getByRole('dialog');
        await expect(surface).toBeVisible();
        const box = (await surface.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
        if (overlay === 'window') {
          await expect(surface.getByRole('button', { name: /back/i })).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(surface).toBeHidden();
          await open(page, `theme=${theme}&view=${overlay}`);
          await expect(page.getByRole('dialog')).toBeVisible();
        }
        if (overlay === 'dialog' || overlay === 'confirm') {
          await expect(surface.getByRole('button', { name: /cancel/i })).toBeFocused();
        }
        await page.waitForTimeout(250);
        await page.screenshot({
          path: testInfo.outputPath(`${overlay}-${theme}-${viewport.width}.png`),
        });
      });
    }
  }
}

test('a 260px activity row keeps its name, or its target when it has one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await open(page, 'theme=dark');
  const rows = page.getByTestId('narrow-activity-rows').locator('[data-activity-row]');
  await expect(rows).toHaveCount(2);
  const nameOnly = rows.nth(0).locator('[data-slot="list-row-title"]');
  await expect(nameOnly).toBeVisible();
  expect((await nameOnly.boundingBox())!.width).toBeGreaterThan(80);
  await expect(nameOnly).toHaveCSS('text-overflow', 'ellipsis');
  const withTarget = rows.nth(1);
  expect((await withTarget.locator('[data-slot="list-row-title"]').boundingBox())!.width).toBe(1);
  expect(
    (await withTarget.locator('[data-slot="activity-argument"]').boundingBox())!.width,
  ).toBeGreaterThan(80);
});

test('Mac keys render with ⌘ and the catalog exceptions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'theme=dark&platform=mac');
  const keys = page.getByRole('region', { name: 'Keys' });
  await expect(keys).toContainText('⌘');
  await expect(keys).not.toContainText('Ctrl');
  await page.screenshot({ path: testInfo.outputPath('gallery-dark-1280-mac.png'), fullPage: true });
  await open(page, 'theme=light&platform=mac&view=shortcuts');
  await expect(page.getByRole('dialog')).toContainText('⌘');
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath('shortcuts-light-1280-mac.png') });
});
