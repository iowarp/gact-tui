import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('renders one compact causal timeline and a truthful completion footer at desktop and phone widths', async ({
  page,
}) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    { data: { selected_options: ['table'] } },
  );
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
    localStorage.setItem('clio.conversation-display.v1', 'full');
  }, endpoint);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(page.getByRole('button', { name: /^Evidence layout:/ })).toBeVisible();
  await page.request.post(`${endpoint}/__test/transcript-activity`, {
    data: { phase: 'thinking' },
  });
  const message = page.locator('#message-msg_flat_assistant');
  const activity = message.getByRole('button', { name: /^Activity:/ });
  await expect(activity).toHaveAttribute('aria-expanded', 'true');
  const thinking = message.getByRole('button', { name: /^Thinking/ });
  await expect(thinking).toBeVisible();
  await expect(thinking).not.toContainText('Thinking');
  await expect(thinking.locator('svg.animate-spin')).toHaveCount(1);
  await expect(
    message.getByText('Read the fixture notes before preparing the report.', { exact: true }),
  ).toHaveCount(1);
  await expect(message.getByRole('group', { name: 'Activity detail' })).toHaveCount(0);
  await page.request.post(`${endpoint}/__test/transcript-activity`, { data: { phase: 'answer' } });
  await expect(activity).toHaveAttribute('aria-expanded', 'false');
  await expect(activity).toContainText('2 tools · 1 completed');
  const persisted = await (
    await page.request.get(`${endpoint}/v1/sessions/sess_flat_ndp/messages`)
  ).json();
  expect(
    persisted.messages.some((entry: { id: string }) => entry.id === 'msg_flat_assistant'),
  ).toBe(true);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    // Let virtualized row measurements settle before measuring the actual click.
    // Locator click may otherwise scroll a newly measured target between the
    // "before" read and pointer input, conflating framing with expansion.
    const conversation = page.getByRole('log', { name: 'Conversation' });
    let previous = '';
    let stable = 0;
    await expect
      .poll(
        async () => {
          await conversation.evaluate((node) =>
            node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }),
          );
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
          );
          const key = await conversation.evaluate((node) =>
            JSON.stringify([node.scrollHeight, node.scrollTop, node.clientHeight]),
          );
          stable = key === previous ? stable + 1 : 0;
          previous = key;
          return stable;
        },
        { intervals: [50, 100, 200], timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(3);
    await activity.scrollIntoViewIfNeeded();
    const before = await activity.boundingBox();
    await page.mouse.click(before!.x + 20, before!.y + before!.height / 2);
    await expect(activity).toHaveAttribute('aria-expanded', 'true');
    const timeline = message.locator('[data-slot="transcript-activity-timeline"]');
    await expect(timeline).toBeVisible();
    await test.info().attach(`activity-expansion-${width}`, {
      body: JSON.stringify({ width, before, after: await activity.boundingBox() }),
      contentType: 'application/json',
    });
    expect(Math.abs((await activity.boundingBox())!.y - before!.y)).toBeLessThanOrEqual(2);
    await expect(message.getByRole('button', { name: /^Reasoning/ })).toHaveCount(1);
    const read = message.getByRole('button', { name: 'Technical details for Read' });
    const run = message.getByRole('button', { name: 'Technical details for Run' });
    await expect(read).toContainText('61 lines');
    await expect(run).toContainText('failed');
    expect((await read.boundingBox())!.y).toBeLessThan((await run.boundingBox())!.y);
    expect(await timeline.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const footer = message.locator('[data-slot="message-completion-footer"]');
    await expect(footer).toContainText('Done');
    await expect(footer).toContainText('129K in / 3K out');
    await expect(footer).toContainText('$0');
    await expect(footer).toContainText('2 tool calls');
    expect(await footer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await read.click();
    await expect(page.getByRole('dialog')).toContainText('Complete fixture file contents.');
    await page.keyboard.press('Escape');
    await activity.click();
  }
});
