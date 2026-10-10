import { expect, test, type Page } from '@playwright/test';

// A small excerpt from the reported screenshots. Failure and timing are historical.
const failure = 'windows sandbox failed: CreateProcessWithLogonW failed: 2';
const thinking =
  "**Diagnosing shell issues**\n\nI'm trying to figure out why the shell is diagnosing a null current working directory. Maybe there's something off with the sandbox, and it could be broken. It's a bit perplexing, and I want to sort it out properly. I need to check the environment settings or any configurations that might be causing this. It could take some time, but I'll get to the bottom of it!";
const progress =
  'I’ll make a toy-like 3D version, keeping the striped tail, big eyes, and pink heart.';
const excerpt = {
  messages: [
    {
      id: 'review-message',
      session_id: 'review-session',
      role: 'assistant',
      created_at: '2026-10-10T00:00:00Z',
      completed_at: '2026-10-10T00:00:03Z',
      blocks: [
        { id: 'thinking', type: 'reasoning', text: thinking },
        { id: 'progress', type: 'text', channel: 'next_thought', text: progress },
        { id: 'call', type: 'tool', tool_id: 'shell' },
      ],
    },
  ],
  tools: {
    shell: {
      id: 'shell',
      session_id: 'review-session',
      name: 'shell_bash',
      state: 'failed',
      duration_ms: 2700,
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
            command: 'Get-Location',
            text: failure,
            exit_code: 1,
          },
        ],
      },
    },
  },
};

async function settleCapture(page: Page) {
  const follow = page.getByRole('button', { name: 'Scroll to bottom' });
  if (await follow.isVisible()) await follow.click();
  await expect(follow).toHaveCount(0);
  await page.mouse.move(8, 8);
}

for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    test(`thinking opens as a flat tool-style row at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/__test/transcript-text-flow', (route) =>
        route.fulfill({ json: excerpt }),
      );
      await page.goto(`/tests/review/transcript-text-flow.html?theme=${theme}`);
      await expect(page.getByText(progress, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Activity:/ }).click();
      const row = page.getByRole('button', { name: 'Thinking: Diagnosing shell issues' });
      await expect(row).toHaveAttribute('aria-expanded', 'false');
      const details = page.getByRole('region', { name: 'Thinking details' });
      await expect(details).toHaveCount(0);
      await settleCapture(page);
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${theme}-${width}-thinking-collapsed.png`),
      });
      const message = page.locator('#message-review-message');
      await message.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${theme}-${width}-thinking-collapsed-detail.png`),
      });
      await row.focus();
      await row.press('Enter');
      await expect(details).toContainText('I need to check the environment settings');
      await expect(details).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(details).toHaveCSS('border-top-width', '0px');
      await expect(details.locator('[data-part-id="thinking"]')).toHaveAttribute(
        'data-field',
        'text',
      );
      await expect(page.getByText('Diagnosing shell issues', { exact: true })).toHaveCount(1);
      await page.getByRole('button', { name: 'Show result for Run' }).click();
      const result = page.getByRole('region', { name: 'Run: Result' });
      await expect(result).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(result).toHaveCSS('border-top-width', '0px');
      await expect(result.getByRole('alert')).toContainText(failure);
      expect(await result.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(page.getByText(progress, { exact: true })).toBeVisible();
      await settleCapture(page);
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${theme}-${width}-thinking-expanded.png`),
      });
      await message.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${theme}-${width}-thinking-expanded-detail.png`),
      });
      await row.focus();
      await row.press('Space');
      await expect(details).toHaveCount(0);
      await expect(row).toBeFocused();
      await expect(result).toBeVisible();
    });
  }
}
