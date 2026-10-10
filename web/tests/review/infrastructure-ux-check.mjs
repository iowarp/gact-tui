import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.env.CLIO_REVIEW_OUTPUT || 'test-results/infrastructure-ux');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
try {
  for (const [name, width, height] of [
    ['desktop', 1280, 900],
    ['narrow', 960, 960],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const section of ['overview', 'agent', 'tools', 'models']) {
      await page.goto(
        `http://127.0.0.1:5214/tests/review/infrastructure-ux.html?section=${section}`,
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (section === 'overview')
        await expect(page.getByText('Computer: WORKSTATION')).toBeVisible();
      if (section === 'agent') {
        await expect(page.getByText('Warnings (2)')).toBeVisible();
        await expect(page.getByLabel('Ready and working (6)')).not.toHaveAttribute('open');
      }
      if (section === 'tools')
        await expect(page.getByRole('heading', { name: 'Collect', exact: true })).toBeVisible();
      if (section === 'tools' && width < 1280) {
        await expect(page.getByRole('button', { name: 'View tool list' })).toBeVisible();
        await page.getByRole('button', { name: 'View tool list' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
      }
      if (section === 'models') {
        await expect(page.getByLabel('Storage root', { exact: true })).toHaveValue('');
        await expect(page.getByLabel('Storage root', { exact: true })).toHaveAttribute(
          'placeholder',
          'C:\\Users\\Alice\\AppData\\Local\\CLIO Desktop\\data\\clio-agent\\data',
        );
      }
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(async () => {
        await document.fonts.load('14px "Inter Variable"');
        await document.fonts.load('12px "JetBrains Mono Variable"');
        return (
          document.fonts.check('14px "Inter Variable"') &&
          document.fonts.check('12px "JetBrains Mono Variable"')
        );
      });
      if (!fonts) throw new Error('Review fonts failed to load');
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth > window.innerWidth + 1 ||
          [...document.querySelectorAll('main')].some(
            (main) => main.scrollWidth > main.clientWidth + 1,
          ),
      );
      if (overflow) throw new Error(`${section} overflows ${width}px`);
      await page.screenshot({
        path: resolve(output, `${section}-${name}-fixture.png`),
        fullPage: true,
      });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(output, 'review.json'),
    JSON.stringify(
      {
        status: 'passed',
        viewports: ['1280x900', '960x960', '390x844'],
        sections: ['overview', 'agent', 'tools', 'models'],
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  await writeFile(
    resolve(output, 'failure.txt'),
    JSON.stringify({ errors, body: await page.locator('body').innerText() }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
