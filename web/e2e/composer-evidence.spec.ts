import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('keeps response preparation in the transcript and evidence beside the composer controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.request.post(`${endpoint}/v1/permissions/perm_fixture`);
  await page.request.post(
    `${endpoint}/v1/sessions/sess_flat_ndp/questions/question_fixture/answer`,
    {
      data: { selected_options: ['table'] },
    },
  );
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  const composer = page.locator('[data-slot="clio-composer-stack"]');
  const activity = page.getByRole('button', { name: /^Evidence layout:/ });
  await expect(activity).toBeVisible();
  await expect(composer.getByText('Working on your request')).toHaveCount(0);
  await expect(composer.getByText('Session details')).toHaveCount(0);
  await page.request.post(`${endpoint}/__test/prepare-turn`, { data: { phase: 'start' } });
  const preparation = page.locator('[data-slot="turn-preparation"]');
  await expect(preparation).toHaveText('Preparing next response');
  await expect(
    page.getByRole('log', { name: 'Conversation' }).locator('[data-slot="turn-preparation"]'),
  ).toBeVisible();
  await expect(composer.locator('[data-slot="turn-preparation"]')).toHaveCount(0);
  const preparationComposer = await composer.boundingBox();
  await page.request.post(`${endpoint}/__test/prepare-turn`, { data: { phase: 'token' } });
  await expect(preparation).toHaveCount(0);
  expect(await composer.boundingBox()).toEqual(preparationComposer);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(activity).toBeVisible();
    const input = composer.locator('[contenteditable="true"]');
    await input.fill('Keep this draft while I review the evidence.');
    const before = await composer.boundingBox();
    await activity.click();
    await activity.click();
    await activity.click();
    const panel = page.getByRole('dialog', { name: 'Activity and evidence' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Progress and outputs', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Outputs, 1 recorded' })).toBeVisible();
    const outputs = await panel.getByRole('button', { name: 'Outputs, 1 recorded' }).boundingBox();
    const inputs = await panel.getByText('Used in this session', { exact: true }).boundingBox();
    expect(outputs!.y).toBeLessThan(inputs!.y);
    const bounds = await panel.boundingBox();
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const row of await panel.locator('.group\\/artifact').all()) {
      expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await panel.getByRole('button', { name: 'Hide activity and evidence' }).click();
    await expect(panel).toHaveCount(0);
    await expect(activity).toBeFocused();
    expect(await composer.boundingBox()).toEqual(before);
    await expect(input).toContainText('Keep this draft while I review the evidence.');
    expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await activity.click({ button: 'right' });
    await expect(activity).toHaveAttribute('data-evidence-layout', 'both');
    await panel.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
    });
    const both = await panel.boundingBox();
    await activity.click({ button: 'right' });
    await expect(activity).toHaveAttribute('data-evidence-layout', 'top');
    expect(await panel.boundingBox()).toEqual(both);
    await expect(panel.getByText('Used in this session', { exact: true })).toHaveCount(0);
    await activity.click({ button: 'right' });
    await expect(activity).toHaveAttribute('data-evidence-layout', 'bottom');
    expect(await panel.boundingBox()).toEqual(both);
    await expect(panel.getByRole('button', { name: 'Outputs, 1 recorded' })).toHaveCount(0);
    await activity.click({ button: 'right' });
    await expect(activity).toHaveAttribute('data-evidence-layout', 'none');
    await expect(panel).toHaveCount(0);
    await activity.click();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(activity).toHaveAttribute('data-evidence-layout', 'bottom');
    await page.keyboard.press('ArrowLeft');
    await expect(activity).toHaveAttribute('data-evidence-layout', 'none');
  }
  expect(errors).toEqual([]);
});
