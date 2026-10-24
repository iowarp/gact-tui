import { expect, test } from '@playwright/test';
import { installSearchFixture } from './search-fixture.mjs';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const placeholder = 'Search work, files, artifacts, or actions…';

test('home search uses the default backend without selecting a connection, workspace or conversation', async ({
  page,
}) => {
  const fixture = await installSearchFixture(page, endpoint);
  await page.goto('/?intent=connect');
  await page.getByRole('button', { name: 'Search everywhere', exact: true }).click();
  const input = page.getByPlaceholder(placeholder);
  await expect(input).toBeFocused();
  await input.fill('Find the reviewer handoff');
  await expect(page.getByRole('button', { name: /^Ask .+ Search Tab$/u })).toBeEnabled();
  await input.press('Tab');
  const assistant = page.getByRole('textbox', { name: /^Ask .+ Search$/u });
  await expect(assistant).toBeFocused();
  await assistant.press('Enter');
  await expect(page.getByRole('link', { name: 'Read the archived notes' })).toBeVisible();
  expect(fixture.state.searchRequests).toEqual([{ workspace_id: fixture.workspace.id }]);
  expect(fixture.state.created).toBe(1);
  await expect(page).toHaveURL(/\/?\?intent=connect$/u);
});

test('global search applies themes from Settings and opens settings, hosts and exact agent definitions', async ({
  page,
}) => {
  await installSearchFixture(page, endpoint);
  const reviewer = {
    ref: 'user/global-reviewer',
    id: 'global-reviewer',
    name: 'Global Search Reviewer',
    description: 'Review global search evidence.',
    role: 'search-proof reviewer',
    kind: 'user',
  };
  await page.route('**/v1/agents', (route) => route.fulfill({ json: { agents: [reviewer] } }));
  // Agents are listed only on a service that composes them from plugins.
  await page.route('**/v1/capabilities', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.capabilities = { ...body.capabilities, x_clio_agent_plugins: true };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/settings/appearance');
  await page.getByRole('button', { name: 'Search everywhere', exact: true }).click();
  const input = page.getByPlaceholder(placeholder);
  await expect(input).toBeFocused();
  await page.keyboard.type('dark mode');
  await page.getByRole('option', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/u);
  await expect(page.locator('html')).toHaveClass(/dark/u);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('clio.appearance.v1') ?? '{}').theme),
  ).toBe('dark');
  await page.keyboard.press('Control+k');
  await input.fill('light mode');
  await page.getByRole('option', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveClass(/dark/u);
  await page.keyboard.press('Control+k');
  await input.fill('drive');
  await page.getByRole('option', { name: 'Data sources', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/data-sources$/u);
  await page.keyboard.press('Control+k');
  await input.fill('protected execution');
  await page.getByRole('option', { name: /hosts$/u }).click();
  await expect(page).toHaveURL(/\/infrastructure\/agent$/u);
  await page.keyboard.press('Control+k');
  await input.fill('search-proof');
  await page.getByRole('option', { name: /Global Search Reviewer/u }).click();
  await expect(page).toHaveURL(/\/settings\/agents#agent-user%2Fglobal-reviewer$/u);
  await expect(page.locator('[id="agent-user%2Fglobal-reviewer"]')).toBeFocused();
});

test('a file found from Settings opens in the remembered workspace canvas', async ({ page }) => {
  const fixture = await installSearchFixture(page, endpoint);
  await page.goto(`/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}`);
  await expect(page.getByText('Review the study protocol.', { exact: true })).toBeAttached();
  await page.goto('/settings/appearance');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(placeholder).fill('plant-study.md');
  await page.getByRole('option', { name: 'notes/plant-study.md', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${fixture.workspace.id}/sessions/${fixture.session.id}$`, 'u'),
  );
  await expect(
    page.getByRole('region', { name: 'Workspace file preview', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plant study notes', exact: true })).toBeVisible();
});

test('a file found from a new conversation retains its unsent draft and route', async ({
  page,
}) => {
  const fixture = await installSearchFixture(page, endpoint);
  const route = `/workspaces/${fixture.workspace.id}/new`;
  await page.goto(route);
  const composer = page.getByRole('combobox', { name: /Ask .+ to investigate/u });
  await composer.fill('Keep this unsent review draft.');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(placeholder).fill('plant-study.md');
  await page.getByRole('option', { name: 'notes/plant-study.md', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${route}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Plant study notes', exact: true })).toBeVisible();
  await expect(composer).toHaveText('Keep this unsent review draft.');
  expect(fixture.state.created).toBe(0);
});

test('the compact Settings menu hands focus to the shared global search', async ({ page }) => {
  await installSearchFixture(page, endpoint);
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/settings/general');
  await page.getByRole('button', { name: 'Choose settings section' }).click();
  await page.getByRole('menuitem', { name: 'Search everywhere from settings menu' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByPlaceholder(placeholder)).toBeFocused();
  await page.keyboard.type('dark');
  await expect(
    page.getByRole('option', { name: 'Switch to dark mode', exact: true }),
  ).toBeVisible();
});
