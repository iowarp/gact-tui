import { expect, test, type Page } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const subjectUri = `D:\\workspace\\${'long-unbroken-directory-'.repeat(12)}\\evidence.txt`;

async function openFixture(page: Page, type: string, content?: string) {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  const response = await page.request.get(`${endpoint}/v1/sessions/sess_flat_ndp/messages`);
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const tool = data.tools[0];
  tool.presentation = {
    summary: '',
    blocks: [
      {
        id: 'body',
        type,
        text:
          content ??
          Array.from({ length: 100 }, (_, i) => `line-${i} ${'wide-output-'.repeat(40)}`).join(
            '\n',
          ),
      },
    ],
  };
  if (type === 'diff') {
    tool.presentation.action = 'Write';
    tool.presentation.subject = 'target';
    tool.presentation.blocks.unshift({
      id: 'target',
      type: 'link',
      target: 'file',
      uri: subjectUri,
      label: 'long-readable-evidence-filename-that-must-not-push-status-outside-the-row.txt',
    });
  }
  await page.route('**/__test/presentation-tool', (route) => route.fulfill({ json: tool }));
  await page.goto('/tests/review/tool-result.html');
  await expect(
    page.getByRole('heading', { name: 'Shared tool result browser fixture' }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="tool-activity"]')).toBeVisible();
}

test('compact subjects stay in the action row and diffs have distinct bounded surfaces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  await openFixture(page, 'diff', '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new');
  const activity = page.locator('[data-slot="tool-activity"]').first();
  const row = activity.locator('[data-slot="activity-row"]');
  const subject = row.locator('[data-slot="tool-action-label"]').getByRole('button');
  await expect(subject).toHaveCount(1);
  await expect(row).toContainText('Write');
  const titleBounds = await row.locator('[data-slot="tool-action-label"]').boundingBox();
  // The status moved from an inline text Badge to a compact trailing icon
  // (feat/4fc5d22c "refine tool presentation qualification"): activity-row.tsx
  // always renders ClioStatus with compact, which drops data-slot="badge" for
  // a role="status" icon.
  const statusBounds = await row.getByRole('status').boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(statusBounds).not.toBeNull();
  expect(Math.abs(titleBounds!.y - statusBounds!.y)).toBeLessThan(8);
  const subjectBounds = await subject.boundingBox();
  expect(subjectBounds).not.toBeNull();
  expect(subjectBounds!.x + subjectBounds!.width).toBeLessThan(statusBounds!.x);
  await expect(activity.locator('[data-slot="tool-human-result"]').getByRole('link')).toHaveCount(
    0,
  );
  await subject.focus();
  await expect(page.getByRole('tooltip')).toHaveText(subjectUri);
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect.poll(() => tooltip.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
  await expect(tooltip).toHaveCSS('font-size', '14px');
  await page.keyboard.press('Escape');
  const addition = activity.locator('[data-diff-line="addition"]');
  const deletion = activity.locator('[data-diff-line="deletion"]');
  await expect(addition).toHaveText('+new');
  await expect(deletion).toHaveText('-old');
  expect(await addition.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(
    await deletion.evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  const panel = activity.locator('[data-slot="tool-result-panel"]');
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  await expect.poll(() => activity.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
});

test('highlighted diff text meets normal-text contrast in both themes', async ({ page }) => {
  await openFixture(page, 'diff', '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new');
  const lines = page.locator('[data-diff-line="addition"], [data-diff-line="deletion"]');
  await expect(lines).toHaveCount(2);
  // Exercise the highlighted tokens, not only the initial unstyled placeholder.
  await expect(lines.first().locator('span').first()).not.toHaveAttribute(
    'style',
    /color: inherit/,
  );
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle('dark', enabled),
      dark,
    );
    const ratios = await lines.evaluateAll((elements) =>
      elements.map((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 1, 1);
        const ancestors: Element[] = [];
        for (let node: Element | null = element; node; node = node.parentElement)
          ancestors.unshift(node);
        for (const node of ancestors) {
          context.fillStyle = getComputedStyle(node).backgroundColor;
          context.fillRect(0, 0, 1, 1);
        }
        const luminance = (rgba: Uint8ClampedArray) => {
          const channels = Array.from(rgba.slice(0, 3), (value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
        };
        const background = luminance(context.getImageData(0, 0, 1, 1).data);
        context.fillStyle = getComputedStyle(element.querySelector('span') ?? element).color;
        context.fillRect(0, 0, 1, 1);
        const foreground = luminance(context.getImageData(0, 0, 1, 1).data);
        return (
          (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
        );
      }),
    );
    for (const ratio of ratios)
      expect(ratio, `${dark ? 'dark' : 'light'} diff contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test('declared Markdown is rendered and width-bounded inline and in the full viewer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  await openFixture(
    page,
    'markdown',
    '# Loaded procedure\n\nUse **readable evidence**.\n\n1. First instruction\n2. Second instruction\n\n- Source evidence\n\n' +
      Array.from(
        { length: 45 },
        (_, i) => `Paragraph ${i}: ${'A readable procedure with wrapping. '.repeat(5)}`,
      ).join('\n\n'),
  );
  const activity = page.locator('[data-slot="tool-activity"]').first();
  await expect(activity.getByRole('heading', { name: 'Loaded procedure' })).toBeVisible();
  await expect(activity.getByRole('heading', { name: 'Loaded procedure' })).toHaveCSS(
    'font-size',
    '16px',
  );
  await expect(activity.getByRole('heading', { name: 'Loaded procedure' })).toHaveCSS(
    'line-height',
    '24px',
  );
  await expect(activity.locator('[data-streamdown="strong"]')).toHaveText('readable evidence');
  await expect(activity.locator('[data-slot="code-block-scroll"]')).toHaveCount(0);
  await activity.getByRole('button', { name: 'Show more', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Loaded procedure' })).toBeVisible();
  await expect(dialog.locator('[data-streamdown="ordered-list"]')).toHaveCSS(
    'list-style-type',
    'decimal',
  );
  await expect(dialog.locator('[data-streamdown="unordered-list"]')).toHaveCSS(
    'list-style-type',
    'disc',
  );
  await expect
    .poll(() =>
      dialog
        .getByRole('heading', { name: 'Loaded procedure' })
        .evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize)),
    )
    .toBeGreaterThanOrEqual(20);
  const body = dialog.getByRole('region', { name: 'Scrollable result content' });
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
  await expect(dialog).toContainText('Paragraph 44:');
});

test('wide Markdown code and URLs cannot widen the whole result document', async ({ page }) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  const longUrl = `https://example.org/${'reference-'.repeat(100)}`;
  await openFixture(
    page,
    'markdown',
    '# Document with wide source\n\n' +
      'Readable paragraph. '.repeat(15) +
      '\n\n```text\n' +
      'unbroken-source-'.repeat(600) +
      '\n```\n\n' +
      `1. Reference: [${longUrl}](${longUrl})\n\n` +
      'Final paragraph remains readable. '.repeat(15),
  );
  const activity = page.locator('[data-slot="tool-activity"]').first();
  await activity.getByRole('button', { name: 'Show more', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const body = dialog.getByRole('region', { name: 'Scrollable result content' });
  await expect(dialog).toContainText('Final paragraph remains readable.');
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
  await expect
    .poll(() =>
      dialog
        .locator('p')
        .last()
        .evaluate((e) => e.getBoundingClientRect().width),
    )
    .toBeLessThan(900);
});

for (const type of ['text', 'markdown', 'code', 'diff', 'terminal']) {
  test(`full ${type} results scroll to their actual end`, async ({ page }) => {
    await page.setViewportSize({ width: 1003, height: 1037 });
    await openFixture(page, type);
    const activity = page.locator('[data-slot="tool-activity"]').first();
    await activity.getByRole('button', { name: 'Show more', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const body = dialog.getByRole('region', { name: 'Scrollable result content' });
    await expect(body).toBeVisible();
    await body.focus();
    await page.keyboard.press('Control+End');
    await expect
      .poll(() => body.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight))
      .toBeLessThan(2);
    await expect(body).toContainText('line-99');
    if (type === 'code' || type === 'diff') {
      const code = dialog.locator('[data-slot="code-block-scroll"]');
      await expect.poll(() => code.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
      await expect(code).toContainText('line-99');
    }
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  });
}
