import { expect, test, type Page } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const session = 'sess_flat_ndp';
const subjectUri = `D:\\workspace\\${'long-unbroken-directory-'.repeat(12)}\\evidence.txt`;

async function openFixture(page: Page, type?: string, content?: string, shortTranscript = false) {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((address) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
  }, endpoint);
  await page.route(`**/v1/sessions/${session}/messages`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (shortTranscript) {
      data.messages = data.messages.slice(-2);
      data.messages.at(-1).blocks.push({
        id: 'long-in-flow-answer',
        type: 'text',
        text: Array.from(
          { length: 40 },
          (_, index) => `Evidence paragraph ${index}: a readable result within a long answer.`,
        ).join('\n\n'),
      });
    }
    const todos = Array.from({ length: 4 }, (_, i) => ({
      content: `Task ${i}: ${'Long readable evidence '.repeat(12)}`,
      status: 'pending',
    }));
    data.tools[0].input = type === 'short' ? { value: 'x' } : { todos };
    data.tools[0].output =
      type === 'short'
        ? { value: 'y' }
        : {
            todos,
            observations: Array.from({ length: 50 }, (_, i) => `Row ${i}`),
          };
    data.tools[0].presentation =
      type && type !== 'short'
        ? {
            summary: '',
            blocks: [
              {
                id: 'body',
                type,
                text:
                  content ??
                  Array.from(
                    { length: 100 },
                    (_, i) => `line-${i} ${'wide-output-'.repeat(40)}`,
                  ).join('\n'),
              },
            ],
          }
        : undefined;
    if (type === 'diff') {
      data.tools[0].presentation.action = 'Write';
      data.tools[0].presentation.subject = 'target';
      data.tools[0].presentation.blocks.unshift({
        id: 'target',
        type: 'link',
        target: 'file',
        uri: subjectUri,
        label: 'long-readable-evidence-filename-that-must-not-push-status-outside-the-row.txt',
      });
    }
    await route.fulfill({ response, json: data });
  });
  await page.goto(`/workspaces/ws_flat_ndp/sessions/${session}`);
  // Wait for the populated transcript and the outgoing welcome animation.
  // Its composer briefly coexists with the docked composer during the transition.
  await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: /conversation welcome$/i })).toHaveCount(0);
  const responses = page
    .getByRole('region', { name: 'Conversation workspace', exact: true })
    .getByRole('button', { name: '2 responses needed', exact: true });
  await expect(responses).toHaveCount(1);
  await responses.click();
  const activity = page.getByRole('button', { name: /^Activity:/ }).last();
  await expect(activity).toBeVisible();
  if ((await activity.getAttribute('aria-expanded')) === 'false') await activity.click();
  await expect(
    page.getByRole('button', { name: 'Technical details for Search EarthScope catalog' }),
  ).toBeVisible();
}

test('session Work is a readable canvas peer with accessible task state', async ({ page }) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  const goal = {
    id: 'goal-test',
    title: 'Verify the current tool presentation',
    state: 'active',
    created_at: '2026-09-08T12:00:00Z',
    iterations: 2,
    reason: '',
  };
  await page.route(`**/v1/sessions/${session}/work?*`, (route) =>
    route.fulfill({
      json: {
        cursor: 0,
        goal,
        loop: null,
        goals: [goal],
        loops: [],
        goal_next_cursor: null,
        loop_next_cursor: null,
        todos: [{ content: 'Inspect the actual rendered output', status: 'in_progress' }],
      },
    }),
  );
  await openFixture(page, 'text', 'A short readable result.');
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Work', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Work', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(goal.title, { exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Todos' })).toBeVisible();
  const status = panel.getByRole('img', { name: 'In progress', exact: true });
  await status.focus();
  await expect(page.getByRole('tooltip', { name: 'In progress' })).toBeVisible();
  await expect.poll(() => panel.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
  await expect(panel.getByRole('heading', { name: 'Schedules' })).toBeAttached();
});

test('file explorer reflows converted Markdown and keeps exact source accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1037 });
  const content =
    '# Converted guide\n\n' +
    '| Section | Evidence |\n|---|---|\n| Long table | ' +
    '.'.repeat(400) +
    ' |\n\n' +
    'https://example.org/' +
    'long-reference-'.repeat(80);
  // The listing request always carries include_hidden/exclude_service_storage
  // query params now (repository.ts workspaceFiles); match with `?*` or this
  // route silently never intercepts and the test hangs waiting for a treeitem
  // that never renders.
  await page.route('**/v1/workspaces/ws_flat_ndp/files?*', (route) =>
    route.fulfill({
      json: {
        entries: [{ path: 'converted.md', type: 'file', size: content.length }],
        truncated: false,
      },
    }),
  );
  await page.route('**/v1/workspaces/ws_flat_ndp/files/read?*', (route) =>
    route.fulfill({
      contentType: 'text/plain',
      body: content,
    }),
  );
  await openFixture(page, 'short');
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
  await page.getByRole('menuitem', { name: 'File explorer', exact: true }).click();
  await page.getByRole('treeitem', { name: 'converted.md', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Workspace file preview', exact: true });
  await expect(preview.getByRole('heading', { name: 'Converted guide' })).toBeVisible();
  const viewport = preview.locator('[data-slot="scroll-area-viewport"]');
  await expect.poll(() => viewport.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThan(2);
  await expect
    .poll(() => preview.locator('article').evaluate((e) => e.getBoundingClientRect().width))
    .toBeLessThan(500);
  const markdownView = preview.getByRole('tablist', { name: 'Markdown file view', exact: true });
  await markdownView.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(preview.getByRole('tabpanel', { name: 'Source', exact: true })).toContainText(
    '# Converted guide',
  );
  await expect
    .poll(() =>
      preview
        .getByRole('region', { name: 'Scrollable code' })
        .evaluate((e) => e.scrollWidth - e.clientWidth),
    )
    .toBeLessThan(2);
  await markdownView.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Converted guide' })).toBeVisible();
});

for (const shortTranscript of [false, true]) {
  test(`opening and resizing preserves an earlier reading position (${shortTranscript ? 'in-flow' : 'virtualized'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1408, height: 1037 });
    await openFixture(
      page,
      'markdown',
      '# Earlier evidence\n\n' + 'Readable evidence.\n\n'.repeat(50),
      shortTranscript,
    );
    const log = page.getByRole('log', { name: 'Conversation', exact: true });
    await log.focus();
    await log.press('Control+Home');
    await expect.poll(() => log.evaluate((e) => e.scrollTop)).toBeLessThan(2);
    const anchor = log.locator('[data-index]').first();
    const topBefore = await anchor.evaluate((e) => e.getBoundingClientRect().top);
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    const resize = page.getByRole('separator', { name: 'Resize workspace canvas' });
    await resize.press('ArrowLeft');
    await expect
      .poll(() => anchor.evaluate((e) => e.getBoundingClientRect().top))
      .toBeCloseTo(topBefore, 0);
    await log.focus();
    await log.press('PageDown');
    await expect.poll(() => log.evaluate((e) => e.scrollTop)).toBeGreaterThan(100);
    let previousTop = -1;
    let stableSamples = 0;
    await expect
      .poll(async () => {
        const top = await log.evaluate((e) => e.scrollTop);
        stableSamples = top === previousTop ? stableSamples + 1 : 0;
        previousTop = top;
        return stableSamples;
      })
      .toBeGreaterThanOrEqual(3);
    const visibleId = await log.evaluate(
      (e) =>
        Array.from(e.querySelectorAll<HTMLElement>('[data-index][id^="message-"]')).find(
          (row) => row.getBoundingClientRect().bottom > e.getBoundingClientRect().top,
        )?.id,
    );
    expect(visibleId).toBeTruthy();
    const middleAnchor = page.locator(`[id="${visibleId}"]`);
    const middleTop = await middleAnchor.evaluate((e) => e.getBoundingClientRect().top);
    await resize.press('ArrowRight');
    await expect
      .poll(() => middleAnchor.evaluate((e) => e.getBoundingClientRect().top))
      .toBeCloseTo(middleTop, 0);
  });
}

test('short technical results fit their content instead of padding to the viewport limit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1003, height: 1037 });
  await openFixture(page, 'short');
  await page
    .getByRole('button', { name: 'Technical details for Search EarthScope catalog' })
    .click();
  const body = page.getByRole('region', { name: 'Scrollable result content' });
  await expect.poll(() => body.evaluate((e) => e.clientHeight)).toBeLessThan(400);
  await expect
    .poll(() => body.evaluate((e) => Math.abs(e.scrollHeight - e.clientHeight)))
    .toBeLessThan(2);
});

for (const size of [
  { width: 1003, height: 1037 },
  { width: 640, height: 480 },
]) {
  test(`technical details are reachable without compressed sections at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openFixture(page);
    await page
      .getByRole('button', { name: 'Technical details for Search EarthScope catalog' })
      .click();
    const dialog = page.getByRole('dialog');
    const body = dialog.getByRole('region', { name: 'Scrollable result content' });
    await expect(body).toBeVisible();
    // Lazy syntax highlighting replaces its bounded fallback. Exercise keyboard
    // scrolling against the loaded panes, not during that geometry transition.
    await expect(dialog.locator('[data-slot="code-block-scroll"]')).toHaveCount(2);
    const input = dialog.getByRole('heading', { name: 'Arguments' }).locator('..');
    await expect.poll(() => input.evaluate((e) => e.clientHeight >= e.scrollHeight)).toBe(true);
    await expect.poll(() => body.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await body.focus();
    await expect(body).toBeFocused();
    await body.press('Control+End');
    await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole('heading', { name: 'Result' })).toBeAttached();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await expect
      .poll(() => dialog.evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Technical details for Search EarthScope catalog' }),
    ).toBeFocused();
  });
}
