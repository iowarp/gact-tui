import { expect, test, type Page } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
export const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
export const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

/** Select a rail through the shipped evidence-layout keyboard control. */
export async function showEvidenceRail(page: Page, kind: 'Session' | 'Work'): Promise<void> {
  const launcher = page.getByRole('button', { name: /^Evidence layout: /u });
  const desired = `Evidence layout: ${kind === 'Session' ? 'Top' : 'Bottom'}`;
  for (let step = 0; step < 4; step += 1) {
    if (
      (await launcher.getAttribute('aria-label')) === desired &&
      (await launcher.getAttribute('aria-expanded')) === 'true'
    )
      break;
    await launcher.press('ArrowRight');
  }
  await expect(launcher).toHaveAttribute('aria-label', desired);
  await expect(page.getByRole('region', { name: `${kind} rail`, exact: true })).toBeVisible();
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
