import { expect, test, type Page } from '@playwright/test';

// S8 gact-tui#409 item 2: the server-truth footer
// (`a2ui-action-lifecycle.tsx`) wired into the transcript surface — words for
// every `a2ui.action.received|delivered|consumed|failed|duplicate` state,
// never a dot or colour alone, and the pre-S5 optimistic "Sending action"
// header stays only while the mutation is pending.

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const surfaceId = 'gallery-login-form';
const unexpectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const reset = await page.request.post(`${fixtureEndpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    try {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    } catch {
      // MCP Apps intentionally use an opaque inner origin without storage access.
    }
  }, fixtureEndpoint);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedErrors.get(page) ?? []).toEqual([]);
});

async function publishLifecycle(
  page: Page,
  status: 'received' | 'delivered' | 'consumed' | 'failed' | 'duplicate',
  extra: Record<string, unknown> = {},
) {
  const response = await page.request.post(`${fixtureEndpoint}/__test/a2ui-action-lifecycle`, {
    data: { surface_id: surfaceId, action_name: 'login', status, ...extra },
  });
  expect(response.ok()).toBe(true);
}

test('wires the lifecycle footer into the transcript surface, worded for every state', async ({
  page,
}) => {
  await page.goto(workspaceUrl);
  await expect(
    page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
  ).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-login-form`);
  expect(published.ok()).toBe(true);

  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toBeVisible();
  const surfaceSection = page.locator('[aria-label^="Generated UI,"]');
  await expect
    .poll(async () => {
      await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      return surfaceSection.count();
    })
    .toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await test.step('no lifecycle is known before an action is sent', async () => {
    for (const phrase of [
      'login received by the agent',
      "login delivered to the agent's turn",
      'login applied',
      'login failed',
      'login ignored as a duplicate',
    ]) {
      await expect(page.getByText(phrase)).toHaveCount(0);
    }
  });

  await test.step('the optimistic "Sending action" header shows only while the mutation is pending', async () => {
    await page.getByLabel('Email').fill('scientist@earthscope.example');
    await page.getByLabel('Password').fill('correct-horse-battery');
    const submit = page.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(surfaceSection.getByText('Sending action')).toBeVisible();
    await expect(surfaceSection.getByText('Sending action')).toHaveCount(0, { timeout: 5_000 });
  });

  await test.step('received', async () => {
    await publishLifecycle(page, 'received');
    await expect(page.getByText('login received by the agent')).toBeVisible();
  });

  await test.step('delivered', async () => {
    await publishLifecycle(page, 'delivered');
    await expect(page.getByText("login delivered to the agent's turn")).toBeVisible();
  });

  await test.step('consumed', async () => {
    await publishLifecycle(page, 'consumed');
    await expect(page.getByText('login applied')).toBeVisible();
  });

  await test.step('failed, with the reason worded inline', async () => {
    await publishLifecycle(page, 'failed', { reason: 'busy turn' });
    await expect(page.getByText('login failed: busy turn')).toBeVisible();
  });

  await test.step('duplicate', async () => {
    await publishLifecycle(page, 'duplicate');
    await expect(page.getByText('login ignored as a duplicate')).toBeVisible();
  });
});
