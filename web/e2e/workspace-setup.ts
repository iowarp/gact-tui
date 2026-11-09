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
