import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('compact Session rows open source, tool, Context and Work destinations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    { data: { selected_options: ['table'] } },
  );
  await page.request.post(`${endpoint}/__test/session-summary`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(
    page.locator('[data-slot="clio-composer-stack"] [contenteditable="true"]'),
  ).toBeVisible();
  await expect(page.locator('[data-slot="transcript-column"]')).toBeVisible({ timeout: 30000 });
  await page.setViewportSize({ width: 1920, height: 900 });
  const toggle = page.getByRole('button', { name: /^Evidence layout:/ });
  const panel = page.getByRole('dialog', { name: 'Activity and evidence' });
  await toggle.click({ button: 'right' });
  await expect(panel).toHaveAttribute('data-showcase-mode', 'docked');
  const top = panel.locator('[data-showcase-section="top"]');
  const work = panel.locator('[data-showcase-section="bottom"]');
  await expect(top.getByRole('button', { name: 'Open Sensor repository' })).toBeVisible();
  await expect(work.getByRole('button', { name: 'Open Check the report' })).toBeVisible();
  const topBounds = await top.boundingBox();
  const workBounds = await work.boundingBox();
  expect(workBounds!.x).toBe(topBounds!.x);
  expect(workBounds!.width).toBe(topBounds!.width);
  expect(workBounds!.y).toBeGreaterThan(topBounds!.y + topBounds!.height);
  const panelBounds = (await panel.boundingBox())!;
  expect(workBounds!.y + workBounds!.height).toBeCloseTo(panelBounds.y + panelBounds.height, 0);
  await expect(panel.locator('[data-slot="artifact"]')).toHaveCount(0);
  await expect(panel.getByText('Output', { exact: true })).toHaveCount(0);
  for (const row of await panel.locator('button[aria-label^="Open "]').all()) {
    if (['Open Context tab', 'Open full details'].includes((await row.getAttribute('aria-label'))!))
      continue;
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(28);
  }
  const details = panel.getByRole('button', { name: 'Open full details' });
  await details.hover();
  await expect(page.getByRole('tooltip', { name: 'Open full details' })).toBeVisible();
  await top.getByRole('button', { name: 'Open Sensor repository' }).click();
  const sources = page.getByRole('dialog', { name: 'Sources', exact: true });
  await expect(sources.getByRole('heading', { name: 'Sensor repository' })).toBeVisible();
  await expect(sources.getByText('sensor.csv', { exact: true })).toBeVisible();
  await expect(sources.getByRole('button', { name: 'Link folder' })).toBeEnabled();
  await sources.getByRole('button', { name: 'Close and keep setup' }).click();
  await expect(panel).toBeVisible();
  await work
    .getByRole('button', { name: /^Technical details for/ })
    .first()
    .click();
  const technical = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /Technical details/ }) });
  await expect(technical).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Open Context tab' }).click();
  const view = page.getByRole('tablist', { name: 'Observability view' });
  await expect(view.getByRole('tab', { name: 'Context' })).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: 'Close workspace canvas' }).click();
  if (await panel.isVisible())
    await panel.getByRole('button', { name: 'Hide activity and evidence' }).click();
  await toggle.click({ button: 'right' });
  await panel.getByRole('button', { name: 'Open Work view' }).click();
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

test('temporary Session source links survive dismissing the small overlay', async ({ page }) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.request.post(`${endpoint}/__test/session-summary`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  const toggle = page.getByRole('button', { name: /^Evidence layout:/ });
  await toggle.click();
  const panel = page.getByRole('dialog', { name: 'Activity and evidence' });
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
  await toggle.click();
  await panel.getByRole('button', { name: 'Open Sensor repository' }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page
      .getByRole('dialog', { name: 'Sources', exact: true })
      .getByRole('heading', { name: 'Sensor repository' }),
  ).toBeVisible();
});

for (const density of ['both', 'work']) {
  test(`Session column lends unused and collapsed space to ${density} inventories`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.request.post(`${endpoint}/__test/reset`);
    await page.request.post(`${endpoint}/__test/session-summary?density=${density}`);
    await page.addInitScript((value) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
      localStorage.setItem('theme', 'light');
    }, endpoint);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    await expect(page.locator('[data-slot="transcript-column"]')).toBeVisible({ timeout: 30000 });
    await page.setViewportSize({ width: 1920, height: 900 });
    const toggle = page.getByRole('button', { name: /^Evidence layout:/ });
    await toggle.click({ button: 'right' });
    const panel = page.getByRole('dialog', { name: 'Activity and evidence' });
    const data = panel.getByRole('region', { name: 'Data', exact: true });
    const work = panel.getByRole('region', { name: 'Work', exact: true });
    await expect(work.getByRole('button', { name: 'Todos, 60 recorded' })).toBeVisible();
    await expect
      .poll(async () => {
        const d = (await data.boundingBox())!;
        const w = (await work.boundingBox())!;
        return w.y - d.y - d.height;
      })
      .toBeGreaterThanOrEqual(11);
    const d = (await data.boundingBox())!;
    const w = (await work.boundingBox())!;
    if (density === 'both') expect(Math.abs(d.height - w.height)).toBeLessThan(2);
    else {
      const naturalDataHeight = await data.evaluate(
        (node) =>
          Math.ceil(node.children[0]!.getBoundingClientRect().height) +
          Math.ceil(node.children[1]!.firstElementChild!.getBoundingClientRect().height) +
          1,
      );
      expect(d.height).toBeCloseTo(naturalDataHeight, 0);
      expect(w.height).toBeCloseTo((await panel.boundingBox())!.height - d.height - 12, 0);
      expect(w.height).toBeGreaterThan(d.height);
    }
    const composer = (await page.locator('[data-slot="clio-composer-stack"] form').boundingBox())!;
    expect(w.y + w.height).toBeGreaterThan(composer.y);
    expect(w.y + w.height).toBeLessThanOrEqual(composer.y + composer.height + 16);
    for (const section of [data, work]) {
      expect(await section.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await data.getByRole('button', { name: 'Collapse Data' }).click();
    await expect(data.getByRole('button', { name: 'Expand Data' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect.poll(async () => (await data.boundingBox())!.height).toBeLessThanOrEqual(37);
    await expect
      .poll(async () => (await work.boundingBox())!.height)
      .toBeGreaterThan(w.height + 30);
    await work.getByRole('button', { name: 'Collapse Work' }).click();
    await expect.poll(async () => (await work.boundingBox())!.height).toBeLessThanOrEqual(37);
    await data.getByRole('button', { name: 'Expand Data' }).click();
    await expect.poll(async () => (await data.boundingBox())!.height).toBeGreaterThan(100);
    await work.getByRole('button', { name: 'Expand Work' }).click();
    await expect(work.getByRole('button', { name: 'Todos, 60 recorded' })).toBeVisible();
    // Inner disclosure also frees height; mounted sections preserve their own state.
    if (density === 'both') {
      await data.getByRole('button', { name: 'Connected sources, 25 recorded' }).click();
      await expect
        .poll(async () => (await work.boundingBox())!.height)
        .toBeGreaterThan(w.height + 30);
    }
    // The single-view states take the entire column.
    await toggle.click({ button: 'right' }); // Data only
    await expect(work).toHaveCount(0);
    await expect
      .poll(async () => (await data.boundingBox())!.height)
      .toBeCloseTo((await panel.boundingBox())!.height, 0);
    await toggle.click({ button: 'right' }); // Work only
    await expect(data).toHaveCount(0);
    await expect
      .poll(async () => (await work.boundingBox())!.height)
      .toBeCloseTo((await panel.boundingBox())!.height, 0);
    expect(errors).toEqual([]);
  });
}
