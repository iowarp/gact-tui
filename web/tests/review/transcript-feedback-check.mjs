import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.CLIO_REVIEW_OUTPUT ?? 'test-results/transcript-feedback');
const endpoint = process.env.CLIO_REVIEW_ENDPOINT ?? 'http://127.0.0.1:5217';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const captures = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['phone', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${endpoint}/tests/review/transcript-entries.html?feedback=1&theme=light`);
    await page.evaluate(() => document.fonts.ready);
    const response = page.locator('#message-review-turn');
    const feedback = page.getByText('Focus on calibration before comparing the sites.', {
      exact: true,
    });
    await expect(feedback).toHaveCount(1);
    await expect(feedback).toBeVisible();
    expect(
      await response.evaluate((node) => {
        const user = node.querySelector('#message-review-feedback');
        const after = [...node.querySelectorAll('p')].find((p) =>
          p.textContent.startsWith('The records use matching units.'),
        );
        return Boolean(
          user && after && user.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    await page.getByRole('button', { name: 'Stream recorded turn' }).click();
    await expect(response.locator('[data-slot="message-completion-footer"]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const node = document.querySelector('#message-review-feedback');
          node?.scrollIntoView({ block: 'center', behavior: 'instant' });
          return Boolean(node);
        }),
      )
      .toBe(true);
    await expect(feedback).toBeVisible();
    const filename = `iteration-feedback-${name}-light-fixture.png`;
    await page.screenshot({ path: resolve(output, filename) });
    captures.push(filename);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Finish recorded turn' }).click();
    await expect(response.locator('[data-slot="message-completion-footer"]')).toContainText(
      '8 (4 failed) tool calls',
    );
    await expect(feedback).toHaveCount(1);
  }
  expect(errors).toEqual([]);
  await writeFile(
    resolve(output, 'feedback-review.json'),
    JSON.stringify(
      {
        fixture: true,
        actualComponents: true,
        result: 'PASS',
        captures,
        errors,
        checks: [
          'feedback before subsequent work',
          'one user identity',
          'no live footer',
          'terminal footer restored',
          'no horizontal overflow',
        ],
      },
      null,
      2,
    ),
  );
  process.stdout.write('Iteration feedback browser review PASS\n');
} finally {
  await browser.close();
}
