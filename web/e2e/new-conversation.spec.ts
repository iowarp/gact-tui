import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
const draftRoute = '/workspaces/ws_flat_ndp/new';
const sessionRoute = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

test('entry composer and Settings navigation never allocate sessions', async ({ page }) => {
  const reset = await page.request.post(`${endpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  const sessionCreations: string[] = [];
  const warmups: string[] = [];
  await page.route(`${endpoint}/v1/capabilities`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.capabilities.x_clio_workspace_warmup = true;
    await route.fulfill({ response, json: body });
  });
  await page.route(`${endpoint}/v1/workspaces/*/warmup`, async (route) => {
    warmups.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 202, json: { status: 'warming' } });
  });
  const errors: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/sessions') {
      sessionCreations.push(request.postData() ?? '');
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${draftRoute}$`));
  const composer = page.getByRole('combobox', { name: /Ask .+ to investigate/ });
  await expect(composer).toBeEnabled();
  await expect.poll(() => warmups.length).toBe(1);
  expect(warmups[0]).toBe('/v1/workspaces/ws_flat_ndp/warmup');
  await expect(page.getByRole('combobox', { name: 'Conversation workspace' })).toHaveValue(
    'ws_flat_ndp',
  );
  await page.getByRole('button', { name: 'Open workspace canvas' }).click();
  await expect(page.getByRole('tab', { name: 'Files', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open a canvas tab' }).click();
  await page.getByRole('menuitem', { name: 'Agent blueprints' }).click();
  await expect(page.getByRole('tab', { name: 'Blueprints', exact: true })).toBeVisible();
  expect(sessionCreations).toEqual([]);
  await page.getByRole('button', { name: 'Close workspace canvas' }).click();
  await composer.fill('This is a temporary draft');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await page.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${draftRoute}$`));
  await expect(composer).toHaveText('');
  await expect.poll(() => warmups.length).toBe(2);

  await page.getByRole('link', { name: /^EarthScope NDP evidence review/ }).click();
  await expect(page).toHaveURL(new RegExp(`${sessionRoute}$`));
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await page.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${sessionRoute}$`));
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${sessionRoute}$`));
  expect(sessionCreations).toEqual([]);
  expect(warmups).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('draft remains usable when background preparation fails', async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  await page.route(`${endpoint}/v1/capabilities`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.capabilities.x_clio_workspace_warmup = true;
    await route.fulfill({ response, json: body });
  });
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${endpoint}/v1/workspaces/*/warmup`, async (route) => {
    await waiting;
    await route.fulfill({ status: 503, json: { error: 'Service is starting' } });
  });
  let creations = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/sessions')
      creations += 1;
  });
  await page.goto('/');
  const composer = page.getByRole('combobox', { name: /Ask .+ to investigate/ });
  await expect(composer).toBeEnabled();
  await composer.fill('Still able to compose while tools start');
  release();
  await expect(page.getByText(/Tools could not be prepared in advance/)).toBeVisible();
  await expect(composer).toBeEnabled();
  expect(creations).toBe(0);
});

test('first send creates exactly one session and negotiates interactive UI before delivery', async ({
  page,
}) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  // Use the fixture's session-scoped read endpoints, with a fresh lifecycle
  // and transcript so the browser must actually create and send to this session.
  const session = {
    id: 'sess_flat_ndp',
    workspace_id: 'ws_flat_ndp',
    title: 'New conversation',
    state: 'completed',
    mode: 'edit',
    routing_mode: 'auto',
    approval_mode: 'ask',
    created_at: '2026-10-03T12:00:00Z',
    updated_at: '2026-10-03T12:00:00Z',
    provider_id: 'codex',
    model_id: 'gpt-5.6-luna',
    message_count: 0,
  };
  let created = false;
  let creationCount = 0;
  let messageCount = 0;
  const messageText = 'Inspect my workspace after this first message.';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route(`${endpoint}/v1/sessions?*`, (route) =>
    route.fulfill({ json: { sessions: created ? [session] : [] } }),
  );
  await page.route(`${endpoint}/v1/sessions`, async (route) => {
    if (route.request().method() === 'POST') {
      creationCount += 1;
      expect(route.request().postDataJSON()).toMatchObject({
        workspace_id: 'ws_flat_ndp',
        title: 'New conversation',
      });
      created = true;
      await route.fulfill({ json: session });
    } else await route.fulfill({ json: { sessions: created ? [session] : [] } });
  });
  await page.route(`${endpoint}/v1/sessions/sess_flat_ndp/messages`, async (route) => {
    if (route.request().method() === 'POST') {
      expect(created).toBe(true);
      const body = route.request().postDataJSON();
      expect(body.parts).toEqual([{ type: 'text', text: messageText }]);
      expect(
        body.metadata.a2uiClientCapabilities['v0.9'].supportedCatalogIds.length,
      ).toBeGreaterThan(0);
      messageCount += 1;
      session.message_count = messageCount;
      await route.fulfill({
        json: {
          message_id: 'first_message',
          accepted_at: session.created_at,
          delivery: 'start',
          state: 'started',
          effective_model: body.model,
          behavior: body.behavior,
          idempotent_replay: false,
        },
      });
    } else
      await route.fulfill({
        json: {
          messages: messageCount
            ? [
                {
                  id: 'first_message',
                  session_id: session.id,
                  role: 'user',
                  created_at: session.created_at,
                  blocks: [{ id: 'first_text', type: 'text', text: messageText }],
                },
              ]
            : [],
          tools: [],
          tasks: [],
          subagents: [],
          artifacts: [],
          surfaces: [],
        },
      });
  });
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${draftRoute}$`));
  expect(creationCount).toBe(0);
  await page.getByRole('combobox', { name: /Ask .+ to investigate/ }).fill(messageText);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${sessionRoute}$`));
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText(messageText, { exact: true }),
  ).toBeVisible();
  expect(creationCount).toBe(1);
  expect(messageCount).toBe(1);
  expect(errors).toEqual([]);
});
