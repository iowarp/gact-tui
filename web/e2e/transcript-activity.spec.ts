import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('renders always-visible causal rows and a truthful completion footer at desktop and phone widths', async ({
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
  await expect(page.getByRole('button', { name: /^Evidence layout: /u })).toBeVisible();
  await page.request.post(`${endpoint}/__test/transcript-activity`, {
    data: { phase: 'thinking' },
  });
  const message = page.locator('#message-msg_flat_assistant');
  const reasoning = message.locator('[data-slot="transcript-reasoning"]');
  const thought = reasoning.locator('[data-slot="reasoning-summary"]');
  const toggle = message.getByRole('button', { name: /^Thinking:/u });
  const thoughtDetails = message.getByRole('region', { name: 'Thinking details' });
  const timeline = message.locator('[data-slot="transcript-activity-timeline"]');
  // The chevron opens a row at every width; phones hide the action name.
  const readName = /^(?:Expand|Collapse) Read file$/u;
  const runName = /^(?:Expand|Collapse) Run command$/u;
  const read = message.getByRole('button', { name: readName });
  const run = message.getByRole('button', { name: runName });
  const readRow = message
    .locator('[data-slot="activity-row"]')
    .filter({ has: page.getByRole('button', { name: readName }) });
  const runRow = message
    .locator('[data-slot="activity-row"]')
    .filter({ has: page.getByRole('button', { name: runName }) });
  // Markdown paragraphs end with a line break that keeps their boundary in the DOM text.
  const update = message
    .locator('p')
    .filter({ hasText: /^Read the fixture notes before preparing the report\.\n?$/u });
  // While the model thinks, its thought is a live row and every call is already a visible row.
  await expect(reasoning).toHaveCount(1);
  await expect(reasoning).toHaveAttribute('aria-busy', 'true');
  await expect(thought).toHaveText('Thinking…');
  await expect(reasoning.getByRole('img', { name: 'Thinking' })).toBeVisible();
  await expect(read).toBeVisible();
  await expect(run).toBeVisible();
  await expect(update).toHaveCount(1);
  await expect(message.locator('[data-slot="message-completion-footer"]')).toHaveCount(0);
  // A one-line thought stays closed until the reader opens it.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(thoughtDetails).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(thoughtDetails).toContainText('Read the fixture notes before preparing the report.');
  await toggle.click();
  await expect(thoughtDetails).toHaveCount(0);
  // Thinking reads before the step's prose, and the prose before its calls.
  await expect
    .poll(async () => {
      const [thinkingBounds, updateBounds, readBounds] = await Promise.all([
        reasoning.boundingBox(),
        update.boundingBox(),
        read.boundingBox(),
      ]);
      if (!thinkingBounds || !updateBounds || !readBounds) return false;
      return thinkingBounds.y < updateBounds.y && updateBounds.y < readBounds.y;
    })
    .toBe(true);
  await page.request.post(`${endpoint}/__test/transcript-activity`, { data: { phase: 'answer' } });
  const persisted = await (
    await page.request.get(`${endpoint}/v1/sessions/sess_flat_ndp/messages`)
  ).json();
  expect(
    persisted.messages.some(
      (entry: { id: string; completed_at?: string }) =>
        entry.id === 'msg_flat_assistant' && entry.completed_at,
    ),
  ).toBe(true);
  // Completion changes virtualized row heights. Keep the current message
  // mounted before inspecting its content.
  let completedMeasurements = 0;
  await expect
    .poll(async () => {
      await page
        .getByRole('log', { name: 'Conversation' })
        .evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }));
      const completed = await message.evaluateAll((nodes) =>
        nodes.some(
          (node) =>
            node.querySelector('[data-slot="activity-row"]') !== null &&
            node.querySelector('[data-slot="message-completion-footer"]') !== null,
        ),
      );
      completedMeasurements = completed ? completedMeasurements + 1 : 0;
      return completedMeasurements;
    })
    .toBeGreaterThanOrEqual(3);
  // The settled thought is no longer live and keeps its text.
  await expect(reasoning).not.toHaveAttribute('aria-busy');
  await expect(thought).toHaveText(/^Thought/u);
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
    await expect(timeline.first()).toBeVisible();
    for (const lane of await timeline.all())
      expect(await lane.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(thoughtDetails).toContainText(
      'Read the fixture notes before preparing the report.',
    );
    expect(await reasoning.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await toggle.click();
    await expect(thoughtDetails).toHaveCount(0);
    expect((await reasoning.boundingBox())!.y).toBeLessThan(
      (await message
        .getByRole('button', { name: 'Technical details for Read file' })
        .boundingBox())!.y,
    );
    // The action is the row's button; its target and outcome read beside it.
    await expect(readRow).toContainText('notes.md');
    await expect(readRow).toContainText('61 lines');
    await expect(runRow).toContainText('failed');
    expect((await read.boundingBox())!.y).toBeLessThan((await run.boundingBox())!.y);
    const footer = message.locator('[data-slot="message-completion-footer"]');
    await expect(footer).toContainText('129K in, 3K out');
    await expect(footer).not.toContainText('Done');
    await expect(footer).not.toContainText('·');
    await footer.locator('[data-slot="message-reply-meta"]').hover();
    const used = page.getByRole('region', { name: 'This reply used' });
    await expect(used).toContainText('$0');
    await expect(used).toContainText('2 tool calls, 1 failed');
    await page.mouse.move(0, 0);
    // The card closes after its delay; it can sit over the rows below the footer.
    await expect(used).toBeHidden();
    expect(await footer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    // Opening a row grows its body below it without moving the row itself.
    await read.scrollIntoViewIfNeeded();
    const before = await read.boundingBox();
    await page.mouse.click(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await expect(read).toHaveAttribute('aria-expanded', 'true');
    await test.info().attach(`activity-expansion-${width}`, {
      body: JSON.stringify({ width, before, after: await read.boundingBox() }),
      contentType: 'application/json',
    });
    expect(Math.abs((await read.boundingBox())!.y - before!.y)).toBeLessThanOrEqual(2);
    const details = message.getByRole('region', { name: 'Read file: Result' });
    await expect(details).toHaveCount(1);
    // A named (not linked) subject stays the row's target when the row is open.
    await expect(readRow).toContainText('notes.md');
    await expect(details).not.toContainText('Arguments');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await read.focus();
    await read.press('Enter');
    await expect(details).toHaveCount(0);
    await expect(read).toBeFocused();
    await message.getByRole('button', { name: 'Technical details for Read file' }).click();
    await expect(page.getByRole('dialog')).toContainText('Complete fixture file contents.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
