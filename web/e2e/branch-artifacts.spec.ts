import { expect, test } from '@playwright/test';

const fixtureEndpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post(`${fixtureEndpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'light');
  }, fixtureEndpoint);
});

test('branches from a message with a composer, keeps its parent link, and reopens from navigation', async ({
  page,
}, testInfo) => {
  await page.request.post(`${fixtureEndpoint}/__test/branch-navigation`);
  await page.goto(workspaceUrl);
  const original = await page.request.get(`${fixtureEndpoint}/v1/sessions/sess_flat_ndp/messages`);
  const before = (await original.json()).messages.length;
  const forkResponse = page.waitForResponse((response) => response.url().endsWith('/fork'));
  await page.getByRole('button', { name: 'Branch from here', exact: true }).first().press('Enter');
  const branch = await (await forkResponse).json();
  await expect(page).toHaveURL(new RegExp(`/sessions/${branch.id}$`));
  await expect(page.getByText('Loading conversation', { exact: true })).toHaveCount(0);
  const composer = page.getByRole('combobox', { name: /^Ask .+ to investigate/ });
  await expect(composer).toBeVisible();
  await expect(page.getByRole('button', { name: /Return to parent conversation/ })).toBeVisible();
  await composer.fill('Independent branch follow-up');
  const sent = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith(`/${branch.id}/messages`),
  );
  await composer.press('Enter');
  expect((await sent).status()).toBe(202);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect
    .poll(async () => {
      await conversation.evaluate((element) =>
        element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
      );
      return conversation.textContent();
    })
    .toContain('Independent branch follow-up');
  const after = await page.request.get(`${fixtureEndpoint}/v1/sessions/sess_flat_ndp/messages`);
  await expect(page.getByText('Read the station evidence table', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Which evidence view should remain primary?', { exact: true }),
  ).toHaveCount(0);
  expect((await after.json()).messages.length).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('writable-branch.png') });
  await page.getByRole('button', { name: /Return to parent conversation/ }).click();
  await expect(page).toHaveURL(/sessions\/sess_flat_ndp$/);
  const branchLink = page.getByRole('link').filter({ hasText: branch.title });
  await expect(page.getByText('Read the station evidence table', { exact: true })).toBeVisible();
  await expect(branchLink).toBeVisible();
  await branchLink.click();
  await expect(composer).toBeVisible();
  await page.reload();
  await expect(composer).toBeVisible();
});

test('filters the evidence artifact list by scripts and 3D models in both themes', async ({
  page,
}, testInfo) => {
  await page.request.post(`${fixtureEndpoint}/__test/artifact-navigation`);
  await page.goto(workspaceUrl);
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open observability in workspace canvas' }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await canvas.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await canvas.getByRole('button', { name: /^Artifacts/ }).click();
  const category = canvas.getByRole('combobox', { name: 'Artifact category' });
  await expect(category).toBeVisible();
  await category.click();
  await page.getByRole('option', { name: 'Scripts (1)' }).click();
  await expect(canvas.getByRole('button', { name: 'Open collect_sweep.py' })).toBeVisible();
  await expect(canvas.getByRole('button', { name: 'Open optimized_iso0.5.glb' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('artifact-filters-light.png') });
  await category.click();
  await page.getByRole('option', { name: '3D models (1)' }).click();
  await expect(canvas.getByRole('button', { name: 'Open optimized_iso0.5.glb' })).toBeVisible();
  await canvas.getByRole('searchbox', { name: 'Search artifacts' }).fill('missing');
  await expect(canvas.getByText('No artifacts match these filters.')).toBeVisible();
  await canvas.getByRole('button', { name: 'Clear filters' }).click();
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: /^Evidence layout:/ }).click();
  await page.getByRole('button', { name: 'Open observability in workspace canvas' }).click();
  await canvas.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await canvas.getByRole('button', { name: /^Artifacts/ }).click();
  await expect(canvas.getByRole('combobox', { name: 'Artifact category' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('artifact-filters-dark.png') });
});
