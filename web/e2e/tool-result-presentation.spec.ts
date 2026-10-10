import { expect, test, type Page } from '@playwright/test';
import type { ToolInvocation } from '@clio/core/v3';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const subjectUri = `D:\\workspace\\${'long-unbroken-directory-'.repeat(12)}\\evidence.txt`;

async function openCompactTool(page: Page, tool: ToolInvocation) {
  await page.route('**/__test/presentation-tool', (route) => route.fulfill({ json: tool }));
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/tests/review/tool-result.html?compact');
  await expect(
    page.getByRole('heading', { name: 'Shared tool result browser fixture' }),
  ).toBeVisible();
}

test('compact runtime results are readable before JSON at desktop and phone widths', async ({
  page,
}) => {
  await openCompactTool(page, {
    id: 'runtime',
    session_id: 's',
    name: 'prepare_execution_runtime',
    title: 'Get execution environment',
    state: 'succeeded',
    duration_ms: 42700,
    input: { kwargs: { required_imports: ['PIL'] } },
    output: { exact: 'Original runtime payload' },
    presentation: {
      summary: '',
      blocks: [
        { id: 'status', type: 'text', text: 'Status: ready' },
        { id: 'python', type: 'text', text: 'Python version: 3.13.16' },
        { id: 'node', type: 'text', text: 'Node version: v24.19.0' },
      ],
    },
  });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const row = page.getByRole('button', { name: 'Show result for Get execution environment' });
    expect(
      await page
        .locator('[data-slot="tool-activity"]')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await row.click();
    const result = page.getByRole('region', { name: 'Get execution environment: Result' });
    await expect(result).toContainText('Python version: 3.13.16');
    await expect(result).not.toContainText('Arguments');
    await expect(result).not.toContainText('required_imports');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await result.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThan(2);
    await page.screenshot({ path: test.info().outputPath(`runtime-readable-${width}.png`) });
    const info = page.getByRole('button', {
      name: 'Technical details for Get execution environment',
    });
    await info.click();
    await expect(page.getByRole('dialog')).toContainText('required_imports');
    await expect(page.getByRole('dialog')).toContainText('Original runtime payload');
    await page.keyboard.press('Escape');
    await expect(info).toBeFocused();
    await expect(result).toBeVisible();
    await row.focus();
    await row.press('Enter');
    await expect(result).toHaveCount(0);
  }
});

test('compact shell failures expose the recorded reason before a long command', async ({
  page,
}) => {
  const failure = 'windows sandbox failed: CreateProcessWithLogonW failed: 267';
  await page.setViewportSize({ width: 900, height: 800 });
  await openCompactTool(page, {
    id: 'shell',
    session_id: 's',
    name: 'shell_bash',
    state: 'succeeded',
    duration_ms: 9100,
    input: { command: 'Get-Location', cwd: null },
    output: { stderr: failure, exit_code: 1 },
    presentation: {
      action: 'Run',
      status: 'failed',
      summary: '',
      blocks: [
        {
          id: 'terminal',
          type: 'terminal',
          command: Array.from({ length: 35 }, (_, index) => `# authored script line ${index}`).join(
            '\n',
          ),
          text: `${failure}\n`,
          exit_code: 1,
        },
      ],
    },
  });
  const row = page.getByRole('button', { name: 'Show result for Run' });
  await row
    .locator('span')
    .filter({ hasText: /^failed$/ })
    .hover();
  await expect(page.getByRole('tooltip')).toHaveText(failure);
  await row.click();
  const result = page.getByRole('region', { name: 'Run: Result' });
  await expect(result.getByRole('alert')).toHaveText(failure);
  const alert = (await result.getByRole('alert').boundingBox())!;
  const bounds = (await result.boundingBox())!;
  expect(alert.y).toBeLessThan(bounds.y + 60);
  await expect(result).toContainText('Process exited with code 1.');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: test.info().outputPath('shell-failure-readable.png') });
  await page.getByRole('button', { name: 'Technical details for Run' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(row).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(failure);
  await page.getByRole('button', { name: 'Technical details for Run' }).click();
  await expect(page.getByRole('dialog')).toContainText('"cwd": null');
  await expect(page.getByRole('dialog')).toContainText(failure);
});

test('compact widget rejection retains its semantic error when transport succeeds', async ({
  page,
}) => {
  const reason = 'A2UI surface components must contain exactly one id="root" component';
  await openCompactTool(page, {
    id: 'widget',
    session_id: 's',
    name: 'create_a2ui_surface',
    state: 'succeeded',
    error: `ok=false: ${reason}`,
    presentation: {
      action: 'Generate widget',
      status: 'failed',
      summary: '',
      blocks: [{ id: 'error', type: 'text', severity: 'error', text: reason }],
    },
  });
  const row = page.getByRole('button', { name: 'Show result for Generate widget' });
  await row.hover();
  await expect(page.getByRole('tooltip')).toHaveText(reason);
  await row.click();
  await expect(page.getByRole('region').getByRole('alert')).toHaveText(reason);
  await expect(page.getByRole('region')).not.toContainText('ok=false');
});

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
