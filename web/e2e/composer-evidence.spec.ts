import { expect, test, type Page } from '@playwright/test';

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

test('keeps response preparation in the transcript beside separate Session and Work launchers', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSession(page, 1280);
  const composer = page.locator('[data-slot="clio-composer-stack"]');
  const header = page.locator('[data-slot="workspace-header"]');
  for (const name of ['Session rail', 'Work rail']) {
    await expect(header.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(composer.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
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
      const toggle = page.getByRole('button', { name: `${kind} rail`, exact: true });
      await toggle.click();
      const panel = page.getByRole('dialog', { name: `${kind} rail`, exact: true });
      await expect(panel).toBeVisible();
      await expect(
        page.getByRole('dialog', {
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
      await toggle.click();
      await input.click();
      if (width === 1920) {
        await expect(panel).toBeVisible();
        await page.keyboard.press('Escape');
      }
      await expect(panel).toHaveCount(0);
      await toggle.click();
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
    const toggle = page.getByRole('button', { name: `${kind} rail`, exact: true });
    const panel = page.getByRole('dialog', { name: `${kind} rail`, exact: true });
    await toggle.click();
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
      const toggle = page.getByRole('button', { name: `${kind} rail`, exact: true });
      await toggle.click();
      const panel = page.getByRole('dialog', { name: `${kind} rail`, exact: true });
      await expect(panel).toHaveAttribute('data-showcase-mode', 'temporary');
      const scroll = panel.locator('[data-slot="session-rail-scroll"]');
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
