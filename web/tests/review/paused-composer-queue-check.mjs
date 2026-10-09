import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.CLIO_REVIEW_OUTPUT ?? 'test-results/paused-composer-queue');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
try {
  for (const [name, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5214/tests/review/paused-composer-queue.html');
    await expect(page.getByText('2 queued messages (paused)', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Manual queue action' })).toHaveText(
      'No queued message was sent automatically.',
    );
    await page.evaluate(() => document.fonts.ready);
    const queue = page.getByLabel('Queued messages', { exact: true });
    const bounds = await queue.boundingBox();
    if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width + 1)
      throw new Error('Queue overflows viewport');
    await page.screenshot({
      path: resolve(output, `paused-queue-${name}-fixture.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Send queued message now', exact: true })
      .first()
      .click();
    await expect(page.getByRole('status', { name: 'Manual queue action' })).toHaveText(
      'Explicitly sent Review the README',
    );
    await expect(page.getByText('1 queued messages (paused)', { exact: true })).toBeVisible();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(output, 'review.json'),
    JSON.stringify({ status: 'passed', viewports: ['1280x900', '390x844'], errors }, null, 2),
  );
} finally {
  await browser.close();
}
