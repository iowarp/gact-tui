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

test('opens children in tabs, uses Shift for the center, and fits evidence equally', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const worker = await (
    await page.request.post(`${fixtureEndpoint}/__test/subagent-navigation`)
  ).json();
  await page.goto(workspaceUrl);
  const layout = page.getByRole('button', { name: /^Evidence layout:/ });
  await layout.click();
  const evidence = page.getByLabel('Activity and evidence', { exact: true });
  await expect(evidence).toHaveAttribute('data-showcase-mode', 'docked');
  const parentWidth = await evidence.evaluate((element) => element.clientWidth);
  const child = evidence.getByRole('button', {
    name: 'Open child conversation Station analysis worker',
    exact: true,
  });
  await expect(child).not.toBeVisible();
  await evidence
    .getByRole('button', { name: 'Task details: Station analysis worker', exact: true })
    .click();
  await expect(child).toBeVisible();
  await child.click();
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await expect(canvas.getByRole('textbox', { name: 'Message this agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Close workspace canvas', exact: true }).click();
  await expect(evidence).toBeVisible();
  const reopenedDetails = evidence.getByRole('button', {
    name: 'Task details: Station analysis worker',
    exact: true,
  });
  if ((await reopenedDetails.getAttribute('aria-expanded')) !== 'true') {
    await reopenedDetails.click();
  }
  await expect(reopenedDetails).toHaveAttribute('aria-expanded', 'true');
  await expect(child).toBeVisible();
  await child.click({ modifiers: ['Shift'] });
  await expect(page).toHaveURL(new RegExp(`/sessions/${worker.id}$`));
  await expect(page.getByRole('textbox', { name: 'Message this agent' })).toBeVisible();
  await expect(evidence).toHaveAttribute('data-showcase-mode', 'docked');
  await expect.poll(async () => (await evidence.boundingBox())?.width).toBeCloseTo(parentWidth, 0);
  const bounds = await evidence.boundingBox();
  const composer = await page.locator('[data-evidence-composer]').boundingBox();
  expect(bounds!.x).toBeGreaterThan(composer!.x + composer!.width);
});

test('allows central child follow-ups while hiding user branching controls', async ({
  page,
}, testInfo) => {
  const response = await page.request.post(`${fixtureEndpoint}/__test/subagent-navigation`);
  const worker = await response.json();
  await page.goto(`/workspaces/ws_flat_ndp/sessions/${worker.id}`);
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation.getByText('Baseline complete.', { exact: true })).toBeVisible();
  await conversation.getByText('Baseline complete.', { exact: true }).hover();
  await expect(page.getByRole('button', { name: 'Branch from here', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Return to parent conversation/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Ask .+ to investigate/ })).toHaveCount(0);
  await page.getByRole('button', { name: `Actions for ${worker.title}`, exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Branch into a new session' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Share read-only link' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('subagent-actions.png') });
  await page.keyboard.press('Escape');

  const parentMessagesUrl = `${fixtureEndpoint}/v1/sessions/${worker.parent_session_id}/messages`;
  const parentBefore = (await (await page.request.get(parentMessagesUrl)).json()).messages;
  const followup = page.getByRole('textbox', { name: 'Message this agent' });
  await expect(followup).toBeVisible();
  await followup.fill('Check calibration without changing the raw export');
  const accepted = page.waitForResponse(
    (result) =>
      result.request().method() === 'POST' && result.url().endsWith(`/${worker.id}/messages`),
  );
  await followup.press('Enter');
  const receipt = await accepted;
  expect(receipt.ok()).toBe(true);
  expect(receipt.request().postDataJSON()).toMatchObject({
    delivery: 'auto',
    parts: [{ type: 'text', text: 'Check calibration without changing the raw export' }],
  });
  expect(receipt.request().postDataJSON()).not.toHaveProperty('model');
  await expect(page.getByText('Follow-up sent', { exact: true })).toBeVisible();
  expect((await (await page.request.get(parentMessagesUrl)).json()).messages).toEqual(parentBefore);
  await page.reload();
  await expect(followup).toBeVisible();
  await expect(
    conversation.getByText('Check calibration without changing the raw export', { exact: true }),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Open full details' }).click();
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
  await page.getByRole('button', { name: 'Open full details' }).click();
  await canvas.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await canvas.getByRole('button', { name: /^Artifacts/ }).click();
  await expect(canvas.getByRole('combobox', { name: 'Artifact category' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('artifact-filters-dark.png') });
});
