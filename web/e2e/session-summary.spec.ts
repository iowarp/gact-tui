import { expect, test, type Page } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

async function openSession(page: Page, width = 1920, density = '') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    {
      data: { selected_options: ['table'] },
    },
  );
  await page.request.post(
    `${endpoint}/__test/session-summary${density ? `?density=${density}` : ''}`,
  );
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(page.locator('[data-slot="transcript-column"]')).toBeVisible();
}

test('compact Session rows open source, tool and Context details, with Work kept separate', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSession(page);
  const toggle = page.getByRole('button', { name: 'Session rail', exact: true });
  const panel = page.getByRole('dialog', { name: 'Session rail', exact: true });
  await toggle.click();
  await expect(panel).toHaveAttribute('data-showcase-mode', 'docked');
  await expect(panel.getByRole('button', { name: 'Open Sensor repository' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Todos section', exact: true })).toHaveCount(0);
  await expect(panel.locator('[data-slot="artifact"]')).toHaveCount(0);
  await expect(panel.getByText('Output', { exact: true })).toHaveCount(0);
  for (const row of await panel.locator('[data-slot="artifact-rail-row"]').all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(32);
    await expect(row.getByRole('button', { name: /^Download / })).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Open full details' }).hover();
  await expect(page.getByRole('tooltip', { name: 'Open full details' })).toBeVisible();
  await panel.getByRole('button', { name: 'Open Sensor repository' }).click();
  const sources = page.getByRole('dialog', { name: 'Sources', exact: true });
  await expect(sources.getByRole('heading', { name: 'Sensor repository' })).toBeVisible();
  await expect(sources.getByText('sensor.csv', { exact: true })).toBeVisible();
  await expect(sources.getByRole('button', { name: 'Link folder' })).toBeEnabled();
  await sources.getByRole('button', { name: 'Close and keep setup' }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Expand Tool calls', exact: true }).click();
  await panel
    .getByRole('button', { name: /^Technical details for/ })
    .first()
    .click();
  const technical = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /Technical details/ }) });
  await expect(technical).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Context details', exact: true }).click();
  const view = page.getByRole('tablist', { name: 'Observability view' });
  await expect(view.getByRole('tab', { name: 'Context' })).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Work rail', exact: true }).click();
  const work = page.getByRole('dialog', { name: 'Work rail', exact: true });
  await expect(work).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(work.getByRole('button', { name: 'Open Check the report' })).toBeVisible();
  await work.getByRole('button', { name: 'Open Check the report', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Work', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  );
  await expect(
    page
      .getByRole('tabpanel', { name: 'Work', exact: true })
      .getByText('Check the report', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('temporary Session links survive technical-dialog dismissal and open source details on mobile', async ({
  page,
}) => {
  await openSession(page, 390);
  const toggle = page.getByRole('button', { name: 'Session rail', exact: true });
  await toggle.click();
  const panel = page.getByRole('dialog', { name: 'Session rail', exact: true });
  await panel.getByRole('button', { name: 'Expand Tool calls', exact: true }).click();
  await panel
    .getByRole('button', { name: /^Technical details for/ })
    .first()
    .click();
  const technical = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /Technical details/ }) });
  await expect(technical).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Open Sensor repository' }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page
      .getByRole('dialog', { name: 'Sources', exact: true })
      .getByRole('heading', { name: 'Sensor repository' }),
  ).toBeVisible();
});

for (const width of [1920, 390]) {
  test(`Customize reorders expanded sections without losing content or the draft at ${width}px`, async ({
    page,
  }) => {
    await openSession(page, width);
    const input = page.locator('[data-slot="clio-composer-stack"] [contenteditable="true"]');
    await input.fill('Keep this draft while I arrange the rail.');
    await page.getByRole('button', { name: 'Session rail', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Session rail', exact: true });
    await expect(panel.getByRole('region', { name: 'Files section', exact: true })).toBeVisible();
    const sectionOrder = () =>
      panel
        .getByRole('region', { name: / section$/ })
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    const originalOrder = await sectionOrder();
    const expectedOrder = originalOrder.filter((name) => name !== 'Context section');
    expectedOrder.splice(expectedOrder.indexOf('Files section') + 1, 0, 'Context section');
    const context = panel.getByRole('region', { name: 'Context section', exact: true });
    await expect(
      context.getByRole('button', { name: 'Collapse Context', exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Drag / })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Customize rail', exact: true }).click();
    const customize = page.getByRole('dialog', { name: 'Customize session rail', exact: true });
    const source = customize.getByRole('button', { name: 'Drag Context in layout', exact: true });
    const target = customize.getByRole('button', { name: 'Drag Files in layout', exact: true });
    // boundingBox() does not wait: on the popover's first frame Radix still parks
    // it off-screen and the enter animation scales it, so the press would land
    // outside the handle. Read the geometry once the popover is placed and the
    // handle is stable, as a person would only grab it then.
    await expect(source).toBeInViewport();
    await expect(target).toBeInViewport();
    await source.hover();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    expect(from.width).toBeGreaterThan(180);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(sectionOrder).toEqual(expectedOrder);
    await page.keyboard.press('Escape');
    await expect(customize).toHaveCount(0);
    await expect(
      context.getByRole('button', { name: 'Collapse Context', exact: true }),
    ).toBeVisible();
    await expect(context.getByRole('region', { name: 'Context usage', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Hide session rail', exact: true }).click();
    await expect(input).toHaveText('Keep this draft while I arrange the rail.');
    await page.reload();
    await page.getByRole('button', { name: 'Session rail', exact: true }).click();
    await expect.poll(sectionOrder).toEqual(expectedOrder);
    await expect(
      context.getByRole('button', { name: 'Collapse Context', exact: true }),
    ).toBeVisible();
  });
}

for (const density of ['both', 'work']) {
  test(`dense ${density} inventories use a single scrolling rail without nested cards`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openSession(page, 1920, density);
    for (const kind of ['Session', 'Work'] as const) {
      await page.getByRole('button', { name: `${kind} rail`, exact: true }).click();
      const panel = page.getByRole('dialog', { name: `${kind} rail`, exact: true });
      await expect(panel).toHaveAttribute('data-showcase-mode', 'docked');
      const scroll = panel.locator('[data-slot="session-rail-scroll"]');
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      for (const section of await panel.getByRole('region', { name: / section$/ }).all()) {
        expect(await section.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await section.evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe(
          '0px',
        );
        expect(await section.evaluate((node) => getComputedStyle(node).borderRightWidth)).toBe(
          '0px',
        );
      }
      if (kind === 'Work') {
        await expect(
          panel.getByRole('button', { name: 'Collapse Todos', exact: true }),
        ).toBeVisible();
        await expect
          .poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight))
          .toBe(true);
        const todos = panel.getByRole('region', { name: 'Todos section', exact: true });
        const last = todos.getByRole('button', { name: /^Open / }).last();
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
      }
      while (await panel.getByRole('button', { name: /^Collapse / }).count())
        await panel
          .getByRole('button', { name: /^Collapse / })
          .first()
          .click();
      await expect
        .poll(() => scroll.evaluate((node) => node.scrollHeight <= node.clientHeight))
        .toBe(true);
      await panel
        .getByRole('button', { name: `Hide ${kind.toLowerCase()} rail`, exact: true })
        .click();
    }
    expect(errors).toEqual([]);
  });
}
