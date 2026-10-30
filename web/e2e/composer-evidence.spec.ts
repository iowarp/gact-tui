import { expect, test, type Page } from '@playwright/test';
import { showEvidenceRail } from './workspace-setup';

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

test('keeps response preparation in the transcript beside the evidence-layout launcher', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSession(page, 1280);
  const composer = page.locator('[data-slot="clio-composer-stack"]');
  const header = page.locator('[data-slot="workspace-header"]');
  await expect(
    header.getByRole('button', { name: 'Evidence layout: None', exact: true }),
  ).toBeVisible();
  await expect(composer.getByRole('button', { name: /^Evidence layout: /u })).toHaveCount(0);
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
  test(`separate rails preserve the draft and fit available space at ${width}px`, async ({
    page,
  }) => {
    await openSession(page, width);
    const composer = page.locator('[data-slot="clio-composer-stack"]');
    const input = composer.locator('[contenteditable="true"]');
    await input.fill('Keep this draft while I review the evidence.');
    const before = await composer.boundingBox();
    for (const kind of ['Session', 'Work'] as const) {
      const toggle = page.getByRole('button', { name: /^Evidence layout: /u });
      await showEvidenceRail(page, kind);
      const panel = page.getByRole('dialog', { name: 'Activity and evidence', exact: true });
      await expect(panel).toBeVisible();
      await expect(
        page.getByRole('region', {
          name: `${kind === 'Session' ? 'Work' : 'Session'} rail`,
          exact: true,
        }),
      ).toHaveCount(0);
      if (kind === 'Session') {
        await expect(
          panel.getByRole('region', { name: 'Artifacts section', exact: true }),
        ).toBeVisible();
        await expect(
          panel.getByRole('region', { name: 'Context section', exact: true }),
        ).toBeVisible();
        await expect(panel.getByRole('region', { name: 'Tasks section', exact: true })).toHaveCount(
          0,
        );
        await expect(panel.locator('[data-slot="artifact"]')).toHaveCount(0);
        await expect(panel.locator('[data-slot="artifact-rail-row"]')).toHaveCount(1);
      } else {
        await expect(
          panel.getByRole('region', { name: 'Context section', exact: true }),
        ).toHaveCount(0);
        await expect(
          panel.getByRole('region', { name: 'Artifacts section', exact: true }),
        ).toHaveCount(0);
      }
      const bounds = (await panel.boundingBox())!;
      const form = (await composer.locator('form').boundingBox())!;
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      if (width === 1920) {
        await expect(panel).toHaveAttribute('data-showcase-mode', 'docked');
        const column = (await page.locator('[data-slot="transcript-column"]').boundingBox())!;
        expect(bounds.x).toBeGreaterThan(column.x + column.width);
        expect(bounds.x).toBeGreaterThan(form.x + form.width);
      } else {
        await expect(panel).toHaveAttribute('data-showcase-mode', 'temporary');
        const launcher = (await toggle.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(launcher.y + launcher.height);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(form.y);
      }
      await panel
        .getByRole('button', { name: `Hide ${kind.toLowerCase()} rail`, exact: true })
        .click();
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
      expect(await composer.boundingBox()).toEqual(before);
      await expect(input).toContainText('Keep this draft while I review the evidence.');
      await showEvidenceRail(page, kind);
      await input.click();
      if (width === 1920) {
        await expect(panel).toBeVisible();
        await page.keyboard.press('Escape');
      }
      await expect(panel).toHaveCount(0);
      await showEvidenceRail(page, kind);
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
    }
  });
}

for (const kind of ['Session', 'Work'] as const) {
  test(`restores the ${kind} rail after canvas close and respects explicit dismissal`, async ({
    page,
  }) => {
    await openSession(page, 1920, 900, true);
    const toggle = page.getByRole('button', { name: /^Evidence layout: /u });
    const panel = page.getByRole('dialog', { name: 'Activity and evidence', exact: true });
    await showEvidenceRail(page, kind);
    await expect(panel).toHaveAttribute('data-showcase-mode', 'docked');
    const section = kind === 'Session' ? 'Context' : 'Todos';
    await panel.getByRole('button', { name: `Collapse ${section}`, exact: true }).click();
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('button', { name: `Expand ${section}`, exact: true }),
    ).toBeVisible();
    await panel
      .getByRole('button', { name: `Hide ${kind.toLowerCase()} rail`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
    await expect(panel).toHaveCount(0);
  });
}

for (const [width, height] of [
  [1280, 900],
  [640, 620],
  [390, 500],
]) {
  test(`dense rail scrolls as one panel and collapses without overflow at ${width}x${height}`, async ({
    page,
  }, testInfo) => {
    await openSession(page, width!, height!, true);
    for (const kind of ['Session', 'Work'] as const) {
      const toggle = page.getByRole('button', { name: /^Evidence layout: /u });
      await showEvidenceRail(page, kind);
      const panel = page.getByRole('dialog', { name: 'Activity and evidence', exact: true });
      await expect(panel).toHaveAttribute('data-showcase-mode', 'temporary');
      const scroll = panel.locator('[data-slot="evidence-regions"]');
      await expect
        .poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight))
        .toBe(true);
      while (await panel.getByRole('button', { name: /^Collapse / }).count())
        await panel
          .getByRole('button', { name: /^Collapse / })
          .first()
          .click();
      await expect
        .poll(() => scroll.evaluate((node) => node.scrollHeight <= node.clientHeight))
        .toBe(true);
      const bounds = (await panel.boundingBox())!;
      const composer = (await page
        .locator('[data-slot="clio-composer-stack"] form')
        .boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width!);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(composer.y);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${kind.toLowerCase()}-collapsed.png`) });
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
    }
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
  await showEvidenceRail(page, 'Work');
  await expect.poll(() => readHistory).toBe(true);
  const panel = page.getByRole('dialog', { name: 'Activity and evidence', exact: true });
  await expect(panel.getByRole('button', { name: 'Completed work', exact: true })).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: /^(?:Expand|Collapse) Background tasks$/ }),
  ).toHaveCount(0);
  await panel.screenshot({ path: testInfo.outputPath('empty-work-history.png') });
});

for (const [width, height] of [
  [640, 620],
  [390, 500],
]) {
  test(`combined evidence wheel reaches Work without collapsing Session at ${width}px`, async ({
    page,
  }, testInfo) => {
    await openSession(page, width!, height!, true);
    const launcher = page.getByRole('button', { name: /^Evidence layout: /u });
    for (let step = 0; step < 4; step++) {
      if ((await launcher.getAttribute('aria-label')) === 'Evidence layout: Both') break;
      await launcher.press('ArrowRight');
    }
    const panel = page.getByRole('dialog', { name: 'Activity and evidence', exact: true });
    await expect(panel).toHaveAttribute('data-showcase-mode', 'temporary');
    const scroll = panel.locator('[data-slot="evidence-regions"]');
    await expect
      .poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight))
      .toBe(true);
    expect(
      await panel
        .locator('[data-slot="session-rail-scroll"]')
        .evaluateAll((nodes) =>
          nodes.every((node) => !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)),
        ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`combined-session-${width}.png`) });
    await expect(panel.getByText('Review station 60', { exact: true })).toBeAttached();
    const bounds = (await scroll.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 40);
    await page.mouse.wheel(0, 10000);
    await expect(panel.getByText('Review station 60', { exact: true })).toBeInViewport();
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(
      panel.getByRole('button', { name: 'Collapse Context', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      panel.getByRole('button', { name: 'Collapse Connected sources', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: testInfo.outputPath(`combined-work-${width}.png`) });
  });
}
