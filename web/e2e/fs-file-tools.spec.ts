import { expect, test, type Page } from '@playwright/test';
import type { ToolInvocation } from '@clio/core/v3';
// Recorded from CLIO's real FS server and observer completion path (clio-agent
// tests/test_tools/test_fs_path_argument.py drives the same calls); temporary
// folders are rewritten to /workspace/station-triage.
import recorded from '../tests/review/fixtures/fs-file-tools/tools.json' with { type: 'json' };

const tools = recorded as ToolInvocation[];
const LONG = 'station-quality-summary-with-a-deliberately-long-unbroken-name-for-wrapping.md';

function tool(id: string): ToolInvocation {
  const found = tools.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No recorded tool ${id}`);
  return found;
}

async function open(page: Page, recordedTool: ToolInvocation) {
  await page.route('**/__test/presentation-tool', (route) => route.fulfill({ json: recordedTool }));
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/tests/review/tool-result.html');
  await expect(page.locator('[data-slot="tool-activity"]')).toBeVisible();
}

/** Each width: no horizontal overflow, a screenshot, and the readable assertions. */
async function atWidths(page: Page, id: string, check: () => Promise<void>) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator('main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await check();
    await page.screenshot({ path: test.info().outputPath(`${id}-${width}.png`), fullPage: true });
  }
}

async function technicalDetailsShowPath(page: Page, action: string, path: string) {
  await page.getByRole('button', { name: `Technical details for ${action}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`"path": "${path}"`);
  await expect(dialog).not.toContainText('filepath');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}

test.describe('file tools take path: recorded request and result showcase', () => {
  test.describe.configure({ timeout: 120_000 });

  test('a code read names the file and shows numbered source', async ({ page }) => {
    await open(page, tool('read-code'));
    await atWidths(page, 'read-code', async () => {
      await expect(page.getByRole('button', { name: 'gateway.py' })).toBeVisible();
      await expect(page.getByText('Lines 1–3 of 3')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Scrollable code' })).toContainText(
        'return HANDLERS[request.path](request)',
      );
    });
    await technicalDetailsShowPath(page, 'Read', '/workspace/station-triage/src/gateway.py');
  });

  test('a large Markdown read shows front matter, the document and where to continue', async ({
    page,
  }) => {
    await open(page, tool('read-large'));
    await atWidths(page, 'read-large', async () => {
      await expect(page.getByRole('button', { name: LONG })).toBeVisible();
      // The long name truncates; the action keeps its word on one line.
      const action = page.locator('[data-slot="tool-action-text"]');
      const { height } = (await action.boundingBox())!;
      const lineHeight = await action.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).lineHeight),
      );
      expect(height).toBeLessThan(lineHeight * 1.5);
      await expect(page.getByText('Lines 1–70 of 5,006')).toBeVisible();
      await expect(page.getByText('Title: Station quality')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Readings' })).toBeVisible();
      await expect(page.getByText('the next read starts at line 71')).toBeVisible();
    });
  });

  test('an empty file says so', async ({ page }) => {
    await open(page, tool('read-empty'));
    await atWidths(page, 'read-empty', async () => {
      await expect(page.getByRole('button', { name: 'empty.log' })).toBeVisible();
      await expect(page.getByText('Empty file')).toBeVisible();
    });
  });

  for (const [id, action, added] of [
    ['write-created', 'Write', '+# Plan'],
    ['write-overwritten', 'Write', '+- recheck readings after the fix'],
    ['edit', 'Edit', '+- triage the API gateway'],
  ] as const) {
    test(`${id} shows the file and a truthful diff`, async ({ page }) => {
      await open(page, tool(id));
      await atWidths(page, id, async () => {
        await expect(page.locator('[data-slot="activity-row"]')).toContainText(action);
        await expect(page.getByRole('button', { name: 'plan.md' })).toBeVisible();
        const more = page.getByRole('button', { name: 'Show more' });
        if (await more.isVisible()) await more.click();
        await expect(page.getByText(added, { exact: true })).toBeVisible();
      });
      await technicalDetailsShowPath(page, action, '/workspace/station-triage/notes/plan.md');
    });
  }

  test('a refused edit names the file and its reason, without an empty diff', async ({ page }) => {
    await open(page, tool('edit-refused'));
    await atWidths(page, 'edit-refused', async () => {
      await expect(page.getByRole('button', { name: 'dupes.txt' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('old_string occurs 2 times');
      await expect(page.locator('[data-slot="activity-row"]')).not.toContainText('Succeeded');
    });
  });

  test('a read outside the permitted folders names the file it asked for', async ({ page }) => {
    await open(page, tool('read-outside'));
    await atWidths(page, 'read-outside', async () => {
      await expect(page.getByRole('button', { name: 'secrets.txt' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('outside allowed roots');
    });
  });

  for (const [id, name] of [
    ['write-running', LONG],
    ['write-denied', 'plan.md'],
  ] as const) {
    test(`${id} names the declared file before any result`, async ({ page }) => {
      await open(page, tool(id));
      await atWidths(page, id, async () => {
        await expect(page.locator('[data-slot="activity-row"]')).toContainText('Write');
        await expect(page.getByRole('button', { name })).toBeVisible();
      });
    });
  }
});
