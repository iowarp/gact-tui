import { expect, test, type Page } from '@playwright/test';

// S6 gate 9 (docs/design/a2ui-compat-campaign-2026-09.md, issue #407): one
// Playwright smoke spec renders a real example against the fixture server,
// proving the registry-driven kernel catalog end to end in a real browser —
// not just the vitest/jsdom suite.

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
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

test('renders the Basic login-form example: text input works and the required check gates the button', async ({
  page,
}) => {
  await page.goto(workspaceUrl);

  // Wait for the live session stream to actually be connected before
  // publishing — an event fired before the client's SSE connection is open
  // has no subscriber and is lost (this fixture has no replay).
  await expect(
    page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
  ).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-login-form`);
  expect(published.ok()).toBe(true);

  // The fixture session carries a large pre-seeded, virtualized transcript
  // (shared with workspace.spec.ts); the surface has no owning message block
  // so it renders detached, past every seeded message — scroll the
  // conversation to its end so the virtualizer mounts it. The deferred host
  // (`DeferredA2UISurface`) always mounts a wrapper labelled exactly
  // "Generated UI surface" before its content is ready, so the wait targets
  // the rendered section's own label ("Generated UI, <kind>") — a bare
  // `^="Generated UI"` prefix would match the still-empty wrapper too.
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

  const email = page.getByLabel('Email');
  const password = page.getByLabel('Password');
  const submit = page.getByRole('button', { name: 'Sign in' });

  // The button's checks (valid email + password length >= 8) start unsatisfied
  // — see loginFormExampleMessages() in a2ui-fixtures.mjs for why these are
  // two independent CheckRules rather than the vendored example's own single
  // compound and() check.
  await expect(submit).toBeDisabled();

  await email.fill('scientist@earthscope.example');
  await password.fill('correct-horse-battery');

  await expect(email).toHaveValue('scientist@earthscope.example');
  await expect(submit).toBeEnabled();
});
