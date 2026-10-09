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
  if ((await panel.boundingBox())!.width >= 400) {
    expect(workBounds!.y).toBe(topBounds!.y);
    expect(workBounds!.x).toBeGreaterThan(topBounds!.x);
  }
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
