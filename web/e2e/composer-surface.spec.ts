import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

for (const theme of ['dark', 'light'] as const) {
  test(`keeps the ${theme} composer distinct with stable focus geometry`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
    await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
    await page.request.post(
      `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
      { data: { selected_options: ['table'] } },
    );
    await page.addInitScript(
      ({ endpoint, theme }) => {
        localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
        localStorage.setItem('theme', theme);
      },
      { endpoint, theme },
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    const composer = page.locator('[data-slot="clio-composer-stack"]');
    const surface = composer.locator('form > [data-slot="input-group"]');
    const editor = composer.getByRole('combobox');
    await expect(editor).toBeVisible();
    await expect(
      page
        .getByRole('log', { name: 'Conversation' })
        .getByText('Review the EarthScope station evidence and keep provenance visible.', {
          exact: true,
        }),
    ).toBeVisible();

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('heading', { name: 'EarthScope NDP evidence review' }).click();
      const idle = await surface.boundingBox();
      const colors = await surface.evaluate((node) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const pixel = () => Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        const sample = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return pixel();
        };
        const background = sample(getComputedStyle(document.body).backgroundColor);
        const ancestors: Element[] = [];
        for (let element: Element | null = node; element; element = element.parentElement) {
          ancestors.unshift(element);
        }
        for (const element of ancestors) {
          context.fillStyle = getComputedStyle(element).backgroundColor;
          context.fillRect(0, 0, 1, 1);
        }
        const surface = pixel();
        const control = node.querySelector('[data-slot="input-group-control"]')!;
        const placeholder = sample(getComputedStyle(control, '::before').color);
        const luminance = (rgb: number[]) =>
          rgb.reduce((sum, channel, index) => {
            const value = channel / 255;
            const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
          }, 0);
        const contrast = (a: number[], b: number[]) => {
          const light = luminance(a);
          const dark = luminance(b);
          return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
        };
        return {
          background,
          surface,
          placeholder,
          surfaceContrast: contrast(surface, background),
          placeholderContrast: contrast(placeholder, surface),
          border: getComputedStyle(node).borderColor,
          cssSurface: getComputedStyle(node).backgroundColor,
          cssForm: getComputedStyle(node.parentElement!).backgroundColor,
        };
      });
      const colorPath = testInfo.outputPath(`${theme}-${width}-colors.json`);
      await writeFile(colorPath, JSON.stringify(colors, null, 2));
      await testInfo.attach(`${theme}-${width}-colors`, { path: colorPath });
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-idle.png`) });
      await composer.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-idle-composer.png`),
      });
      // Surface separation is a visual design threshold; text meets WCAG AA contrast.
      expect(colors.surfaceContrast).toBeGreaterThan(theme === 'dark' ? 1.25 : 1.08);
      expect(colors.placeholderContrast).toBeGreaterThanOrEqual(4.5);
      await editor.click();
      await expect(editor).toBeFocused();
      await expect
        .poll(() => surface.evaluate((node) => getComputedStyle(node).borderColor))
        .not.toBe(colors.border);
      await expect
        .poll(() => surface.evaluate((node) => getComputedStyle(node).boxShadow))
        .toContain('0px 0px 0px 2px');
      expect(await surface.boundingBox()).toEqual(idle);
      expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-focused.png`) });
      await composer.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-focused-composer.png`),
      });
      await editor.fill('Keep this draft while I review the report.');
      await expect
        .poll(() => surface.evaluate((node) => getComputedStyle(node).backgroundColor))
        .toBe(colors.cssSurface);
      await page.keyboard.press('Tab');
      await expect(composer.getByRole('button', { name: 'Change model' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Choose a model' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(composer.getByRole('button', { name: 'Change model' })).toBeFocused();
      await expect(editor).toContainText('Keep this draft while I review the report.');
      await editor.fill('');
    }
    expect(errors).toEqual([]);
  });
}
