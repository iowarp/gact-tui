import { expect, test, type Page } from '@playwright/test';
import { openConversationRail } from './workspace-setup';

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

test('rail rows open source, tool, Context and Todo details', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSession(page);
  const panel = await openConversationRail(page);
  await panel.getByRole('button', { name: 'Expand Connected sources', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Open Sensor repository' })).toBeVisible();
  await expect(panel.locator('[data-slot="artifact"]')).toHaveCount(0);
  for (const row of await panel.locator('[data-slot="artifact-rail-row"]').all())
    await expect(row.getByRole('button', { name: /^Download / })).toBeVisible();
  await panel.getByRole('button', { name: 'Open full view' }).hover();
  await expect(page.getByRole('tooltip', { name: 'Open full view' })).toBeVisible();
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
  await panel.getByRole('button', { name: 'Expand Context', exact: true }).click();
  await panel.getByRole('button', { name: 'Open full context view', exact: true }).click();
  const view = page.getByRole('tablist', { name: 'Observability view' });
  await expect(view.getByRole('tab', { name: 'Context' })).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Expand Todos', exact: true }).click();
  await panel.getByRole('button', { name: 'Open Check the report', exact: true }).click();
  // Work folds into Activity: the todo list is one row that opens the full Work tab.
  await page
    .getByRole('region', { name: 'Activity list', exact: true })
    .getByRole('button', { name: /^Todos, / })
    .click();
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

test('rail links survive technical-dialog dismissal and open source details on mobile', async ({
  page,
}) => {
  await openSession(page, 390);
  const panel = await openConversationRail(page);
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
  await panel.getByRole('button', { name: 'Expand Connected sources', exact: true }).click();
  await panel.getByRole('button', { name: 'Open Sensor repository' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Sources', exact: true })
      .getByRole('heading', { name: 'Sensor repository' }),
  ).toBeVisible();
});

test('Customize reorders sections and keeps the layout across reload', async ({ page }) => {
  await openSession(page, 1920);
  const input = page.locator('[data-slot="clio-composer-stack"] [contenteditable="true"]');
  await input.fill('Keep this draft while I arrange the rail.');
  const panel = await openConversationRail(page);
  await expect(panel.getByRole('region', { name: 'Files section', exact: true })).toBeVisible();
  const sectionOrder = () =>
    panel
      .getByRole('region', { name: / section$/ })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  await panel.getByRole('button', { name: 'Customize rail', exact: true }).click();
  const customize = page.getByRole('dialog', { name: 'Customize rail', exact: true });
  const files = customize.getByRole('button', { name: 'Drag Files in layout', exact: true });
  await expect(files).toBeInViewport();
  const before = await sectionOrder();
  await files.focus();
  // Empty sections stay hidden in the rail, so move Files until a visible neighbour passes it.
  for (let step = 0; step < 4 && (await sectionOrder()).join() === before.join(); step += 1) {
    await page.keyboard.press('Alt+ArrowDown');
    await expect(files).toBeFocused();
  }
  const expected = await sectionOrder();
  expect(expected.indexOf('Files section')).toBeGreaterThan(before.indexOf('Files section'));
  await page.keyboard.press('Escape');
  await expect(customize).toHaveCount(0);
  await expect(input).toHaveText('Keep this draft while I arrange the rail.');
  await page.reload();
  await openConversationRail(page);
  await expect.poll(sectionOrder).toEqual(expected);
});
