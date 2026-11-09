import { expect, test, type Page } from '@playwright/test';
import { conversationRail, conversationRailButton, openConversationRail } from './workspace-setup';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

async function openSession(page: Page, width: number, height = 900, dense = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    {
      data: { selected_options: ['table'] },
    },
  );
  if (dense) await page.request.post(`${endpoint}/__test/session-summary?density=both`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.setViewportSize({ width, height });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await expect(page.locator('[data-slot="transcript-column"]')).toBeVisible();
}

test('keeps response preparation in the transcript beside the conversation rail button', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSession(page, 1280);
  const composer = page.locator('[data-slot="clio-composer-stack"]');
  const header = page.locator('[data-slot="workspace-header"]');
  await expect(
    header.getByRole('button', { name: 'Conversation rail', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(composer.getByRole('button', { name: 'Conversation rail' })).toHaveCount(0);
  await expect(
    header.getByRole('button', { name: 'Open workspace canvas', exact: true }),
  ).toBeVisible();
  await page.request.post(`${endpoint}/__test/prepare-turn`, { data: { phase: 'start' } });
  const preparation = page.locator('[data-slot="turn-preparation"]');
  await expect(preparation).toHaveText('Preparing next response');
  await expect(
    page.getByRole('log', { name: 'Conversation' }).locator('[data-slot="turn-preparation"]'),
  ).toBeVisible();
  await expect(composer.locator('[data-slot="turn-preparation"]')).toHaveCount(0);
  const before = await composer.boundingBox();
  await page.request.post(`${endpoint}/__test/prepare-turn`, { data: { phase: 'token' } });
  await expect(preparation).toHaveCount(0);
  expect(await composer.boundingBox()).toEqual(before);
  expect(errors).toEqual([]);
});

for (const width of [1920, 1280, 390]) {
  test(`the pinned conversation rail preserves the draft and fits at ${width}px`, async ({
    page,
  }) => {
    await openSession(page, width);
    const composer = page.locator('[data-slot="clio-composer-stack"]');
    const input = composer.locator('[contenteditable="true"]');
    await input.fill('Keep this draft while I review the evidence.');
    const before = await composer.boundingBox();
    const toggle = conversationRailButton(page);
    const rail = await openConversationRail(page);
    await expect(rail.getByRole('heading', { name: 'This conversation' })).toBeVisible();
    for (const section of ['Context', 'Artifacts'])
      await expect(
        rail.getByRole('region', { name: `${section} section`, exact: true }),
      ).toBeVisible();
    await expect(rail.locator('[data-slot="artifact"]')).toHaveCount(0);
    const bounds = (await rail.boundingBox())!;
    const launcher = (await toggle.boundingBox())!;
    expect(await rail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(launcher.y + launcher.height);
    // The rail floats over the transcript; the composer keeps its place and draft.
    expect(await composer.boundingBox()).toEqual(before);
    // Pinned: working in the composer leaves it open.
    await input.click();
    await expect(rail).toBeVisible();
    await toggle.click();
    await expect(rail).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toContainText('Keep this draft while I review the evidence.');
    await openConversationRail(page);
    await rail.getByRole('button', { name: /^(?:Expand|Collapse) Context$/ }).focus();
    await page.keyboard.press('Escape');
    await expect(rail).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await input.click();
    await page.keyboard.press('Control+.');
    await expect(rail).toBeVisible();
    await page.keyboard.press('Control+.');
    await expect(rail).toHaveCount(0);
    expect(await composer.boundingBox()).toEqual(before);
  });
}

test('the rail and its collapsed sections persist across canvas and reload', async ({ page }) => {
  await openSession(page, 1920, 900, true);
  const rail = await openConversationRail(page);
  await rail.getByRole('button', { name: 'Collapse Todos', exact: true }).click();
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Expand Todos', exact: true })).toBeVisible();
  await page.reload();
  await expect(conversationRail(page)).toBeVisible();
  await expect(
    conversationRail(page).getByRole('button', { name: 'Expand Todos', exact: true }),
  ).toBeVisible();
  await conversationRailButton(page).click();
  await page.reload();
  await expect(page.locator('[data-slot="transcript-column"]')).toBeVisible();
  await expect(conversationRail(page)).toHaveCount(0);
});

for (const [width, height] of [
  [1280, 900],
  [640, 620],
  [390, 500],
]) {
  test(`dense rail scrolls as one panel and collapses without overflow at ${width}x${height}`, async ({
    page,
  }, testInfo) => {
    await openSession(page, width!, height!, true);
    const rail = await openConversationRail(page);
    await expect
      .poll(() => rail.evaluate((node) => node.scrollHeight > node.clientHeight))
      .toBe(true);
    expect(
      await rail
        .locator('[data-slot="session-rail-scroll"]')
        .evaluateAll((nodes) =>
          nodes.every((node) => !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)),
        ),
    ).toBe(true);
    await expect(rail.getByText('Review station 60', { exact: true })).toBeAttached();
    const scrollBounds = (await rail.boundingBox())!;
    await page.mouse.move(scrollBounds.x + scrollBounds.width / 2, scrollBounds.y + 60);
    await page.mouse.wheel(0, 10000);
    await expect(rail.getByText('Review station 60', { exact: true })).toBeInViewport();
    expect(await rail.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`rail-dense-${width}.png`) });
    while (await rail.getByRole('button', { name: /^Collapse / }).count())
      await rail
        .getByRole('button', { name: /^Collapse / })
        .first()
        .click();
    await expect
      .poll(() => rail.evaluate((node) => node.scrollHeight <= node.clientHeight))
      .toBe(true);
    const bounds = (await rail.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width!);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height!);
    expect(await rail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`rail-collapsed-${width}.png`) });
    await conversationRailButton(page).click();
    await expect(rail).toHaveCount(0);
  });
}

test('an empty bounded history does not leave a Completed work category', async ({
  page,
}, testInfo) => {
  let readHistory = false;
  await page.route('**/v1/sessions/*/async-processes*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('active_only') === 'false')
      readHistory = true;
    await route.fulfill({ json: { processes: [], cursor: null, total: 0, revision: 1 } });
  });
  await page.route('**/v1/sessions/*/agent-tasks*', (route) =>
    route.fulfill({ json: { tasks: [], cursor: null, total: 0, revision: 1 } }),
  );
  // The base transcript fixture records a completed child; this case has no such history.
  await page.route('**/v1/sessions/*/messages*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, subagents: [] } });
  });
  await openSession(page, 640, 620);
  const panel = await openConversationRail(page);
  await expect.poll(() => readHistory).toBe(true);
  await expect(panel.getByRole('button', { name: 'Completed work', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('region', { name: 'Tasks section', exact: true })).toHaveCount(0);
  await panel.screenshot({ path: testInfo.outputPath('empty-work-history.png') });
});
