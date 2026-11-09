import { expect, test, type Locator, type Page } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
export const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
export const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

/** The top-bar button that pins the floating conversation rail. */
export function conversationRailButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Conversation rail', exact: true });
}

/** The floating "This conversation" rail. */
export function conversationRail(page: Page): Locator {
  return page.getByRole('region', { name: 'This conversation', exact: true });
}

/** Open the conversation rail from the top bar, as a user would, and return it. */
export async function openConversationRail(page: Page): Promise<Locator> {
  const button = conversationRailButton(page);
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const rail = conversationRail(page);
  await expect(rail).toBeVisible();
  return rail;
}

/**
 * Close open notifications the way a user would. The fixture world always has
 * a session waiting for a response, so opening any other session raises a
 * top-center "Response needed" toast over the start of the transcript, and
 * sonner keeps a hovered toast open: a pointer action that lands under it
 * retries against the toast until the test times out.
 */
export async function closeNotifications(page: Page): Promise<void> {
  const notifications = page.getByRole('region', { name: /^Notifications/ });
  await expect(async () => {
    const close = notifications.getByRole('button', { name: 'Close toast' }).first();
    if ((await close.count()) > 0) await close.click({ timeout: 1_000 });
    await expect(notifications.getByRole('listitem')).toHaveCount(0, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/**
 * Open the workspace canvas and show one of its lists (Files, Sources,
 * Artifacts, Activity, ?) from the strip on its outer edge.
 */
export async function showWorkbenchList(page: Page, name: string): Promise<void> {
  const open = page.getByRole('button', { name: 'Open workspace canvas', exact: true });
  if (await open.isVisible()) await open.click();
  const item = page
    .getByRole('toolbar', { name: 'Workbench lists', exact: true })
    .getByRole('button', { name, exact: true });
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
  await expect(page.getByRole('region', { name: `${name} list`, exact: true })).toBeVisible();
}

/** Hide whichever list sits beside the canvas tabs, giving the open tab the full width. */
export async function hideWorkbenchList(page: Page): Promise<void> {
  const pressed = page
    .getByRole('toolbar', { name: 'Workbench lists', exact: true })
    .locator('button[aria-pressed="true"]');
  if ((await pressed.count()) === 0) return;
  await pressed.first().click();
  await expect(pressed).toHaveCount(0);
}

/** Reset the shared server and retain browser error checks for each workspace case. */
export function setupWorkspaceBrowser(): void {
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
}
