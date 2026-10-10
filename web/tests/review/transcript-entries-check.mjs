import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.CLIO_REVIEW_OUTPUT ?? 'test-results/transcript-entries');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error(message.text());
});
page.on('requestfailed', (request) =>
  console.error('Request failed:', request.url(), request.failure()),
);
page.on('response', (response) => {
  if (response.status() >= 400) console.error('HTTP failure:', response.status(), response.url());
});
const captures = [];
async function capture(name) {
  await page.screenshot({ path: resolve(output, name), fullPage: true });
  captures.push(name);
}
async function verifyContainment() {
  const spills = await page.locator('[data-slot="transcript-tool-details"]').evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < 0 || rect.right > window.innerWidth + 1;
      }).length,
  );
  if (spills) throw new Error('Inline tool details overflow the viewport.');
}
try {
  await page.goto('http://127.0.0.1:5214/tests/review/transcript-entries.html');
  await page.getByText('The revised recommendations are saved.', { exact: false }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (
      ![...document.fonts].some((font) => font.family.includes('Inter') && font.status === 'loaded')
    )
      throw new Error(
        'Inter did not load: ' +
          JSON.stringify({
            family: getComputedStyle(document.body).fontFamily,
            faces: [...document.fonts].map((font) => ({
              family: font.family,
              status: font.status,
            })),
            rules: [...document.styleSheets]
              .flatMap((sheet) => [...sheet.cssRules])
              .filter((rule) => rule instanceof CSSFontFaceRule)
              .map((rule) => rule.cssText)
              .slice(0, 2),
          }),
      );
  });
  const groups = page.getByRole('button', { name: /^Activity:/ });
  const thinking = page.locator('[data-slot="transcript-reasoning-text"]');
  const footer = page.locator('[data-slot="message-completion-footer"]');
  await expect(footer).toContainText('8 (4 failed) tool calls');
  await expect(footer).not.toContainText('·');
  const checkpoints = page.locator('[data-slot="model-checkpoint"]');
  await expect(checkpoints).toHaveCount(2);
  await expect(checkpoints.last()).toContainText('Switched to Claude Code');
  await expect(checkpoints.last()).not.toContainText('·');
  await expect(groups).toHaveCount(2);
  for (const button of await groups.all())
    await expect(button).not.toContainText(/\d|completed|failed|·/u);
  await expect(thinking).toHaveCount(0);
  for (const button of await groups.all())
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  await capture('entries-collapsed-desktop-fixture.png');
  await groups.first().click();
  await expect(thinking).toHaveCount(1);
  await page.getByRole('button', { name: 'Technical details for Read', exact: true }).click();
  const detail = page.getByRole('region', { name: 'Read: Technical details', exact: true });
  await expect(detail).toContainText('sources/field-measurements.csv');
  await expect(detail).toContainText('S-01');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await verifyContainment();
  const bounded = await detail.evaluate(
    (node) => node.scrollHeight > node.clientHeight && node.clientHeight <= 322,
  );
  if (!bounded) throw new Error('Long tool results are not bounded in the inline panel.');
  await capture('tool-expanded-desktop-fixture.png');
  await page.getByRole('button', { name: 'Stream recorded turn', exact: true }).click();
  await expect(thinking.first()).toBeVisible();
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Finish recorded turn', exact: true }).click();
  await expect(thinking.first()).toBeVisible();
  await expect(groups.first()).toHaveAttribute('aria-expanded', 'true');
  await capture('thinking-expanded-desktop-fixture.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(groups).toHaveCount(2);
  await expect(footer).toContainText('8 (4 failed) tool calls');
  const footerSpills = await footer.evaluate(
    (node) =>
      node.scrollWidth > node.clientWidth ||
      node.getBoundingClientRect().right > window.innerWidth + 1,
  );
  if (footerSpills) throw new Error('The footer overflows the phone viewport.');
  await capture('entries-collapsed-mobile-fixture.png');
  await groups.first().click();
  const trigger = page.getByRole('button', { name: 'Technical details for Read', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(detail).toContainText('S-01');
  await verifyContainment();
  await capture('tool-expanded-mobile-fixture.png');
  await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0);
  for (const provider of ['claude_code', 'vllm']) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `http://127.0.0.1:5214/tests/review/transcript-entries.html?provider=${provider}`,
    );
    await expect(thinking).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Update:/ })).toHaveCount(0);
    await expect(
      page.getByText(
        'I’ll inspect the recorded measurements before revising the recommendations.',
        {
          exact: true,
        },
      ),
    ).toHaveCount(1);
    await expect(footer).toContainText('8 (4 failed) tool calls');
    await capture(`${provider}-entries-desktop-fixture.png`);
    await groups.first().click();
    await expect(thinking).toHaveCount(1);
    await capture(`${provider}-reasoning-inside-activity-fixture.png`);
    if (provider === 'claude_code') {
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(`${provider}-entries-mobile-fixture.png`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5214/tests/review/transcript-entries.html?theme=dark');
  await expect(thinking).toHaveCount(0);
  await capture('entries-collapsed-dark-fixture.png');
  await groups.first().click();
  await expect(thinking).toHaveCount(1);
  await capture('reasoning-inside-activity-dark-fixture.png');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    resolve(output, 'review.json'),
    JSON.stringify(
      {
        fixture: true,
        actualComponents: true,
        viewport: ['1280x900', '390x844'],
        providers: ['codex', 'claude_code', 'vllm'],
        captures,
        errors,
        result: 'PASS',
      },
      null,
      2,
    ),
  );
  process.stdout.write('Transcript entry browser review PASS\n');
} finally {
  await browser.close();
}
